-- ===========================================================================
-- LIBERACAO ATOMICA DE RESERVA TRAVADA (08/09/2026)
-- ===========================================================================
-- Copia ASCII de supabase/migrations/00000000000017_liberar_reserva_atomico.sql,
-- pronta para colar no SQL Editor do Supabase (colar acento pelo Chrome
-- corrompe o texto).
--
-- O que isto faz: duas funcoes que usam o MESMO advisory lock (namespace
-- 917341, chave = payment_id) para serializar de verdade a liberacao manual
-- de uma reserva travada (admin) contra a gravacao da recuperacao do link
-- (checkout) -- quem pegar o lock primeiro termina antes de a outra sequer
-- comecar. Sem efeito colateral em nada que ja existe: sao funcoes NOVAS,
-- nao mexem em tabela nenhuma.
-- ===========================================================================

create or replace function liberar_reserva_travada(p_payment_id uuid, p_order_id uuid)
returns table (id uuid)
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(917341, hashtext(p_payment_id::text));

  return query
    delete from payments
    where payments.id = p_payment_id
      and payments.order_id = p_order_id
      and payments.status = 'pending'
      and (payments.raw_response is null or payments.raw_response ->> 'checkout_url' is null)
      and not exists (
        select 1 from payment_events
        where payment_events.payment_id = payments.id
          and payment_events.event_type = 'checkout_link_recovery'
      )
    returning payments.id;
end;
$$;

grant execute on function liberar_reserva_travada(uuid, uuid) to authenticated;

create or replace function gravar_recuperacao_link(
  p_payment_id uuid,
  p_provider text,
  p_checkout_url text,
  p_provider_payment_id text
)
returns table (gravado boolean)
language plpgsql
as $$
declare
  v_existe boolean;
begin
  perform pg_advisory_xact_lock(917341, hashtext(p_payment_id::text));

  select exists(
    select 1 from payments where payments.id = p_payment_id and payments.status = 'pending'
  ) into v_existe;

  if not v_existe then
    return query select false;
    return;
  end if;

  insert into payment_events (payment_id, provider, provider_event_id, event_type, payload)
  values (
    p_payment_id,
    p_provider,
    'checkout-link:' || p_payment_id::text,
    'checkout_link_recovery',
    jsonb_build_object('checkout_url', p_checkout_url, 'provider_payment_id', p_provider_payment_id)
  )
  on conflict (provider, provider_event_id) do nothing;

  return query select true;
end;
$$;

grant execute on function gravar_recuperacao_link(uuid, text, text, text) to service_role;
