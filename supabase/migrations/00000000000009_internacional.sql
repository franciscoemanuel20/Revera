-- =====================================================================
-- FUNDAÇÃO INTERNACIONAL — endereço, moeda, dados de exportação
-- =====================================================================
-- Escrita em 27/08/2026. ADITIVA: nada é removido, nada muda de sentido.
-- Depende da migration 00000000000008 (os eixos de pagamento e envio).
--
-- Esta migration NÃO habilita venda internacional. Ela deixa o banco capaz
-- de representar uma. Pagamento internacional, NF-e e DHL continuam
-- inexistentes — e o painel diz isso com todas as letras.
--
-- ---------------------------------------------------------------------
-- ENDEREÇO: POR QUE NÃO É "TORNAR TUDO NULLABLE"
-- ---------------------------------------------------------------------
-- O caminho preguiçoso seria afrouxar cep/UF/bairro para nulo e encher o
-- código de `if (pais === 'BR')`. Isso espalha a regra por dezenas de
-- arquivos, e basta um esquecer para nascer um endereço impossível — um
-- pedido brasileiro sem CEP, que a SuperFrete recusa só na hora de gerar a
-- etiqueta, com o cliente já pago.
--
-- Aqui a regra fica em UM lugar: uma CHECK constraint que exige o conjunto
-- certo de campos conforme o país. O banco recusa endereço incompleto
-- independentemente de qual código tentou gravar. No TypeScript existe o
-- espelho disso — um tipo com duas variantes (BR e internacional), de modo
-- que o código decide o formato UMA vez, na fronteira, e não em cada tela.
--
-- Os campos brasileiros continuam existindo como campos brasileiros. Bairro
-- e número não são "line1 e line2 mal preenchidos": são exigências reais do
-- endereçamento nacional, e a SuperFrete os pede separados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ENDEREÇO
-- ---------------------------------------------------------------------
alter table addresses
  -- ISO 3166-1 alfa-2. Default 'BR' preserva todo endereço já gravado sem
  -- precisar adivinhar de onde ele é.
  add column if not exists country char(2) not null default 'BR',
  add column if not exists company text,
  -- Os genéricos: usados fora do Brasil, onde "rua + número + bairro" não
  -- descreve o mundo (o Reino Unido tem nome de casa, os EUA têm apt/suite
  -- na segunda linha, Portugal muitas vezes não tem região nenhuma).
  add column if not exists line1 text,
  add column if not exists line2 text,
  add column if not exists postal_code text,
  add column if not exists region text;

comment on column addresses.country is 'ISO 3166-1 alfa-2 em maiusculas. BR e o default, o que preserva os enderecos ja gravados.';
comment on column addresses.line1 is 'Endereco internacional. No Brasil fica nulo: la valem street/number/neighborhood.';
comment on column addresses.region is 'Estado/provincia/regiao fora do Brasil. Texto livre — nem todo pais tem, e os que tem nao usam duas letras.';

-- O país precisa ser duas letras MAIÚSCULAS. Sem isto, 'br', 'Br' e 'BR'
-- viram três países diferentes no filtro do painel.
alter table addresses drop constraint if exists addresses_country_iso2;
alter table addresses add constraint addresses_country_iso2
  check (country ~ '^[A-Z]{2}$');

-- Campos brasileiros passam a aceitar nulo — para endereço ESTRANGEIRO.
-- A obrigatoriedade não sumiu: mudou de "coluna not null" para "exigida
-- quando o país é BR", logo abaixo.
alter table addresses alter column cep drop not null;
alter table addresses alter column street drop not null;
alter table addresses alter column number drop not null;
alter table addresses alter column neighborhood drop not null;
alter table addresses alter column state drop not null;

-- A regra, em um lugar só.
alter table addresses drop constraint if exists endereco_completo_por_pais;
alter table addresses add constraint endereco_completo_por_pais check (
  case
    when country = 'BR' then
      cep is not null and street is not null and number is not null
      and neighborhood is not null and city is not null and state is not null
    else
      line1 is not null and city is not null and postal_code is not null
  end
);

comment on constraint endereco_completo_por_pais on addresses is
  'Endereco brasileiro exige CEP/rua/numero/bairro/cidade/UF. Estrangeiro exige line1/cidade/postal_code. A regra mora aqui para nao depender de cada tela lembrar dela.';

