-- ===========================================================================
-- APLICAR NO SUPABASE — BUCKET DAS FOTOS DO SITE
-- Data: 31/08/2026
-- ===========================================================================
-- Separado de CONTEUDO-EDITAVEL.sql em 31/08/2026, e a razão é concreta: o
-- aplicador roda TUDO numa transação só. As políticas de `storage.objects`
-- pertencem a `supabase_storage_admin` e podem ser recusadas por permissão —
-- e aí a transação inteira cai, levando junto as TABELAS, sem aviso nenhum.
--
-- Do lado de fora isso é indistinguível de "o SQL não rodou". Foi o que
-- aconteceu em 31/08.
--
-- Se ESTE arquivo falhar com "must be owner of table objects", não insista:
-- crie o bucket pelo painel, em Storage → New bucket, nome `site-media`,
-- com "Public bucket" MARCADO. Bucket público criado pelo painel já nasce
-- com leitura pública, e o admin escreve com a chave de serviço, que ignora
-- RLS — as quatro políticas abaixo viram desnecessárias.
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
