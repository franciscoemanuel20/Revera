-- ===========================================================================
-- LIBERAÇÃO ATÔMICA DE RESERVA TRAVADA (08/09/2026)
-- ===========================================================================
-- `liberarReservaTravadaAction` (src/app/admin/(protected)/pedidos/actions.ts)
-- lia `payments.raw_response` e `payment_events` em consultas separadas, e só
-- ENTÃO apagava a reserva. O Codex encontrou, em rodadas sucessivas, que
-- sempre sobra um intervalo real entre ler e apagar — e o checkout do
-- cliente pode gravar a URL (ou o evento de recuperação) exatamente nesse
-- intervalo.
--
-- Duas correções sucessivas condicionaram o DELETE ao estado atual
-- (raw_response vazio, sem evento de recuperação) DENTRO do mesmo statement
-- — o que fecha a corrida quando as DUAS operações (checar e apagar)
-- acontecem na mesma transação. O que sobrava: o checkout GRAVA o evento de
-- recuperação numa chamada SEPARADA, numa transação DIFERENTE da liberação
-- do admin. Um `NOT EXISTS` no instante do DELETE não enxerga um INSERT que
-- ainda nem começou em outra sessão — não é possível fechar essa corrida só
-- olhando um instantâneo, não importa quantas condições o snapshot tenha.
--
-- ===========================================================================
-- A SAÍDA: LOCK CONSULTIVO (advisory lock), NÃO MAIS CONDIÇÃO DE SNAPSHOT
-- ===========================================================================
-- `pg_advisory_xact_lock` serializa as duas operações de verdade: quem pegar
-- o lock primeiro TERMINA (e libera, ao fim da transação) antes de a outra
-- sequer começar sua parte crítica. Não é "checar e torcer" — é impedir a
-- outra ponta de rodar ao mesmo tempo.
--
-- As DUAS pontas do checkout que escrevem em cima desta reserva agora usam
-- o MESMO lock, pela MESMA chave (o payment_id):
--   - liberar_reserva_travada — o admin apagando uma reserva travada.
--   - gravar_recuperacao_link — o checkout gravando a recuperação do link
--     quando a atualização direta de `payments` falhou.
--
-- (O UPDATE direto em `payments`, feito por src/app/checkout/pagamento/
-- page.tsx, não precisa de lock à parte: UPDATE e DELETE já disputam o
-- mesmo lock DE LINHA que o Postgres sempre usa — a corrida ali já estava
-- fechada. Só faltava a gravação em payment_events, que é insert numa
-- OUTRA tabela e não disputa lock de linha nenhum com o DELETE.)
--
-- Namespace 917341 (arbitrário, só para não colidir com outro uso futuro de
-- advisory lock neste projeto — hoje não existe nenhum outro).
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
      -- "Sem URL" é o MESMO teste que o código usa em toda parte
      -- (`raw_response?.checkout_url` falsy) — não "é exatamente `{}`". Um
      -- `raw_response` NULL (linha antiga, ou criada fora do fluxo normal
      -- de checkout) é tão "sem URL" quanto `{}`.
      and (payments.raw_response is null or payments.raw_response ->> 'checkout_url' is null)
      and not exists (
        select 1 from payment_events
        where payment_events.payment_id = payments.id
          and payment_events.event_type = 'checkout_link_recovery'
      )
    returning payments.id;
end;
$$;

comment on function liberar_reserva_travada(uuid, uuid) is
  'Apaga uma reserva de payments SÓ SE, sob o mesmo advisory lock que gravar_recuperacao_link usa, ela continuar pendente, sem checkout_url e sem evento de recuperação. Ver liberarReservaTravadaAction.';

-- Redundante com o default de privilégios do projeto Supabase (que já libera
-- execução de função nova para authenticated/anon/service_role), mas
-- explícito aqui para este arquivo não depender de configuração implícita.
grant execute on function liberar_reserva_travada(uuid, uuid) to authenticated;

-- ===========================================================================
-- gravar_recuperacao_link — o OUTRO lado do mesmo lock
-- ===========================================================================
-- Chamada por src/app/checkout/pagamento/page.tsx quando as 3 tentativas de
-- UPDATE direto em `payments` já falharam. Sob o MESMO advisory lock de
-- liberar_reserva_travada: se o admin já apagou a reserva, esta função
-- enxerga isso (a reserva não existe mais, `gravado = false`) e NÃO tenta
-- inserir em `payment_events` — inserir ali violaria a chave estrangeira
-- (payment_id não existiria mais) e é exatamente o que perdia o link.
-- Quem chama, ao ver `gravado = false`, recria a reserva do zero (mesmo
-- caminho já usado quando o UPDATE direto encontra zero linhas).
-- ===========================================================================

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

comment on function gravar_recuperacao_link(uuid, text, text, text) is
  'Grava a recuperação do link em payment_events SÓ SE a reserva ainda existir, sob o mesmo advisory lock de liberar_reserva_travada — evita o INSERT que violaria a FK depois de uma liberação manual concorrente. Ver src/app/checkout/pagamento/page.tsx.';

-- Chamada pelo checkout via createAdminClient() (service_role) — service_role
-- já ignora RLS e tem privilégio amplo por padrão no Supabase, mas o grant
-- explícito aqui documenta quem é o chamador de verdade e não depende de
-- configuração implícita de outro lugar.
grant execute on function gravar_recuperacao_link(uuid, text, text, text) to service_role;
