-- ===========================================================================
-- UMA COBRANÇA PENDENTE POR PEDIDO — no banco, não no código (31/08/2026)
-- ===========================================================================
-- Em 29/08/2026 o checkout ganhou uma guarda contra criar link de pagamento
-- repetido: antes de cobrar, ele CONSULTA se já existe cobrança pendente
-- para o pedido e, se existir, reaproveita o link.
--
-- A guarda não resolveu. O pedido REV-ED9A384B, de 31/08 — dois dias DEPOIS
-- dela — gerou duas linhas `pending` com 24 ms de diferença.
--
-- ---------------------------------------------------------------------------
-- POR QUE VERIFICAR NO CÓDIGO NUNCA IA FUNCIONAR
-- ---------------------------------------------------------------------------
-- A guarda faz duas coisas em sequência: LÊ ("já existe?") e depois ESCREVE.
-- Duas requisições quase simultâneas passam as DUAS pela leitura antes de
-- qualquer uma escrever — e aí as duas escrevem. É a corrida clássica de
-- ler-depois-escrever, e nenhuma quantidade de verificação no código a
-- resolve: sempre existe o intervalo entre olhar e agir.
--
-- A assinatura disso está nos dados. O pedido REV-D32DE067 tem três linhas,
-- duas delas separadas por 2 MILISSEGUNDOS. Dedo humano não faz isso.
--
-- ---------------------------------------------------------------------------
-- O QUE ISSO CUSTAVA
-- ---------------------------------------------------------------------------
-- Ninguém foi cobrado em dobro: só um link é pago. Mas ficavam DOIS links de
-- pagamento válidos no gateway para o mesmo pedido — e se o cliente abrisse
-- os dois, os dois cobrariam. E a conciliação virava adivinhação: qual das
-- três linhas é a que valeu?
--
-- ---------------------------------------------------------------------------
-- A CORREÇÃO: O BANCO É O JUIZ
-- ---------------------------------------------------------------------------
-- Índice único PARCIAL: no máximo uma linha `pending` por pedido. A segunda
-- inserção não passa — o banco recusa, e o código trata a recusa indo buscar
-- o link que o vencedor da corrida criou.
--
-- Parcial (só `pending`) porque um pedido PODE ter várias linhas ao longo da
-- vida: uma falhada e outra aprovada, uma aprovada e depois estornada. O que
-- não pode é ter duas ABERTAS ao mesmo tempo.
-- ===========================================================================

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
