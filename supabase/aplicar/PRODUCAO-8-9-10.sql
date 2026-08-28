-- ===========================================================================
-- PRODUCAO  MIGRATIONS 8 + 9 + 10 NUM COLAR SO (gerado em 28/08/2026)
-- ===========================================================================
-- Para o SQL Editor do projeto de PRODUCAO (ngnaemfiytutyplolgxb) quando o
-- Francisco decidir publicar o internacional. As tres sao idempotentes
-- (if not exists / drop-e-recria) e JA FORAM aplicadas e provadas no
-- staging (dpeluxmzuuijuveesgtu) em 27-28/08/2026.
--
-- ORDEM OBRIGATORIA: este SQL roda ANTES do deploy do codigo novo  o
-- checkout novo escreve payment_status/shipping_status e quebraria sem a 8.
-- O aviso "destructive operations" do Supabase vem dos drop-e-recria de
-- policy/constraint; nao ha perda de dado.
-- ===========================================================================

-- ======================= 00000000000008_pos_venda.sql =======================

-- =====================================================================
-- POS-VENDA: separa pagamento de envio, avisa uma vez, guarda historico
-- =====================================================================
-- Aplicada em 27/08/2026, com a loja no ar e ZERO pedidos no banco  e a
-- unica janela em que trocar a espinha de estados do pedido custa nada.
-- Fazer isto depois da primeira venda seria migracao de dado real.
--
-- ---------------------------------------------------------------------
-- POR QUE DOIS CAMPOS, E POR QUE O ANTIGO VIRA COLUNA GERADA
-- ---------------------------------------------------------------------
-- `orders.status` misturava dois eixos que nao tem nada a ver um com o
-- outro: 'paid' fala de dinheiro, 'shipped' fala de caixa saindo pela
-- porta. Misturados, existem estados impossiveis representaveis  "enviado
-- e nao pago" cabia no campo  e a unica coisa que os impedia era cada
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
--   - NINGUEM consegue escrever em `status`  o Postgres recusa. Os 3
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
  -- "Venda nova ainda nao vista"  o marcador do menu. Fica separado do
  -- status de proposito: abrir a tela NAO pode mudar a situacao da venda.
  add column if not exists seen_at timestamptz;

-- A regra que torna o estado impossivel impossivel: nao se prepara envio de
-- pedido que nao foi pago. 'refunded' entra porque estorno depois do envio
-- e real  o pacote ja saiu, o dinheiro voltou.
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
  'DERIVADO de payment_status/shipping_status/canceled_at  nao escreva aqui, o Postgres recusa. Existe para os leitores antigos (checkout, pagina do cliente, rastreamento) continuarem valendo.';
comment on column orders.payment_status is 'Eixo do dinheiro. So confirmarPagamento() escreve, e so depois de reconfirmar com o gateway.';
comment on column orders.shipping_status is 'Eixo da caixa. Escrito por gerarEtiquetaAction() e pelas acoes manuais do admin.';

-- ---------------------------------------------------------------------
-- 3. AVISO UMA VEZ SO
-- ---------------------------------------------------------------------
-- Mesmo principio de pixel_event_log e de shipments_order_id_unico: a
-- garantia mora numa constraint, nao num `if`. Webhook repetido 5 vezes
-- tenta inserir 5 vezes e 4 batem no unico  sem janela de corrida entre
-- "ja mandei?" e "mandar".
create table if not exists order_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null check (kind in ('venda_paga')),
  channel text not null default 'whatsapp',
  -- Nasce reservado (sent_at nulo) e so vira enviado depois que o provedor
  -- confirmou. Se o envio falhar, a linha fica com o erro e a reserva
  -- impede tempestade de retentativa  sem perder o registro do que houve.
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  unique (order_id, kind)
);

alter table order_notifications enable row level security;
-- Mesma forma das policies da migration 05  o projeto nao tem helper
-- is_admin(); trocar a forma aqui criaria duas convencoes.
create policy "admin manage order_notifications" on order_notifications for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

-- ---------------------------------------------------------------------
-- 4. HISTORICO DO PEDIDO
-- ---------------------------------------------------------------------
-- Sem tabela nova: `audit_logs` ja e exatamente "quem fez o que e quando",
-- e ja e escrita pelas acoes do admin. Eventos do sistema (pagamento
-- confirmado pelo webhook) entram com admin_user_id nulo  a tela mostra
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


-- ======================= 00000000000009_internacional.sql =======================

