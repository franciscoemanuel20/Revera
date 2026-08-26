-- ============================================================================
-- ATRIBUIÇÃO: de onde veio a pessoa que comprou
-- ============================================================================
-- Sem estas colunas, a conversão enviada pelo servidor chega ANÔNIMA. A Meta
-- e o Google recebem "houve uma compra de R$ 1.600" e não conseguem ligar
-- isso ao clique no anúncio que a produziu. O resultado prático: a campanha
-- que trouxe a venda não recebe o crédito, o algoritmo otimiza no escuro, e o
-- relatório mostra custo por resultado pior que o real.
--
-- É o que já aconteceu no site irmão até 22/08/2026 — a venda aparecia na
-- Meta e sumia no Google e no TikTok, porque só a Meta tinha caminho de
-- servidor. A diferença entre medir e não medir é dinheiro de mídia gasto sem
-- saber o que funcionou.
--
-- Nada aqui é preenchido pelo navegador com liberdade: os valores vêm de
-- cookies que as próprias plataformas escrevem (_fbp, _fbc, _ga) e da query
-- string do anúncio. IP e user-agent quem preenche é o servidor, na criação
-- do pedido — o navegador não tem como mentir sobre eles.

alter table orders
  -- Meta: cookies do próprio pixel. _fbp identifica o navegador; _fbc guarda
  -- o clique no anúncio (derivado do fbclid). São os dois sinais que mais
  -- pesam na qualidade de correspondência da Conversions API.
  add column if not exists fbp text,
  add column if not exists fbc text,

  -- GA4: o client_id do cookie _ga. SEM ELE o Measurement Protocol cria um
  -- usuário novo a cada compra, e a jornada (anúncio → visita → compra) se
  -- parte em duas pessoas diferentes no relatório.
  add column if not exists ga_client_id text,

  -- Identificadores de clique, guardados crus. Servem quando o cookie falhou
  -- (bloqueador, Safari) e para conferência manual.
  add column if not exists fbclid text,
  add column if not exists gclid text,

  -- Campanha. Guardados individualmente, e não num jsonb, porque relatório de
  -- origem é a consulta mais frequente que a operação faz — e um jsonb
  -- transforma "quanto veio do Instagram" numa consulta que ninguém escreve.
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,

  -- Exigidos pela Conversions API para correspondência decente. Preenchidos
  -- pelo SERVIDOR a partir dos cabeçalhos da requisição, nunca pelo corpo:
  -- IP que o navegador informa não é IP, é opinião.
  add column if not exists client_ip text,
  add column if not exists user_agent text;

comment on column orders.ga_client_id is
  'client_id do cookie _ga. Sem ele o GA4 conta a compra como de um usuário novo e quebra a jornada no relatório.';
comment on column orders.client_ip is
  'Preenchido pelo servidor a partir dos cabeçalhos. Nunca aceitar do corpo da requisição.';

-- ============================================================================
-- O GOOGLE TAMBÉM PRECISA DE UM LUGAR PARA DIZER "ENVIADO"
-- ============================================================================
-- pixel_event_log já tinha sent_web (navegador) e sent_capi (Meta servidor).
-- Faltava a terceira: o GA4 pelo Measurement Protocol. Sem coluna própria,
-- um reenvio para a Meta reenviaria para o Google junto, duplicando a receita
-- no relatório do GA4.
alter table pixel_event_log
  add column if not exists sent_ga4 boolean not null default false;

-- ============================================================================
-- O REGISTRO DE CADA TENTATIVA
-- ============================================================================
-- Regra herdada do site irmão: SILÊNCIO NÃO É DIAGNÓSTICO.
--
-- Toda tentativa de enviar conversão é registrada — inclusive as PULADAS, com
-- o motivo ("META_CAPI_TOKEN vazia"). Sem isso, "a venda não apareceu no
-- Google" vira uma investigação de horas; com isso, é uma consulta.
create table if not exists conversion_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  event_name text not null,
  event_id text,
  plataforma text not null,          -- 'meta' | 'ga4'
  sucesso boolean not null,
  -- Preenchido quando não foi enviado. Diz QUAL variável está faltando, em
  -- vez de um "não configurado" que não ajuda ninguém.
  motivo_pulado text,
  http_status int,
  resposta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversion_logs_order_idx on conversion_logs (order_id);
create index if not exists conversion_logs_created_idx on conversion_logs (created_at desc);

alter table conversion_logs enable row level security;

-- Mesma regra do resto do banco: sem policy pública, só service role escreve.
-- O admin logado precisa LER para diagnosticar conversão que não chegou.
drop policy if exists "admin read conversion_logs" on conversion_logs;
create policy "admin read conversion_logs" on conversion_logs for select
  using (exists (select 1 from admin_users where id = auth.uid()));
