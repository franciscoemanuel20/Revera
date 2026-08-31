-- =========================================================================
-- PEDIDO À DISTÂNCIA — frete cotado e avisos ao cliente — 31/08/2026
-- =========================================================================
-- Continuação da migration 11. Fecha os dois buracos que impediam o ciclo de
-- rodar sozinho:
--
--   1. o saldo exigia `valor_frete_cents`, e NADA no sistema escrevia essa
--      coluna — o pedido chegava aprovado e parava para sempre;
--   2. o cliente não era avisado de nada; toda transição dependia de alguém
--      lembrar de mandar mensagem na mão.
-- =========================================================================

-- ------------------------------------------------- qual serviço foi cotado
-- Não basta guardar o PREÇO do frete. Quem for comprar a etiqueta precisa
-- comprar o MESMO serviço que o cliente pagou — recotar e pegar "a melhor do
-- momento" faz a diferença sair do bolso da operação, calada, e só aparecer
-- na fatura do fim do mês. É a lição já registrada em
-- src/lib/shipping/regras.ts (escolherServico), aprendida no site irmão.
alter table pedidos_distancia
  add column if not exists frete_servico_id   int,
  add column if not exists frete_servico_nome text,
  add column if not exists frete_cotado_em    timestamptz;

comment on column pedidos_distancia.frete_servico_id is
  'Servico da SuperFrete efetivamente cobrado do cliente. A etiqueta compra ESTE, nao o mais barato do dia da postagem.';
comment on column pedidos_distancia.frete_cotado_em is
  'Quando a cotacao que virou preco foi feita. Cotacao velha e sinal de que o endereco mudou depois — recotar antes de postar.';

-- --------------------------------------------------------------- a view
-- ARMADILHA DA MIGRATION 11, respeitada aqui: a view congela a lista de
-- colunas no momento em que é criada. Como acabamos de adicionar três
-- colunas, ela é RECRIADA — senão o código lê `undefined` e ninguém entende
-- por quê. As colunas continuam nomeadas uma a uma, nunca `p.*`.
--
-- `drop` antes de `create`: `create or replace view` recusa mudança na lista
-- de colunas de saída, e é justamente isso que estamos fazendo.
drop view if exists pedidos_liberados_para_postagem;

create view pedidos_liberados_para_postagem as
  select p.id, p.codigo, p.customer_name, p.customer_phone, p.documento,
         p.cep, p.logradouro, p.numero, p.complemento, p.bairro, p.cidade, p.uf,
         p.valor_protese_cents, p.valor_frete_cents,
         p.frete_servico_id, p.frete_servico_nome, p.frete_cotado_em,
         p.status, p.created_at
    from pedidos_distancia p
   where p.status = 'saldo_aprovado'
     and p.endereco_validado
     and not p.bloqueio_manual
     and p.aprovado_em is not null;

-- ----------------------------------------------------------- os avisos
-- Mesmo desenho de `order_notifications` (migration da venda normal): a
-- garantia de "uma vez só" é o INSERT contra a constraint única, não um
-- SELECT seguido de INSERT — entre os dois haveria janela para dois webhooks
-- mandarem a mesma mensagem duas vezes.
--
-- A linha nasce com `sent_at` NULO: reservada, não enviada. Só depois da
-- resposta do provedor ela vira enviada. Assim o painel distingue "não
-- avisamos" de "tentamos e a Meta recusou" — problemas diferentes.
create table if not exists pedido_avisos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_distancia(id) on delete cascade,

  -- Um por transição que o cliente precisa saber. Fechado por CHECK para
  -- que um typo em código novo ('sinal_confimado') não crie um aviso que
  -- ninguém procura no painel.
  kind text not null check (kind in (
    'sinal_confirmado','correcao_necessaria','aprovado',
    'saldo_disponivel','postado','entregue'
  )),
  channel text not null default 'whatsapp',

  sent_at             timestamptz,
  provider_message_id text,
  last_error          text,
  created_at timestamptz not null default now(),

  unique (pedido_id, kind)
);

create index if not exists pedido_avisos_pendentes
  on pedido_avisos (pedido_id) where sent_at is null;

comment on table pedido_avisos is
  'Um aviso por transicao por pedido. A trava de nao repetir e a constraint unica, nao um if na aplicacao.';
comment on column pedido_avisos.last_error is
  'Preenchido quando o envio falhou OU quando o WhatsApp esta desligado. Aviso de saldo chega dias depois da ultima mensagem do cliente: fora da janela de 24h so template aprovado passa.';

alter table pedido_avisos enable row level security;

create policy "admin manage pedido_avisos" on pedido_avisos for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));
