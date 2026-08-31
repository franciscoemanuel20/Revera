-- ===========================================================================
-- APLICAR NO SUPABASE — UMA COBRANÇA ABERTA POR PEDIDO
-- Data: 31/08/2026
-- ===========================================================================
-- Cole ISTO INTEIRO no SQL Editor do Supabase da Reverá e rode.
--
-- ORDEM IMPORTA: rode isto DEPOIS que o código novo estiver no ar.
--
--   código novo + sem índice  = mesmo comportamento de hoje (nada piora)
--   índice + código velho     = o código velho cobra e só depois grava, então
--                               a segunda requisição criaria link no gateway
--                               e falharia ao gravar — link órfão.
--
-- O QUE ELE FAZ:
--   1. apaga as linhas `pending` duplicadas que já existem, mantendo a mais
--      antiga de cada pedido (a do vencedor da corrida, que é a que tem o
--      link que o cliente recebeu);
--   2. cria o índice único parcial que impede o problema de voltar.
--
-- NÃO apaga pagamento aprovado, falhado nem estornado — só `pending`
-- duplicado.
-- ===========================================================================

-- CONFIRA ANTES (deve listar os 3 pedidos com duplicata):
-- select order_id, count(*) from payments where status = 'pending'
--   group by order_id having count(*) > 1;

-- Limpeza antes do índice: sem isto, o CREATE INDEX falha nas linhas que já
-- estão duplicadas hoje. Mantém a MAIS ANTIGA de cada pedido — é a do
-- vencedor da corrida, a que tem o link que o cliente provavelmente recebeu.
delete from payments p
where p.status = 'pending'
  and exists (
    select 1 from payments outra
    where outra.order_id = p.order_id
      and outra.status = 'pending'
      and (outra.created_at < p.created_at
           or (outra.created_at = p.created_at and outra.id < p.id))
  );

create unique index if not exists payments_uma_pendente_por_pedido
  on payments (order_id)
  where status = 'pending';

comment on index payments_uma_pendente_por_pedido is
  'No máximo uma cobrança ABERTA por pedido. Parcial de propósito: um pedido pode ter várias linhas ao longo da vida (falhada, aprovada, estornada) — o que não pode é duas abertas ao mesmo tempo. Ver migration 13.';


-- ===========================================================================
-- CONFERÊNCIA — rode depois; as duas devem voltar vazias/zero
-- ===========================================================================
-- select order_id, count(*) from payments where status = 'pending'
--   group by order_id having count(*) > 1;
--
-- select indexname from pg_indexes
--   where tablename = 'payments' and indexname = 'payments_uma_pendente_por_pedido';

-- ===========================================================================
-- DESFAZER
-- ===========================================================================
-- drop index if exists payments_uma_pendente_por_pedido;
