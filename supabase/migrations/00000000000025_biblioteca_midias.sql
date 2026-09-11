-- A biblioteca agora guarda fotos e vídeos no mesmo lugar. `tipo` preserva
-- o MIME original (image/jpeg, video/mp4 etc.); `categoria` é a pasta que o
-- administrador enxerga, sem interferir no endereço público do arquivo.
alter table site_media_assets
  add column if not exists categoria text not null default 'Geral';

create index if not exists site_media_assets_categoria_idx
  on site_media_assets (categoria);

comment on column site_media_assets.categoria is
  'Categoria visível da Biblioteca de mídias. Organização não altera o arquivo nem seus vínculos.';