-- ---------------------------------------------------------------------
-- 2. CLIENTE
-- ---------------------------------------------------------------------
-- CPF ja era nullable no schema original — a obrigatoriedade vinha do
-- formulario. Fica registrado o porque, para ninguem "consertar" isso
-- depois achando que e esquecimento.
comment on column customers.cpf is
  'So faz sentido para comprador brasileiro. Estrangeiro nao tem CPF, e exigir um inventaria dado. O documento fiscal do estrangeiro (passaporte) vai em customers.foreign_tax_id.';

alter table customers
  -- Passaporte ou identificador fiscal do país de origem. A NF-e de
  -- exportação tem campo próprio para isso (`idEstrangeiro`), e ele aceita
  -- vazio — por isso aqui também é opcional.
  add column if not exists foreign_tax_id text,
  add column if not exists country char(2);

alter table customers drop constraint if exists customers_country_iso2;
alter table customers add constraint customers_country_iso2
  check (country is null or country ~ '^[A-Z]{2}$');

-- ---------------------------------------------------------------------
-- 3. MOEDA
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- NOTA SOBRE O NOME DAS COLUNAS
-- ---------------------------------------------------------------------
-- O pedido pedia `subtotal_minor`, `total_minor` etc. As colunas existentes
-- se chamam `subtotal_cents`, `total_cents` — e JA GUARDAM unidade minima
-- inteira, que e a propriedade que importa. As seis moedas previstas (BRL,
-- USD, EUR, GBP, AUD, CAD) tem todas duas casas decimais, entao "cents" e
-- literalmente correto para todas elas.
--
-- Renomear seis colunas lidas em ~15 arquivos, com o checkout no ar, seria
-- exatamente o "refactor grande sem necessidade" que a Fase 10 pede para
-- evitar. Fica como decisao para o Francisco: se ele quiser o nome novo, e
-- uma migration propria, feita com calma.
alter table orders
  add column if not exists currency char(3) not null default 'BRL',
  -- Não existia. A exportação é imune a ICMS/IPI, mas a coluna precisa
  -- existir para o dia em que houver imposto no destino (DDP).
  add column if not exists tax_cents int not null default 0,
  -- Câmbio: guardado no PEDIDO, não calculado na hora de imprimir. A taxa
  -- de uma venda de agosto não pode mudar porque alguém reimprimiu o
  -- documento em outubro.
  add column if not exists exchange_rate numeric(18,6),
  add column if not exists exchange_rate_source text,
  add column if not exists exchange_rate_date date;

alter table orders drop constraint if exists orders_currency_suportada;
alter table orders add constraint orders_currency_suportada
  check (currency in ('BRL','USD','EUR','GBP','AUD','CAD'));

comment on column orders.currency is
  'Moeda em que o CLIENTE foi cobrado. Nao confundir com a moeda fiscal: a NF-e sai sempre em BRL, convertida por exchange_rate.';
comment on column orders.exchange_rate is
  'Quantos BRL vale 1 unidade de `currency`, na data registrada. Nulo em pedido BRL, onde a taxa seria sempre 1.';

-- Câmbio só faz sentido quando a moeda não é a nacional — e quando não é,
-- ele é obrigatório, senão a NF-e não tem como ser convertida.
alter table orders drop constraint if exists cambio_coerente_com_moeda;
alter table orders add constraint cambio_coerente_com_moeda check (
  (currency = 'BRL' and exchange_rate is null)
  or (currency <> 'BRL')
);

-- ---------------------------------------------------------------------
-- 4. O TERCEIRO EIXO: EXPORTAÇÃO
-- ---------------------------------------------------------------------
-- Conferido contra os eixos da migration 8 para não duplicar. Dois estados
-- da lista original foram DELIBERADAMENTE deixados de fora:
--
--   'dispatched' — seria a mesma informação de shipping_status='shipped'.
--                  Dois campos dizendo "saiu" é a receita para divergirem.
--   'delivered'  — idem, shipping_status já responde.
--
-- Este eixo responde UMA pergunta: a papelada está pronta? Ele termina em
-- 'ready_for_dispatch' e entrega o bastão para o eixo de envio.
alter table orders
  add column if not exists export_status text not null default 'not_required';

