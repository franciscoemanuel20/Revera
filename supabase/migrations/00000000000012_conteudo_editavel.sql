-- ===========================================================================
-- CONTEÚDO EDITÁVEL PELO PAINEL (30/08/2026)
-- ===========================================================================
-- Pedido do Francisco: poder trocar texto e foto do site sem mexer em código
-- e sem depender de deploy.
--
-- ---------------------------------------------------------------------------
-- A DECISÃO QUE GOVERNA ESTE ARQUIVO: O BANCO SOBRESCREVE, NUNCA ESVAZIA
-- ---------------------------------------------------------------------------
-- O texto de cada página CONTINUA escrito no código, e continua sendo o que
-- aparece por padrão. Esta tabela guarda só o que o Francisco EDITOU.
--
-- Página lê: "existe linha para a chave X? usa. Não existe? usa o do código."
--
-- É o contrário do CMS comum, que move o texto para o banco e deixa a página
-- em branco quando a consulta falha. Aqui, banco fora do ar, linha apagada
-- por engano, migration não aplicada — em todos esses casos o site mostra o
-- texto original, porque ele nunca saiu de dentro do código.
--
-- O custo dessa escolha é honesto: o texto existe em dois lugares, e quem
-- mexer no código precisa saber que o banco pode estar mandando outra coisa.
-- Em troca, nenhuma edição no painel consegue derrubar a página — e quem vai
-- usar o painel não é programador.
--
-- ---------------------------------------------------------------------------
-- POR QUE UMA TABELA NOVA, E NÃO content_blocks
-- ---------------------------------------------------------------------------
-- `content_blocks` já existia, com aba própria no admin — e NENHUMA página
-- do site lê essa tabela. Ela tem 0 linhas e sempre teve: era uma tela que
-- gravava no vazio. Não dá para reaproveitar sem herdar a confusão, e o
-- formato dela (uma linha = uma seção com título+corpo+mídia) não descreve
-- o que as páginas realmente têm: 16 pedaços soltos em /garantia, 6 fatores
-- em /naturalidade, rótulo de botão, legenda de vídeo.
--
-- Aqui a unidade é o PEDAÇO DE TEXTO, com uma chave estável e um rótulo em
-- português que o painel mostra para quem edita.
-- ===========================================================================

create table if not exists site_texts (
  -- A chave é o contrato entre a página e o painel: "garantia.passo1".
  -- É texto e não uuid de propósito — quem escreve a página precisa
  -- conseguir digitar a chave, e ela precisa sobreviver a um seed refeito.
  chave text primary key,

  -- O que o Francisco escreveu. NULL não existe aqui: linha sem valor é
  -- linha que devia ter sido apagada, e apagar é o que devolve o texto do
  -- código.
  valor text not null,

  -- Onde isto aparece, para o painel agrupar. "home", "garantia", "rodape".
  pagina text not null,

  -- O nome que aparece no painel, em português de gente: "Título da página",
  -- "Passo 1 do teste dos fios". Nunca a chave crua.
  rotulo text not null,

  -- Muda a caixa de edição: linha curta ou área de texto grande.
  tipo text not null default 'texto' check (tipo in ('texto', 'paragrafo')),

  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  -- Quem mexeu por último. Texto editado errado é o tipo de coisa que
  -- alguém vai precisar rastrear depois.
  updated_by text
);

comment on table site_texts is
  'Textos do site EDITADOS pelo painel. Ausência de linha = usa o texto do código. Ver o cabeçalho da migration 12.';

create index if not exists site_texts_pagina_idx on site_texts (pagina, sort_order);

alter table site_texts enable row level security;

-- Leitura pública: o site inteiro é público, e o texto dele também é.
drop policy if exists "public read site texts" on site_texts;
create policy "public read site texts" on site_texts for select using (true);

-- Escrita só autenticado — o admin usa sessão autenticada, o visitante não.
drop policy if exists "auth write site texts" on site_texts;
create policy "auth write site texts" on site_texts for all
  to authenticated using (true) with check (true);


-- ===========================================================================
-- BANNERS
-- ===========================================================================
-- Não existia nada. Fica em tabela própria e não em site_texts porque banner
-- não é texto: é imagem + destino + janela de exibição, e some sozinho quando
-- a data passa. Banner que ficou no ar depois da promoção acabar é problema
-- comercial, não de layout.
-- ===========================================================================

create table if not exists banners (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  subtitulo text,
  imagem_url text,
  link_url text,
  link_rotulo text,
  -- Onde ele aparece. Começa só com a home; mais lugares entram aqui sem
  -- migration nova.
  local text not null default 'home' check (local in ('home', 'topo')),
  ativo boolean not null default false,
  -- Janela opcional. Nulo dos dois lados = sempre, enquanto ativo.
  inicia_em timestamptz,
  termina_em timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table banners is
  'Banners do site. Só aparece se ativo E dentro da janela de datas (quando houver).';

alter table banners enable row level security;

drop policy if exists "public read banners" on banners;
create policy "public read banners" on banners for select
  using (
    ativo = true
    and (inicia_em is null or inicia_em <= now())
    and (termina_em is null or termina_em >= now())
  );

drop policy if exists "auth write banners" on banners;
create policy "auth write banners" on banners for all
  to authenticated using (true) with check (true);


-- ===========================================================================
-- BUCKET PÚBLICO DAS IMAGENS DO SITE
-- ===========================================================================
-- Os outros dois buckets do projeto (color-help, pedidos-fotos) são PRIVADOS,
-- e com razão: guardam foto de cliente, e saem por URL assinada.
--
-- Este é público, e a diferença é deliberada. Aqui entra foto de produto e
-- banner — conteúdo que o site já mostra para qualquer visitante. URL
-- assinada expira, e foto de catálogo que expira é card quebrado no meio da
-- vitrine.
--
-- O que NÃO pode entrar aqui: foto enviada por cliente. Essa continua nos
-- buckets privados.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-media',
  'site-media',
  true,
  -- 10 MB. As fotos de cor de hoje têm ~800 KB; o teto existe para impedir
  -- que alguém suba um arquivo de câmera de 40 MB e derrube o carregamento
  -- da página no celular.
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read site media" on storage.objects;
create policy "public read site media" on storage.objects for select
  using (bucket_id = 'site-media');

drop policy if exists "auth write site media" on storage.objects;
create policy "auth write site media" on storage.objects for insert
  to authenticated with check (bucket_id = 'site-media');

drop policy if exists "auth update site media" on storage.objects;
create policy "auth update site media" on storage.objects for update
  to authenticated using (bucket_id = 'site-media');

drop policy if exists "auth delete site media" on storage.objects;
create policy "auth delete site media" on storage.objects for delete
  to authenticated using (bucket_id = 'site-media');
