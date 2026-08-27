-- ATENCAO - ORDEM OBRIGATORIA
-- Esta atualizacao do banco vem ANTES de publicar o codigo novo.
-- O codigo passa a escrever em payment_status/shipping_status; se ele subir
-- antes das colunas existirem, o checkout quebra ao criar o pedido.
--   1) cole e rode este arquivo no SQL Editor do Supabase
--   2) so entao publique o site
-- Nao ha dado a perder: conferido em 27/08/2026, a loja tem ZERO pedidos.
-- Sem acento de proposito (o editor do Supabase corrompe UTF-8 colado pelo
-- Chrome). O arquivo com acentos e a migration original, em
-- supabase/migrations/00000000000008_pos_venda.sql.

-- =====================================================================
-- POS-VENDA: separa pagamento de envio, avisa uma vez, guarda historico
-- =====================================================================
-- Aplicada em 27/08/2026, com a loja no ar e ZERO pedidos no banco - e a
-- unica janela em que trocar a espinha de estados do pedido custa nada.
-- Fazer isto depois da primeira venda seria migracao de dado real.
--
-- ---------------------------------------------------------------------
-- POR QUE DOIS CAMPOS, E POR QUE O ANTIGO VIRA COLUNA GERADA
-- ---------------------------------------------------------------------
-- `orders.status` misturava dois eixos que nao tem nada a ver um com o
-- outro: 'paid' fala de dinheiro, 'shipped' fala de caixa saindo pela
-- porta. Misturados, existem estados impossiveis representaveis - "enviado
-- e nao pago" cabia no campo - e a unica coisa que os impedia era cada
-- programador lembrar da regra.
--
-- A saida OBVIA seria trocar `status` pelos dois campos novos e reescrever
-- quem usa. So que 19 arquivos LEEM esse campo (checkout, pagina do
-- cliente, rastreamento, admin, testes) e apenas 3 ESCREVEM. Reescrever 19
-- leitores com o checkout ao vivo e risco sem retorno.
--
-- Entao: os dois campos novos passam a ser a verdade, e `status` renasce
-- como GENERATED ALWAYS ... STORED, derivado deles. Consequencias:
--   - nenhum leitor precisa mudar; continuam lendo `status` e acertando;
--   - NINGUEM consegue escrever em `status` - o Postgres recusa. Os 3
--     escritores foram migrados junto com esta migration;
--   - os dois campos nunca divergem do terceiro, porque o terceiro nao
--     existe separado: e a mesma linha, calculada.
--
-- Isto e o oposto de "varios campos conflitantes": ha UMA verdade (os dois
-- eixos) e uma projecao dela para compatibilidade.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. OS DOIS EIXOS
-- ---------------------------------------------------------------------
alter table orders
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','failed','refunded')),
  add column if not exists shipping_status text not null default 'not_ready'
    check (shipping_status in (
      'not_ready',        -- ainda nao pago; nada a preparar
      'awaiting_label',   -- pago, esperando alguem emitir a etiqueta
      'label_processing', -- emissao em andamento (trava contra duplo clique)
      'label_created',    -- etiqueta emitida e paga
      'shipped',          -- despachado
      'delivered',        -- entregue
      'shipping_error'    -- a emissao falhou; o pedido continua integro
    )),
  -- Cancelamento e garantia sao fatos com data, nao valores de um enum de
  -- status: precisam do QUANDO e do PORQUE para a aba de cancelados.
  add column if not exists canceled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists warranty_opened_at timestamptz,
  -- "Venda nova ainda nao vista" - o marcador do menu. Fica separado do
  -- status de proposito: abrir a tela NAO pode mudar a situacao da venda.
  add column if not exists seen_at timestamptz;

-- A regra que torna o estado impossivel impossivel: nao se prepara envio de
-- pedido que nao foi pago. 'refunded' entra porque estorno depois do envio
-- e real - o pacote ja saiu, o dinheiro voltou.
alter table orders drop constraint if exists envio_exige_pagamento;
alter table orders add constraint envio_exige_pagamento check (
  shipping_status = 'not_ready' or payment_status in ('paid','refunded')
);

