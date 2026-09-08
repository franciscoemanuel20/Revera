-- ===========================================================================
-- LIBERACAO ATOMICA DE RESERVA TRAVADA (08/09/2026)
-- ===========================================================================
-- Copia ASCII de supabase/migrations/00000000000017_liberar_reserva_atomico.sql,
-- pronta para colar no SQL Editor do Supabase (colar acento pelo Chrome
-- corrompe o texto).
--
-- O que isto faz: cria uma funcao que confere pendente + sem checkout_url
-- (NULL ou ausente da chave) + nenhum evento de recuperacao, e apaga a
-- reserva -- tudo num statement so, sem intervalo de corrida entre checar e
-- apagar. Sem efeito colateral em nada que ja existe: e uma funcao NOVA,
-- nao mexe em tabela nenhuma.
-- ===========================================================================

create or replace function liberar_reserva_travada(p_payment_id uuid, p_order_id uuid)
returns table (id uuid)
language sql
as $$
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
$$;

grant execute on function liberar_reserva_travada(uuid, uuid) to authenticated;
