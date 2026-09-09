-- Fotos que originalmente vieram em public/media passam a ter um registro
-- estável no banco. source_path é o contrato com o caminho que o código usava
-- antes da migração; a URL pode mudar sem quebrar uma página que ainda o usa.
create table if not exists site_media_assets (
  id uuid primary key default gen_random_uuid(),
  source_path text unique,
  storage_path text not null unique,
  url text not null,
  nome text not null,
  tamanho bigint not null default 0,
  tipo text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table site_media_assets is
  'Biblioteca de fotos do site. source_path preserva referências antigas de public/media; ativo=false remove a foto da exibição.';

create index if not exists site_media_assets_source_path_idx on site_media_assets(source_path);
alter table site_media_assets enable row level security;

drop policy if exists "public read site media assets" on site_media_assets;
create policy "public read site media assets" on site_media_assets for select using (true);

drop policy if exists "auth manage site media assets" on site_media_assets;
create policy "admin manage site media assets" on site_media_assets for all
  to authenticated
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));
