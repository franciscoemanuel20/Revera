-- Rate limit atômico entre instâncias para chamadas públicas que consomem
-- cotas externas (ex.: consulta MyDHL). Nenhum IP ou identificador de sessão
-- é armazenado em claro; a aplicação envia SHA-256.
create table if not exists public.public_rate_limit_buckets (
  scope text not null check (scope ~ '^[a-z0-9_-]{1,64}$'),
  client_hash text not null check (client_hash ~ '^[a-f0-9]{64}$'),
  bucket_start timestamptz not null,
  hit_count integer not null check (hit_count > 0),
  expires_at timestamptz not null,
  primary key (scope, client_hash, bucket_start)
);

create index if not exists public_rate_limit_buckets_expiry
  on public.public_rate_limit_buckets (expires_at);

alter table public.public_rate_limit_buckets enable row level security;
revoke all on table public.public_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_public_rate_limit(
  p_scope text,
  p_client_hash text,
  p_maximum integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket_start timestamptz;
  v_hit_count integer;
begin
  if p_scope !~ '^[a-z0-9_-]{1,64}$'
     or p_client_hash !~ '^[a-f0-9]{64}$'
     or p_maximum < 1 or p_maximum > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate-limit arguments' using errcode = '22023';
  end if;

  v_bucket_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.public_rate_limit_buckets as buckets
    (scope, client_hash, bucket_start, hit_count, expires_at)
  values
    (p_scope, p_client_hash, v_bucket_start, 1,
      v_bucket_start + make_interval(secs => p_window_seconds + 86400))
  on conflict (scope, client_hash, bucket_start)
  do update set hit_count = buckets.hit_count + 1
    where buckets.hit_count < p_maximum
  returning hit_count into v_hit_count;

  -- Limpeza limitada por chamada para manter a tabela pequena sem lockar
  -- nem varrer toda a tabela de uma vez.
  delete from public.public_rate_limit_buckets
  where ctid in (
    select expired.ctid
    from public.public_rate_limit_buckets as expired
    where expired.expires_at < v_now
    order by expired.expires_at
    limit 100
  );

  if v_hit_count is not null then
    return query select true, 0;
  else
    return query select false, greatest(
      1,
      ceil(extract(epoch from (v_bucket_start + make_interval(secs => p_window_seconds) - v_now)))::integer
    );
  end if;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, integer, integer)
  to service_role;

comment on table public.public_rate_limit_buckets is
  'Buckets temporários de limites públicos compartilhados; identificadores são hashes e expiram após janela + 24h.';