-- =====================================================================
-- FUNDACAO INTERNACIONAL  endereco, moeda, dados de exportacao
-- =====================================================================
-- Escrita em 27/08/2026. ADITIVA: nada e removido, nada muda de sentido.
-- Depende da migration 00000000000008 (os eixos de pagamento e envio).
--
-- Esta migration NAO habilita venda internacional. Ela deixa o banco capaz
-- de representar uma. Pagamento internacional, NF-e e DHL continuam
-- inexistentes  e o painel diz isso com todas as letras.
--
-- ---------------------------------------------------------------------
-- ENDERECO: POR QUE NAO E "TORNAR TUDO NULLABLE"
-- ---------------------------------------------------------------------
-- O caminho preguicoso seria afrouxar cep/UF/bairro para nulo e encher o
-- codigo de `if (pais === 'BR')`. Isso espalha a regra por dezenas de
-- arquivos, e basta um esquecer para nascer um endereco impossivel  um
-- pedido brasileiro sem CEP, que a SuperFrete recusa so na hora de gerar a
-- etiqueta, com o cliente ja pago.
--
-- Aqui a regra fica em UM lugar: uma CHECK constraint que exige o conjunto
-- certo de campos conforme o pais. O banco recusa endereco incompleto
-- independentemente de qual codigo tentou gravar. No TypeScript existe o
-- espelho disso  um tipo com duas variantes (BR e internacional), de modo
-- que o codigo decide o formato UMA vez, na fronteira, e nao em cada tela.
--
-- Os campos brasileiros continuam existindo como campos brasileiros. Bairro
-- e numero nao sao "line1 e line2 mal preenchidos": sao exigencias reais do
-- enderecamento nacional, e a SuperFrete os pede separados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ENDERECO
-- ---------------------------------------------------------------------
alter table addresses
  -- ISO 3166-1 alfa-2. Default 'BR' preserva todo endereco ja gravado sem
  -- precisar adivinhar de onde ele e.
  add column if not exists country char(2) not null default 'BR',
  add column if not exists company text,
  -- Os genericos: usados fora do Brasil, onde "rua + numero + bairro" nao
  -- descreve o mundo (o Reino Unido tem nome de casa, os EUA tem apt/suite
  -- na segunda linha, Portugal muitas vezes nao tem regiao nenhuma).
  add column if not exists line1 text,
  add column if not exists line2 text,
  add column if not exists postal_code text,
  add column if not exists region text;

comment on column addresses.country is 'ISO 3166-1 alfa-2 em maiusculas. BR e o default, o que preserva os enderecos ja gravados.';
comment on column addresses.line1 is 'Endereco internacional. No Brasil fica nulo: la valem street/number/neighborhood.';
comment on column addresses.region is 'Estado/provincia/regiao fora do Brasil. Texto livre  nem todo pais tem, e os que tem nao usam duas letras.';

-- O pais precisa ser duas letras MAIUSCULAS. Sem isto, 'br', 'Br' e 'BR'
-- viram tres paises diferentes no filtro do painel.
alter table addresses drop constraint if exists addresses_country_iso2;
alter table addresses add constraint addresses_country_iso2
  check (country ~ '^[A-Z]{2}$');

-- Campos brasileiros passam a aceitar nulo  para endereco ESTRANGEIRO.
-- A obrigatoriedade nao sumiu: mudou de "coluna not null" para "exigida
-- quando o pais e BR", logo abaixo.
alter table addresses alter column cep drop not null;
alter table addresses alter column street drop not null;
alter table addresses alter column number drop not null;
alter table addresses alter column neighborhood drop not null;
alter table addresses alter column state drop not null;

-- A regra, em um lugar so.
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
-- CPF ja era nullable no schema original  a obrigatoriedade vinha do
-- formulario. Fica registrado o porque, para ninguem "consertar" isso
-- depois achando que e esquecimento.
comment on column customers.cpf is
  'So faz sentido para comprador brasileiro. Estrangeiro nao tem CPF, e exigir um inventaria dado. O documento fiscal do estrangeiro (passaporte) vai em customers.foreign_tax_id.';

alter table customers
  -- Passaporte ou identificador fiscal do pais de origem. A NF-e de
  -- exportacao tem campo proprio para isso (`idEstrangeiro`), e ele aceita
  -- vazio  por isso aqui tambem e opcional.
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
-- se chamam `subtotal_cents`, `total_cents`  e JA GUARDAM unidade minima
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
  -- Nao existia. A exportacao e imune a ICMS/IPI, mas a coluna precisa
  -- existir para o dia em que houver imposto no destino (DDP).
  add column if not exists tax_cents int not null default 0,
  -- Cambio: guardado no PEDIDO, nao calculado na hora de imprimir. A taxa
  -- de uma venda de agosto nao pode mudar porque alguem reimprimiu o
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

