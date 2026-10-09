-- Reserva recuperável; não envia mensagens e não habilita transporte.
alter table public.order_notifications
  add column confirmation_generation integer not null default 0,
  add column confirmation_had_uncertain_attempt boolean not null default false,
  add column confirmation_payload jsonb,
  add column confirmation_first_attempt_at timestamptz,
  add column confirmation_lease uuid,
  add column confirmation_lease_until timestamptz,
  add column confirmation_next_attempt_at timestamptz not null default now(),
  -- Inserções do emissor antigo durante deploy/rollback têm resultado desconhecido.
  add column confirmation_review_required boolean not null default true;
-- Resultado histórico desconhecido: não reenvie além da janela do provedor.
update public.order_notifications set confirmation_review_required = true,
  last_error = coalesce(last_error, 'Envio histórico sem resultado comprovado; reconciliar antes de reenviar')
where kind = 'confirmacao_cliente' and sent_at is null;

create or replace function public.reserve_paid_confirmations(p_order_id uuid default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into order_notifications(order_id, kind, channel, confirmation_review_required)
  select o.id, 'confirmacao_cliente', 'email', false from orders o
  join customers c on c.id = o.customer_id
  where o.payment_status = 'paid' and o.canceled_at is null
    and (p_order_id is null or o.id = p_order_id)
    and position('@' in coalesce(c.email,'')) > 1
  on conflict(order_id, kind) do nothing;
$$;

create or replace function public.claim_paid_confirmation(p_order_id uuid, p_payload jsonb)
returns table(lease uuid, payload jsonb) language plpgsql security definer
set search_path = public, pg_temp as $$
declare q order_notifications; token uuid; message jsonb;
begin
  select * into q from order_notifications where order_id = p_order_id
    and kind = 'confirmacao_cliente' for update;
  if not found or q.sent_at is not null or q.confirmation_review_required
    or q.confirmation_lease_until > clock_timestamp()
    or q.confirmation_next_attempt_at > clock_timestamp()
    or not exists(select 1 from orders where id = p_order_id
      and payment_status = 'paid' and canceled_at is null) then return; end if;
  if q.confirmation_first_attempt_at < clock_timestamp() - interval '20 hours' then
    update order_notifications set confirmation_review_required = true,
      last_error = 'Resultado de envio incerto fora da janela segura; reconciliar com o provedor'
      where id = q.id;
    return;
  end if;
  if coalesce(q.confirmation_payload, p_payload) is null then return; end if;
  token := gen_random_uuid();
  message := coalesce(q.confirmation_payload, p_payload || jsonb_build_object('idempotencyKey',
    'revera-confirmacao-cliente:' || p_order_id::text || ':' || q.confirmation_generation::text));
  update order_notifications set confirmation_lease = token,
    confirmation_lease_until = clock_timestamp() + interval '10 minutes',
    confirmation_had_uncertain_attempt = confirmation_had_uncertain_attempt or confirmation_first_attempt_at is not null,
    confirmation_payload = message,
    confirmation_first_attempt_at = coalesce(confirmation_first_attempt_at, clock_timestamp()),
    attempts = attempts + 1 where id = q.id;
  return query select token, message;
end $$;

create or replace function public.finish_paid_confirmation(p_order_id uuid, p_lease uuid,
  p_sent boolean, p_provider_id text, p_error text, p_definite_failure boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update order_notifications set sent_at = case when p_sent then clock_timestamp() else sent_at end,
    provider_message_id = case when p_sent then p_provider_id else provider_message_id end,
    last_error = case when p_sent then null else left(p_error,500) end,
    confirmation_first_attempt_at = case when p_definite_failure and not p_sent and not confirmation_had_uncertain_attempt then null
      else confirmation_first_attempt_at end,
    confirmation_payload = case when p_definite_failure and not p_sent and not confirmation_had_uncertain_attempt
      then null else confirmation_payload end,
    confirmation_generation = confirmation_generation + case when p_definite_failure and not p_sent
      and not confirmation_had_uncertain_attempt then 1 else 0 end,
    confirmation_next_attempt_at = clock_timestamp() + interval '5 minutes',
    confirmation_lease = null, confirmation_lease_until = null
    where order_id = p_order_id and kind = 'confirmacao_cliente'
      and confirmation_lease = p_lease and sent_at is null;
  return found;
end $$;
revoke all on function public.reserve_paid_confirmations(uuid) from public, anon, authenticated;
revoke all on function public.claim_paid_confirmation(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.finish_paid_confirmation(uuid,uuid,boolean,text,text,boolean) from public, anon, authenticated;
grant execute on function public.reserve_paid_confirmations(uuid) to service_role;
grant execute on function public.claim_paid_confirmation(uuid,jsonb) to service_role;
grant execute on function public.finish_paid_confirmation(uuid,uuid,boolean,text,text,boolean) to service_role;

create or replace function public.paid_confirmation_candidates()
returns table(order_id uuid) language sql security definer set search_path=public,pg_temp as $$
  select q.order_id from order_notifications q
  join orders o on o.id=q.order_id join customers c on c.id=o.customer_id
  where q.kind='confirmacao_cliente' and q.sent_at is null
    and not q.confirmation_review_required and o.payment_status='paid' and o.canceled_at is null
    and position('@' in coalesce(c.email,''))>1
    and q.confirmation_next_attempt_at <= clock_timestamp()
    and (q.confirmation_lease_until is null or q.confirmation_lease_until <= clock_timestamp())
  order by q.confirmation_next_attempt_at,q.order_id limit 10;
$$;
revoke all on function public.paid_confirmation_candidates() from public,anon,authenticated;
grant execute on function public.paid_confirmation_candidates() to service_role;
