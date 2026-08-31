-- ===========================================================================
-- ATENÇÃO — RODE AS DUAS PARTES SEPARADAMENTE (31/08/2026)
-- ===========================================================================
-- O editor SQL do Supabase roda o script inteiro em UMA TRANSAÇÃO. A PARTE 2
-- mexe em `storage.objects`, que pertence a `supabase_storage_admin` e não ao
-- usuário do editor — se ela falhar por permissão, a transação inteira é
-- desfeita e as TABELAS DA PARTE 1 somem junto, sem aviso.
--
-- Foi o que aconteceu na primeira tentativa, em 31/08/2026: o script parecia
-- ter rodado e não havia criado nada.
--
-- Então: selecione e rode a PARTE 1. Confira. Depois a PARTE 2.
-- ===========================================================================

-- ===========================================================================
-- APLICAR NO SUPABASE — CONTEÚDO EDITÁVEL PELO PAINEL
-- Data: 30/08/2026
-- ===========================================================================
-- Cole ISTO INTEIRO no SQL Editor do Supabase da Reverá e rode.
--
-- É a migration 00000000000012_conteudo_editavel.sql. Seguro de rodar mais de
-- uma vez: tudo é "if not exists" ou "on conflict do update". Nenhuma tabela
-- é apagada, nenhuma coluna existente é alterada.
--
-- O QUE ELE CRIA:
--   site_texts   — as edições de texto feitas no painel
--   banners      — os banners do site
--   bucket site-media (PÚBLICO) — as fotos enviadas pelo painel
--
-- O QUE ACONTECE SE VOCÊ NÃO RODAR: o site continua funcionando normalmente,
-- com os textos do código. Só o painel de textos e o de fotos é que ficam em
-- modo leitura, avisando que falta aplicar isto.
-- ===========================================================================

-- ###########################################################################
-- PARTE 1 — AS TABELAS (rode esta primeiro, sozinha)
-- ###########################################################################

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


-- ###########################################################################
-- PARTE 2 — O BUCKET DAS FOTOS (rode SEPARADO da parte 1)
-- ###########################################################################
-- Se esta parte falhar com "must be owner of table objects", NÃO insista: o
-- bucket se cria pelo painel, em Storage → New bucket:
--
--     nome    : site-media
--     público : SIM (marcado)
--
-- E as quatro políticas abaixo passam a ser desnecessárias: bucket público
-- criado pelo painel já nasce com leitura pública, e a escrita pelo painel do
-- admin usa a chave de serviço, que ignora RLS.
-- ###########################################################################

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


-- ===========================================================================
-- CONFERÊNCIA — rode depois e confira as três linhas
-- ===========================================================================
-- select 'site_texts' as objeto, count(*)::text as linhas from site_texts
-- union all
-- select 'banners', count(*)::text from banners
-- union all
-- select 'bucket site-media', coalesce((select case when public then 'publico' else 'PRIVADO (errado)' end
--   from storage.buckets where id = 'site-media'), 'NAO EXISTE');

-- ===========================================================================
-- DESFAZER (só se precisar; apaga o que foi editado no painel)
-- ===========================================================================
-- drop table if exists site_texts;
-- drop table if exists banners;
-- delete from storage.objects where bucket_id = 'site-media';
-- delete from storage.buckets where id = 'site-media';
