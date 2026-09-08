-- ===========================================================================
-- VIDEO EDITAVEL PELO PAINEL (08/09/2026)
-- ===========================================================================
-- Copia ASCII de supabase/migrations/00000000000016_video_editavel.sql,
-- pronta para colar no SQL Editor do Supabase (colar acento pelo Chrome
-- corrompe o texto -- ver a licao registrada no historico deste projeto).
--
-- O que isto faz: deixa a coluna "tipo" de site_texts aceitar 'video' (ate
-- aqui so' aceitava texto/paragrafo/imagem), e sobe o teto do bucket
-- site-media de 10 MB para 30 MB, para caber um video de verdade.
--
-- Sem efeito colateral em nada que ja existe: o "drop constraint if
-- exists" seguido do "add constraint" so troca a lista de valores aceitos,
-- e o update do bucket so muda um numero (limite de tamanho), nao apaga
-- nada.
-- ===========================================================================

alter table site_texts drop constraint if exists site_texts_tipo_check;
alter table site_texts
  add constraint site_texts_tipo_check
  check (tipo in ('texto', 'paragrafo', 'imagem', 'video'));

update storage.buckets
   set file_size_limit = 31457280 -- 30 MB (era 10 MB)
 where id = 'site-media';
