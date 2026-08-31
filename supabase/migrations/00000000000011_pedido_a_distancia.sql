-- =========================================================================
-- PEDIDO À DISTÂNCIA na Reverá — 28/08/2026
-- =========================================================================
-- Porte do fluxo que roda desde 19/08/2026 no projeto do agendamento
-- (~/Downloads/agendamento-protese-capilar-main/novo-site). Ordem do
-- Francisco em 28/08: "pode copiar, somos o mesmo dono".
--
-- Regras comerciais NÃO são novas — são as dele, de 18/08/2026, transportadas
-- sem alteração: R$ 1.600 = sinal R$ 800 + saldo R$ 800, 12x, juros do
-- cliente, frete no saldo.
--
-- -------------------------------------------------------------------------
-- POR QUE TABELA PRÓPRIA, E NÃO UM PEDIDO NORMAL COM DUAS PARCELAS
-- -------------------------------------------------------------------------
-- A migration 8 criou, e a produção PROVOU, esta trava:
--
--     shipping_status = 'not_ready' or payment_status in ('paid','refunded')
--
-- Nada caminha para envio sem pagamento COMPLETO. O pedido à distância,
-- porém, precisa liberar a PRODUÇÃO com só metade paga. As duas coisas não
-- cabem na mesma linha de `orders`.
--
-- A saída é a mesma que o sistema original já usava: o ciclo mora aqui, em
-- `pedidos_distancia`, e cada metade entra como uma LINHA de `orders` —
-- reaproveitando checkout, webhook, payment_check e idempotência que já
-- funcionam. A trava da migration 8 continua valendo, intacta.
--
-- NÃO MEXER NA TRAVA para acomodar o sinal. Ela é a garantia mais forte que
-- a Reverá tem hoje: impede peça sair sem dinheiro entrar.
-- =========================================================================

-- ------------------------------------------------------------------ pedido
create table if not exists pedidos_distancia (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  access_token text unique not null,

  customer_name  text not null,
  customer_phone text not null,
  customer_email text,

  -- Três caminhos (21/08/2026). `frontal` cobre só a região da frente:
  -- são três medidas, não seis, e outra lista de fotos.
  caminho text check (caminho in ('ja_usa','primeira_vez','frontal')),

  status text not null default 'iniciado' check (status in (
    'iniciado','cadastro_incompleto','aguardando_fotos','aguardando_sinal',
    'sinal_aprovado','validacao_tecnica','correcao_necessaria','aprovado',
    'preparacao_agendada','aguardando_saldo','saldo_aprovado',
    'pronto_para_postagem','postado','em_transito','saiu_para_entrega',
    'entregue','excecao','cancelado','reembolsado'
  )),

  valor_protese_cents int not null default 160000,
  -- Nulo até a cotação acontecer. Frete entra no SALDO: quando o sinal é
  -- pago o endereço ainda pode mudar e o peso final não é certo.
  valor_frete_cents   int,
  sinal_cents         int not null default 80000,
  saldo_cents         int not null default 80000,

  -- A escolha da peça e do visual (etapas 5 a 7).
  --
  -- `medidas` é JSONB e não colunas: a lista de medidas MUDA por caminho
  -- (duas em ja_usa, seis em primeira_vez, três em frontal) e já mudou uma
  -- vez em 21/08/2026. Campo que some da tela não pode sumir do histórico —
  -- pedido antigo tem de continuar legível com as medidas que tinha.
  medidas   jsonb not null default '{}'::jsonb,
  espessura text check (espessura in ('0.06','0.08')),
  corte     text,

  -- Endereço. CPF é OBRIGATÓRIO para a declaração de conteúdo do envio —
  -- descoberto na prática em 19/08, não é burocracia nossa.
  documento    text,
  cep          text,
  logradouro   text,
  numero       text,
  complemento  text,
  bairro       text,
  cidade       text,
  uf           text,
  endereco_validado boolean not null default false,

  -- Freio de mão da equipe: segura o pedido mesmo com tudo pago e aprovado.
  bloqueio_manual boolean not null default false,

  aprovado_em  timestamptz,
  aprovado_por uuid references admin_users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table pedidos_distancia is
  'Ciclo do pedido à distância. O DINHEIRO não mora aqui: cada metade é uma linha em orders (ver pedido_distancia_id/tipo_cobranca).';
comment on column pedidos_distancia.valor_frete_cents is
  'Escrito na liberação do saldo, nunca na postagem. Nulo aqui = saldo ainda não pode abrir; cotação que falha NÃO libera o saldo.';

create index if not exists pedidos_distancia_status_criado
  on pedidos_distancia (status, created_at desc);

-- --------------------------------------------------------------- histórico
-- Status nunca é alterado direto na tabela em lugar nenhum do código: passa
-- por mudarStatus(), que grava aqui na mesma operação. Sem isto o histórico
-- fica com buracos e ninguém explica depois por que um pedido parou.
create table if not exists pedido_eventos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_distancia(id) on delete cascade,
  de_status   text,
  para_status text not null,
  origem text not null check (origem in ('cliente','equipe','webhook','sistema')),
  ator   text,
  motivo text,
  created_at timestamptz not null default now()
);

