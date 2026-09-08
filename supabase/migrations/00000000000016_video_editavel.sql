-- ===========================================================================
-- VÍDEO EDITÁVEL PELO PAINEL (08/09/2026)
-- ===========================================================================
-- Estende o mecanismo de site_texts (migration 12: conteúdo editável) para
-- aceitar tipo 'video', e sobe o teto do bucket site-media para caber um
-- vídeo de verdade — a migration 12 pensou em foto (10 MB).
--
-- O comentário original em src/lib/conteudo/registro/home.ts (30/08/2026)
-- recusava deixar o vídeo editável porque um .mp4 real não cabia no limite
-- de 6 MB das Server Actions do Next: um vídeo trocado errado seria a peça
-- central da home no ar quebrada, e o limite de então nem deixava tentar
-- direito. Em vez de continuar contornando o sintoma, esta migration ataca
-- a causa junto com next.config.js (6mb -> 30mb) e
-- src/lib/conteudo/midia.ts (TAMANHO_MAXIMO_BYTES_VIDEO) — o vídeo passa a
-- caber, mas continua protegido pela MESMA validação de endereço
-- (motivoDeImagemInvalida) que já impede uma foto ruim de derrubar a
-- página, e pela mesma regra "sem linha = volta ao vídeo do código".
-- ===========================================================================

alter table site_texts drop constraint if exists site_texts_tipo_check;
alter table site_texts
  add constraint site_texts_tipo_check
  check (tipo in ('texto', 'paragrafo', 'imagem', 'video'));

update storage.buckets
   set file_size_limit = 31457280 -- 30 MB (era 10 MB, migration 12)
 where id = 'site-media';
