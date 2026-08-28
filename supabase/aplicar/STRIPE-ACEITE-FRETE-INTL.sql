-- ===========================================================================
-- MIGRATION 10  o que o checkout internacional REAL exige do banco
-- (28/08/2026)
-- ===========================================================================
-- Tres blocos, todos derivados de docs/estrutura-envio-internacional-dhl.md
-- (fonte da verdade do bloco internacional):
--
--   1. ACEITE INTERNACIONAL versionado e auditavel (estrutura 6):
--      terms_version + terms_accepted_at no pedido.
--   2. COTACOES MANUAIS DE FRETE INTERNACIONAL (estrutura 2): a DHL ainda
--      nao tem API ligada; o frete internacional so pode vir de cotacao
--      CADASTRADA, com moeda, validade e rastreabilidade. Frete inventado
--      nao existe  sem cotacao valida, o mercado fica fechado.
--   3. O pedido grava QUAL cotacao usou (estrutura 2 e 8).
--
-- Nada aqui decide DRE/DU-E, Incoterm ou imposto  esses continuam
-- bloqueados por validacao externa, como o documento manda.

-- ---------------------------------------------------------------------
-- 1. ACEITE INTERNACIONAL
-- ---------------------------------------------------------------------
-- Nullable de proposito: pedido nacional nao tem aceite internacional.
-- A CHECK garante que os dois campos andam juntos  aceite sem data ou
-- data sem versao seria registro pela metade, inutil numa disputa.
alter table orders
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

alter table orders drop constraint if exists aceite_completo_ou_ausente;
alter table orders add constraint aceite_completo_ou_ausente check (
  (terms_version is null) = (terms_accepted_at is null)
);

comment on column orders.terms_version is
  'Versao do texto de condicoes internacionais aceito no checkout. Nulo em pedido nacional. O texto em si vive no codigo, versionado no Git.';
comment on column orders.terms_accepted_at is
  'Instante do aceite, gravado pelo servidor (nunca pelo navegador).';

-- ---------------------------------------------------------------------
-- 2. COTACOES MANUAIS DE FRETE INTERNACIONAL
-- ---------------------------------------------------------------------
-- Tabela ADMINISTRATIVA: quem escreve e a operacao (via admin/service
-- role), nunca o comprador. O checkout apenas LE a cotacao ativa e valida
-- do pais  e um pais sem cotacao valida nao vende, em vez de vender com
-- frete chutado.
--
-- weight_g: gramas, SEMPRE (estrutura 2  integracao que fale em kg
-- converte na fronteira dela). valid_until: cotacao expira; a de
-- referencia R$ 333,23 ja nasceu vencida e NUNCA entra aqui como preco.
create table if not exists intl_shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  country char(2) not null,
  carrier text not null default 'DHL',
  service_name text not null,
  currency char(3) not null,
  price_cents int not null check (price_cents > 0),
  -- Peso maximo que esta cotacao cobre. Nulo = sem limite declarado.
  max_weight_g int check (max_weight_g is null or max_weight_g > 0),
  eta_days_min int check (eta_days_min is null or eta_days_min > 0),
  eta_days_max int check (eta_days_max is null or eta_days_max >= eta_days_min),
  quoted_at date not null,
  valid_until date not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  constraint intl_quote_pais_maiusculo check (country = upper(country) and country <> 'BR'),
  constraint intl_quote_moeda_suportada check (currency in ('USD','EUR','GBP','AUD','CAD')),
  constraint intl_quote_validade check (valid_until >= quoted_at)
);

create index if not exists intl_quotes_por_pais
  on intl_shipping_quotes (country, is_active, valid_until desc);

comment on table intl_shipping_quotes is
  'Cotacoes MANUAIS de frete internacional (DHL etc.), cadastradas pela operacao. O checkout so cobra frete que exista aqui, ativo e dentro da validade. Sem cotacao valida, o pais nao vende.';

alter table intl_shipping_quotes enable row level security;
-- Sem policy PUBLICA: o comprador nunca le isto direto (o checkout le via
-- service role, no servidor). O admin logado administra pelo painel  a
-- mesma policy de admin_users usada em variant_prices (migration 9).
drop policy if exists "admin manage intl shipping quotes" on intl_shipping_quotes;
create policy "admin manage intl shipping quotes" on intl_shipping_quotes for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

-- ---------------------------------------------------------------------
-- 3. O PEDIDO GRAVA QUAL COTACAO USOU
-- ---------------------------------------------------------------------
alter table orders
  add column if not exists intl_shipping_quote_id uuid references intl_shipping_quotes (id);

comment on column orders.intl_shipping_quote_id is
  'Cotacao internacional usada para congelar o frete deste pedido. Nulo em pedido nacional (que grava o recibo em shipping_quotes, da SuperFrete).';