create index if not exists pedido_eventos_pedido on pedido_eventos (pedido_id, created_at desc);

-- ------------------------------------------------------------------- fotos
create table if not exists pedido_fotos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_distancia(id) on delete cascade,
  slot text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (pedido_id, slot)
);

-- ---------------------------------------------------- as duas cobranças
-- Opcionais porque são nulas em toda cobrança que NÃO é de pedido à
-- distância — ou seja, na venda normal de produto, que é a maioria.
alter table orders
  add column if not exists pedido_distancia_id uuid references pedidos_distancia(id),
  add column if not exists tipo_cobranca text check (tipo_cobranca in ('sinal','saldo'));

comment on column orders.tipo_cobranca is
  'sinal = 1a metade (libera produção). saldo = 2a metade (libera postagem). NULL = venda normal de produto.';

-- Uma cobrança de cada tipo por pedido. É o banco impedindo cobrar o sinal
-- duas vezes, não um if na aplicação.
create unique index if not exists orders_cobranca_unica_por_pedido
  on orders (pedido_distancia_id, tipo_cobranca)
  where pedido_distancia_id is not null;

-- -------------------------------------------------------- código legível
-- Quem gera é o BANCO, por sequência: duas requisições simultâneas jamais
-- recebem o mesmo número. Gerar no código já mordeu antes.
create sequence if not exists pedido_distancia_seq;

create or replace function proximo_codigo_pedido() returns text
language sql volatile as $$
  select 'PED-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('pedido_distancia_seq')::text, 6, '0');
$$;

-- ------------------------------------------------- quem pode ser postado
-- Saldo pago NÃO libera postagem sozinho. Quem decide é esta view: exige
-- também aprovação técnica, endereço válido e nenhum bloqueio manual.
--
-- ARMADILHA JÁ CONHECIDA: `select p.*` CONGELA a lista de colunas no
-- momento da criação. Ao adicionar coluna em pedidos_distancia, recriar
-- esta view junto — senão o código lê `undefined` e ninguém entende porquê.
-- Por isso as colunas vão nomeadas, uma a uma.
create or replace view pedidos_liberados_para_postagem as
  select p.id, p.codigo, p.customer_name, p.customer_phone, p.documento,
         p.cep, p.logradouro, p.numero, p.complemento, p.bairro, p.cidade, p.uf,
         p.valor_protese_cents, p.valor_frete_cents, p.status, p.created_at
    from pedidos_distancia p
   where p.status = 'saldo_aprovado'
     and p.endereco_validado
     and not p.bloqueio_manual
     and p.aprovado_em is not null;

-- --------------------------------------------------------------------- RLS
-- Mesmo padrão das migrations 2 e 5: RLS ligada, e só admin autenticado
-- enxerga. O cliente NUNCA lê por RLS — ele chega por código + token, e
-- quem serve é o service role, que ignora RLS.
alter table pedidos_distancia enable row level security;
alter table pedido_eventos    enable row level security;
alter table pedido_fotos      enable row level security;

create policy "admin manage pedidos_distancia" on pedidos_distancia for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage pedido_eventos" on pedido_eventos for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage pedido_fotos" on pedido_fotos for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

-- ------------------------------------------------------------- bucket
-- Privado: são fotos do couro cabeludo de clientes. Acesso só por URL
-- assinada de curta duração, gerada no servidor.
insert into storage.buckets (id, name, public)
  values ('pedidos-fotos', 'pedidos-fotos', false)
  on conflict (id) do nothing;

-- ------------------------------------------------- valor que o Purchase diz
-- Um pedido à distância gera DUAS cobranças, e a linha do SINAL guarda só os
-- 50% cobrados agora. Sem isto, Meta e GA4 veem R$ 800 numa venda de
-- R$ 1.600 — foi um bug real no sistema original, corrigido em 22/08/2026.
--
-- A fatura NÃO pode mentir: total_cents do sinal continua sendo 80000, que é
-- o que o cliente paga naquele momento. Quem carrega o valor da VENDA
-- fechada é esta coluna, lida só pela camada de rastreamento.
--
-- NULL = venda normal, o Purchase usa total_cents como sempre.
alter table orders
  add column if not exists purchase_value_cents int;

comment on column orders.purchase_value_cents is
  'So para o Purchase. NULL = usar total_cents. Preenchida no sinal do pedido a distancia com o valor CHEIO (R$ 1.600), porque a venda fechada e a peca inteira, nao a metade cobrada agora.';