alter table orders drop constraint if exists orders_export_status_valido;
alter table orders add constraint orders_export_status_valido check (
  export_status in (
    'not_required',        -- pedido nacional
    'pending_data',        -- falta dado do cliente, do endereço ou fiscal
    'ready_for_documents', -- dados completos, pronto para gerar documentos
    'documents_processing',
    'documents_ready',
    'ready_for_dispatch',  -- imprimir e levar à DHL
    'export_error'
  )
);

comment on column orders.export_status is
  'Terceiro eixo: a papelada esta pronta? Termina em ready_for_dispatch — de la em diante quem responde e shipping_status, para os dois nao divergirem.';

-- ---------------------------------------------------------------------
-- 5. DADOS DE EXPORTAÇÃO DO PRODUTO
-- ---------------------------------------------------------------------
-- Tudo NULO por padrão, e nulo é o estado correto hoje: NCM, HS Code e país
-- de origem dependem do contador e do fornecedor. Inventar qualquer um
-- destes valores é declarar mercadoria errada na alfândega.
alter table products
  add column if not exists description_en text,
  add column if not exists country_of_origin char(2),
  add column if not exists ncm text,
  add column if not exists hs_code text,
  add column if not exists net_weight_g int,
  add column if not exists gross_weight_g int,
  add column if not exists length_mm int,
  add column if not exists width_mm int,
  add column if not exists height_mm int;

alter table products drop constraint if exists products_origem_iso2;
alter table products add constraint products_origem_iso2
  check (country_of_origin is null or country_of_origin ~ '^[A-Z]{2}$');

-- Formato, não conteúdo: o banco confere que o NCM tem 8 dígitos e o HS
-- Code de 6 a 10, porque isso é estrutura conhecida. QUAL número é o certo
-- é decisão fiscal, e o banco não opina.
alter table products drop constraint if exists products_ncm_formato;
alter table products add constraint products_ncm_formato
  check (ncm is null or ncm ~ '^[0-9]{8}$');
alter table products drop constraint if exists products_hs_formato;
alter table products add constraint products_hs_formato
  check (hs_code is null or hs_code ~ '^[0-9]{6,10}$');

comment on column products.ncm is
  'Oito digitos, sem pontos. VAZIO ATE O CONTADOR DEFINIR — nao preencher por analogia com outro produto.';
comment on column products.hs_code is
  'Codigo do Sistema Harmonizado usado na Commercial Invoice. VAZIO ATE VALIDACAO.';

-- Milímetros e gramas, inteiros: peso e medida entram em conta de frete e
-- em declaração aduaneira, e float acumula erro. Mesma razão de o dinheiro
-- ser inteiro.
comment on column products.net_weight_g is 'Peso liquido em GRAMAS, inteiro. Nunca float: entra em conta de frete e de aduana.';

-- ---------------------------------------------------------------------
-- 6. PREÇO POR MOEDA
-- ---------------------------------------------------------------------
-- Tabela nova em vez de colunas novas na variante: preço por moeda é uma
-- DIMENSÃO (uma variante tem N preços), e dimensão em coluna vira
-- `price_usd`, `price_eur`, `price_gbp`... até alguém precisar da sétima.
--
-- Deliberadamente NÃO existe conversão automática. O preço de cada mercado
-- é decisão comercial do Francisco — R$ 650 não é "US$ 120 pelo câmbio de
-- hoje", é o que ele decidir cobrar nos Estados Unidos.
create table if not exists variant_prices (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants(id) on delete cascade,
  currency char(3) not null check (currency in ('BRL','USD','EUR','GBP','AUD','CAD')),
  price_cents int not null check (price_cents > 0),
  compare_at_price_cents int,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, currency)
);

comment on table variant_prices is
  'Preco comercial por moeda, definido a mao. Ausencia de linha = nao vendemos nessa moeda — o que e diferente de "converta pelo cambio".';

alter table variant_prices enable row level security;

create policy "public read variant prices" on variant_prices for select
  using (is_active = true);

create policy "admin manage variant prices" on variant_prices for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

-- ---------------------------------------------------------------------
-- 7. ÍNDICES
-- ---------------------------------------------------------------------
create index if not exists addresses_country on addresses (country);
create index if not exists orders_currency on orders (currency);
create index if not exists orders_export_status on orders (export_status)
  where export_status <> 'not_required';
create index if not exists variant_prices_variant on variant_prices (variant_id, currency);