-- ---------------------------------------------------------------------
-- 2. O CAMPO ANTIGO, AGORA DERIVADO
-- ---------------------------------------------------------------------
-- Backfill antes de trocar: com zero linhas e simbolico, mas se um dia esta
-- migration rodar num banco com dado, ela nao perde nada.
update orders set
  payment_status = case
    when status in ('paid','preparing','label_ready','shipped','delivered','warranty') then 'paid'
    when status = 'canceled' then 'refunded'
    else 'pending' end,
  shipping_status = case
    when status = 'delivered' then 'delivered'
    when status = 'shipped' then 'shipped'
    when status = 'label_ready' then 'label_created'
    when status = 'preparing' then 'label_processing'
    when status in ('paid','warranty') then 'awaiting_label'
    else 'not_ready' end,
  canceled_at = case when status = 'canceled' then coalesce(canceled_at, updated_at) end,
  warranty_opened_at = case when status = 'warranty' then coalesce(warranty_opened_at, updated_at) end;

alter table orders drop column status;

-- A ordem dos ramos e a precedencia: cancelado apaga tudo, garantia vem
-- depois de entregue, e o eixo de envio manda sobre o de pagamento porque
-- quem ja enviou obviamente ja recebeu.
alter table orders add column status text generated always as (
  case
    when canceled_at is not null              then 'canceled'
    when warranty_opened_at is not null       then 'warranty'
    when shipping_status = 'delivered'        then 'delivered'
    when shipping_status = 'shipped'          then 'shipped'
    when shipping_status = 'label_created'    then 'label_ready'
    when shipping_status = 'label_processing' then 'preparing'
    when payment_status  = 'paid'             then 'paid'
    else 'new'
  end
) stored;

comment on column orders.status is
  'DERIVADO de payment_status/shipping_status/canceled_at - nao escreva aqui, o Postgres recusa. Existe para os leitores antigos (checkout, pagina do cliente, rastreamento) continuarem valendo.';
comment on column orders.payment_status is 'Eixo do dinheiro. So confirmarPagamento() escreve, e so depois de reconfirmar com o gateway.';
comment on column orders.shipping_status is 'Eixo da caixa. Escrito por gerarEtiquetaAction() e pelas acoes manuais do admin.';

-- ---------------------------------------------------------------------
-- 3. AVISO UMA VEZ SO
-- ---------------------------------------------------------------------
-- Mesmo principio de pixel_event_log e de shipments_order_id_unico: a
-- garantia mora numa constraint, nao num `if`. Webhook repetido 5 vezes
-- tenta inserir 5 vezes e 4 batem no unico - sem janela de corrida entre
-- "ja mandei?" e "mandar".
create table if not exists order_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null check (kind in ('venda_paga')),
  channel text not null default 'whatsapp',
  -- Nasce reservado (sent_at nulo) e so vira enviado depois que o provedor
  -- confirmou. Se o envio falhar, a linha fica com o erro e a reserva
  -- impede tempestade de retentativa - sem perder o registro do que houve.
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  unique (order_id, kind)
);

alter table order_notifications enable row level security;
-- Mesma forma das policies da migration 05 - o projeto nao tem helper
-- is_admin(); trocar a forma aqui criaria duas convencoes.
create policy "admin manage order_notifications" on order_notifications for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

-- ---------------------------------------------------------------------
-- 4. HISTORICO DO PEDIDO
-- ---------------------------------------------------------------------
-- Sem tabela nova: `audit_logs` ja e exatamente "quem fez o que e quando",
-- e ja e escrita pelas acoes do admin. Eventos do sistema (pagamento
-- confirmado pelo webhook) entram com admin_user_id nulo - a tela mostra
-- "Sistema". O que faltava era conseguir LER por pedido sem varrer tudo.
create index if not exists audit_logs_entidade_tempo
  on audit_logs (entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. INDICES DAS ABAS, FILTROS E BUSCA
-- ---------------------------------------------------------------------
create index if not exists orders_payment_status_criado on orders (payment_status, created_at desc);
create index if not exists orders_shipping_status_criado on orders (shipping_status, created_at desc);
create index if not exists orders_criado on orders (created_at desc);
create index if not exists orders_numero on orders (order_number);
create index if not exists orders_nao_vistas on orders (seen_at) where seen_at is null;
create index if not exists shipments_rastreio on shipments (tracking_code);
create index if not exists customers_telefone on customers (phone);
create index if not exists customers_email on customers (email);