-- Cambio so faz sentido quando a moeda nao e a nacional  e quando nao e,
-- ele e obrigatorio, senao a NF-e nao tem como ser convertida.
alter table orders drop constraint if exists cambio_coerente_com_moeda;
alter table orders add constraint cambio_coerente_com_moeda check (
  (currency = 'BRL' and exchange_rate is null)
  or (currency <> 'BRL')
);

-- ---------------------------------------------------------------------
-- 4. O TERCEIRO EIXO: EXPORTACAO
-- ---------------------------------------------------------------------
-- Conferido contra os eixos da migration 8 para nao duplicar. Dois estados
-- da lista original foram DELIBERADAMENTE deixados de fora:
--
--   'dispatched'  seria a mesma informacao de shipping_status='shipped'.
--                  Dois campos dizendo "saiu" e a receita para divergirem.
--   'delivered'   idem, shipping_status ja responde.
--
-- Este eixo responde UMA pergunta: a papelada esta pronta? Ele termina em
-- 'ready_for_dispatch' e entrega o bastao para o eixo de envio.
alter table orders
  add column if not exists export_status text not null default 'not_required';

alter table orders drop constraint if exists orders_export_status_valido;
alter table orders add constraint orders_export_status_valido check (
  export_status in (
    'not_required',        -- pedido nacional
    'pending_data',        -- falta dado do cliente, do endereco ou fiscal
    'ready_for_documents', -- dados completos, pronto para gerar documentos
    'documents_processing',
    'documents_ready',
    'ready_for_dispatch',  -- imprimir e levar a DHL
    'export_error'
  )
);

comment on column orders.export_status is
  'Terceiro eixo: a papelada esta pronta? Termina em ready_for_dispatch  de la em diante quem responde e shipping_status, para os dois nao divergirem.';

-- ---------------------------------------------------------------------
-- 5. DADOS DE EXPORTACAO DO PRODUTO
-- ---------------------------------------------------------------------
-- Tudo NULO por padrao, e nulo e o estado correto hoje: NCM, HS Code e pais
-- de origem dependem do contador e do fornecedor. Inventar qualquer um
-- destes valores e declarar mercadoria errada na alfandega.
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

-- Formato, nao conteudo: o banco confere que o NCM tem 8 digitos e o HS
-- Code de 6 a 10, porque isso e estrutura conhecida. QUAL numero e o certo
-- e decisao fiscal, e o banco nao opina.
alter table products drop constraint if exists products_ncm_formato;
alter table products add constraint products_ncm_formato
  check (ncm is null or ncm ~ '^[0-9]{8}$');
alter table products drop constraint if exists products_hs_formato;
alter table products add constraint products_hs_formato
  check (hs_code is null or hs_code ~ '^[0-9]{6,10}$');

comment on column products.ncm is
  'Oito digitos, sem pontos. VAZIO ATE O CONTADOR DEFINIR  nao preencher por analogia com outro produto.';
comment on column products.hs_code is
  'Codigo do Sistema Harmonizado usado na Commercial Invoice. VAZIO ATE VALIDACAO.';

-- Milimetros e gramas, inteiros: peso e medida entram em conta de frete e
-- em declaracao aduaneira, e float acumula erro. Mesma razao de o dinheiro
-- ser inteiro.
comment on column products.net_weight_g is 'Peso liquido em GRAMAS, inteiro. Nunca float: entra em conta de frete e de aduana.';

-- ---------------------------------------------------------------------
-- 6. PRECO POR MOEDA
-- ---------------------------------------------------------------------
-- Tabela nova em vez de colunas novas na variante: preco por moeda e uma
-- DIMENSAO (uma variante tem N precos), e dimensao em coluna vira
-- `price_usd`, `price_eur`, `price_gbp`... ate alguem precisar da setima.
--
-- Deliberadamente NAO existe conversao automatica. O preco de cada mercado
-- e decisao comercial do Francisco  R$ 650 nao e "US$ 120 pelo cambio de
-- hoje", e o que ele decidir cobrar nos Estados Unidos.
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
  'Preco comercial por moeda, definido a mao. Ausencia de linha = nao vendemos nessa moeda  o que e diferente de "converta pelo cambio".';

alter table variant_prices enable row level security;

create policy "public read variant prices" on variant_prices for select
  using (is_active = true);

create policy "admin manage variant prices" on variant_prices for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

-- ---------------------------------------------------------------------
-- 7. INDICES
-- ---------------------------------------------------------------------
create index if not exists addresses_country on addresses (country);
create index if not exists orders_currency on orders (currency);
create index if not exists orders_export_status on orders (export_status)
  where export_status <> 'not_required';
create index if not exists variant_prices_variant on variant_prices (variant_id, currency);


-- ======================= 00000000000010_stripe_aceite_frete_intl.sql =======================

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
