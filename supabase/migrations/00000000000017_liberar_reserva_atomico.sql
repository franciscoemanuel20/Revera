-- ===========================================================================
-- LIBERAÇÃO ATÔMICA DE RESERVA TRAVADA (08/09/2026)
-- ===========================================================================
-- `liberarReservaTravadaAction` (src/app/admin/(protected)/pedidos/actions.ts)
-- lia `payments.raw_response` e `payment_events` em consultas separadas, e só
-- ENTÃO apagava a reserva. O Codex encontrou, em rodadas sucessivas, que
-- sempre sobra um intervalo real entre ler e apagar — e o checkout do
-- cliente pode gravar a URL (ou o evento de recuperação) exatamente nesse
-- intervalo. Uma correção fechou a corrida contra `raw_response`
-- (condicionando o DELETE a `raw_response = '{}'`), mas a mesma corrida
-- contra `payment_events` continuava aberta: não dá para condicionar um
-- DELETE em "não existe linha na OUTRA tabela" pela API simples do
-- PostgREST — isso precisa ser UM statement só, decidido pelo Postgres.
--
-- Esta função faz exatamente isso: as MESMAS três condições (pendente,
-- `raw_response` ainda vazio, nenhum evento de recuperação) e o DELETE, tudo
-- dentro de um único statement SQL. Não existe intervalo entre checar e
-- apagar porque não existem dois passos — é um só, atômico por natureza do
-- próprio Postgres.
--
-- SECURITY INVOKER (o padrão, não declarado aqui de propósito): a função
-- roda com o papel de quem chama, então as policies "admin manage payments"
-- e "admin manage payment_events" (migration 5) continuam valendo — só
-- admin autenticado consegue liberar algo, exatamente como as duas tabelas
-- já exigiam antes desta função existir.
-- ===========================================================================

create or replace function liberar_reserva_travada(p_payment_id uuid, p_order_id uuid)
returns table (id uuid)
language sql
as $$
  delete from payments
  where payments.id = p_payment_id
    and payments.order_id = p_order_id
    and payments.status = 'pending'
    -- "Sem URL" é o MESMO teste que o código usa em toda parte
    -- (`raw_response?.checkout_url` falsy) — não "é exatamente `{}`". Um
    -- `raw_response` NULL (linha antiga, ou criada por fora do fluxo normal
    -- de checkout) é tão "sem URL" quanto `{}`, e a versão anterior desta
    -- função só aceitava `{}` — uma reserva com NULL aparecia na tela como
    -- liberável e nunca conseguia ser liberada de verdade (achado do Codex,
    -- 08/09/2026). `->>'checkout_url' is null` cobre os dois formatos (e
    -- qualquer outro que também careça da chave) sem depender da forma
    -- exata do objeto inteiro.
    and (payments.raw_response is null or payments.raw_response ->> 'checkout_url' is null)
    and not exists (
      select 1 from payment_events
      where payment_events.payment_id = payments.id
        and payment_events.event_type = 'checkout_link_recovery'
    )
  returning payments.id;
$$;

comment on function liberar_reserva_travada(uuid, uuid) is
  'Apaga uma reserva de payments SÓ SE, no mesmo instante, ela continuar pendente, sem checkout_url (NULL ou ausente da chave) e sem evento de recuperação — check e delete atômicos, sem intervalo de corrida. Ver liberarReservaTravadaAction.';

-- Redundante com o default de privilégios do projeto Supabase (que já libera
-- execução de função nova para authenticated/anon/service_role), mas
-- explícito aqui para este arquivo não depender de configuração implícita.
grant execute on function liberar_reserva_travada(uuid, uuid) to authenticated;
