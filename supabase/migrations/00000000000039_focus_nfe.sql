-- Uma referência por pedido em todos os ambientes. Após qualquer POST, a
-- operação só pode ser consultada/reconciliada; nunca reenviada automaticamente.
create table if not exists order_export_item_facts (
  order_item_id uuid primary key references order_items(id),
  order_id uuid not null references orders(id),
  ncm text not null check(ncm ~ '^[0-9]{8}$'),
  hs_code text not null check(hs_code ~ '^[0-9]{6,10}$'),
  country_of_origin char(2) not null check(country_of_origin ~ '^[A-Z]{2}$'),
  net_weight_g integer not null check(net_weight_g > 0),
  length_cm numeric not null check(length_cm > 0),
  width_cm numeric not null check(width_cm > 0),
  height_cm numeric not null check(height_cm > 0),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz not null default now(),
  constraint facts_item_order foreign key(order_id,order_item_id)
    references order_items(order_id,id)
);
alter table order_export_item_facts enable row level security;
create policy "admin read item facts" on order_export_item_facts for select to authenticated
  using (exists(select 1 from admin_users where id = auth.uid()));
create or replace function freeze_export_item_facts() returns trigger language plpgsql
security definer set search_path = public, pg_temp as $$
declare pedido_id uuid;
begin
  pedido_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  perform 1 from orders where id = pedido_id for update;
  if exists(select 1 from order_export_documents where order_id = pedido_id)
    or exists(select 1 from shipments where order_id = pedido_id)
    or exists(select 1 from order_focus_nfe where order_id = pedido_id) then
    raise exception 'Fatos físicos congelados após documento ou remessa';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create table if not exists focus_nfe_settings (
  singleton boolean primary key default true check (singleton),
  cfop text,
  natureza_operacao text,
  tributacao text,
  regime_exportacao text,
  serie text,
  numeracao text,
  emitente_confirmado boolean not null default false,
  contador_validou boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into focus_nfe_settings(singleton) values(true) on conflict do nothing;
alter table focus_nfe_settings enable row level security;
create policy "admin read focus settings" on focus_nfe_settings for select to authenticated
  using (exists(select 1 from admin_users where id = auth.uid()));
create policy "admin update focus settings" on focus_nfe_settings for update to authenticated
  using (exists(select 1 from admin_users where id = auth.uid()))
  with check (exists(select 1 from admin_users where id = auth.uid()));

create table if not exists order_focus_nfe (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id),
  reference text not null unique check(reference ~ '^[A-Z0-9]+$'),
  environment text not null check(environment in ('homologacao','producao')),
  status text not null check(status in ('reserved_unsent','response_unknown','processing','authorized','rejected','cancelled')),
  post_started_at timestamptz,
  number text,
  series text,
  access_key text check(access_key is null or access_key ~ '^[0-9]{44}$'),
  protocol text,
  rejection_reason text,
  xml_storage_path text,
  danfe_storage_path text,
  request_snapshot jsonb not null,
  response_sanitized jsonb not null default '{}'::jsonb,
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  consulted_at timestamptz,
  consultation_attempts integer not null default 0,
  authorized_at timestamptz,
  documents_at timestamptz,
  updated_at timestamptz not null default now(),
  check(status <> 'authorized' or access_key is not null)
);
alter table order_focus_nfe enable row level security;
create policy "admin read focus nfe" on order_focus_nfe for select to authenticated
  using (exists(select 1 from admin_users where id = auth.uid()));
create or replace function validate_focus_nfe_reservation() returns trigger language plpgsql
security definer set search_path = public, pg_temp as $$
declare pedido record;
begin
  select o.payment_status, o.canceled_at, a.country into pedido
    from orders o join addresses a on a.id = o.address_id
    where o.id = new.order_id for update of o;
  if not found or pedido.payment_status <> 'paid' or pedido.canceled_at is not null
    or pedido.country = 'BR' then
    raise exception 'Focus exige pedido internacional pago e não cancelado';
  end if;
  if exists(select 1 from order_export_documents where order_id = new.order_id and kind = 'nfe') then
    raise exception 'Pedido já tem NF-e vinculada';
  end if;
  return new;
end $$;
create trigger validate_focus_nfe_reservation before insert on order_focus_nfe
  for each row execute function validate_focus_nfe_reservation();
-- Writes intentionally require service_role. The unique order/reference keys
-- and immutable snapshot protect against duplicate POSTs and altered drafts.
create or replace function protect_focus_nfe() returns trigger language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.post_started_at is not null then
      raise exception 'Tentativa Focus enviada não pode ser apagada';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.order_id is distinct from old.order_id or new.reference is distinct from old.reference
      or new.environment is distinct from old.environment or new.request_snapshot is distinct from old.request_snapshot
      or new.requested_by is distinct from old.requested_by or new.requested_at is distinct from old.requested_at then
      raise exception 'Identidade e snapshot Focus são imutáveis';
    end if;
    if old.status in ('authorized','cancelled') and new.status is distinct from old.status then
      raise exception 'NF-e autorizada/cancelada não pode ser sobrescrita';
    end if;
    if old.post_started_at is not null and new.post_started_at is distinct from old.post_started_at then
      raise exception 'Início do POST Focus é imutável';
    end if;
    if old.post_started_at is null and new.post_started_at is not null and
      (old.status <> 'reserved_unsent' or new.status <> 'response_unknown') then
      raise exception 'Transição de envio Focus inválida';
    end if;
    if old.access_key is not null and new.access_key is distinct from old.access_key then
      raise exception 'Chave de acesso Focus é imutável';
    end if;
    if old.xml_storage_path is not null and new.xml_storage_path is distinct from old.xml_storage_path then
      raise exception 'XML Focus é imutável';
    end if;
    if old.danfe_storage_path is not null and new.danfe_storage_path is distinct from old.danfe_storage_path then
      raise exception 'DANFE Focus é imutável';
    end if;
  end if;
  return new;
end $$;
create trigger protect_focus_nfe_update before update or delete on order_focus_nfe
  for each row execute function protect_focus_nfe();

create or replace function freeze_snapshot_after_focus() returns trigger language plpgsql
security definer set search_path = public, pg_temp as $$
declare pedido_id uuid;
begin
  if tg_table_name = 'addresses' then
    if exists(select 1 from orders o join order_focus_nfe n on n.order_id = o.id
      where o.address_id = old.id) then
      raise exception 'Endereço congelado após tentativa Focus';
    end if;
  else
    pedido_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
    perform 1 from orders where id = pedido_id for update;
    if exists(select 1 from order_focus_nfe where order_id = pedido_id) then
      raise exception 'Snapshot fiscal congelado após tentativa Focus';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger freeze_focus_export_items before insert or update or delete on order_export_items
  for each row execute function freeze_snapshot_after_focus();
create trigger freeze_focus_order_items before insert or update or delete on order_items
  for each row execute function freeze_snapshot_after_focus();
create trigger freeze_focus_packages before insert or update or delete on order_export_packages
  for each row execute function freeze_snapshot_after_focus();
create trigger freeze_focus_addresses before update or delete on addresses
  for each row execute function freeze_snapshot_after_focus();
create trigger freeze_facts_fiscal before insert or update or delete on order_export_item_facts
  for each row execute function freeze_export_item_facts();

create table if not exists order_focus_nfe_events (
  id bigint generated always as identity primary key,
  focus_nfe_id uuid references order_focus_nfe(id) on delete set null,
  event text not null check(event in ('issue_requested','processing','authorized','rejected',
    'response_unknown','reconciled','documents_retrieved')),
  safe_detail jsonb not null default '{}'::jsonb,
  actor uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table order_focus_nfe_events enable row level security;
create policy "admin read focus events" on order_focus_nfe_events for select to authenticated
  using (exists(select 1 from admin_users where id = auth.uid()));

create table if not exists order_shipping_email_drafts (
  order_id uuid primary key references orders(id),
  locale text not null check(locale in ('pt','en','es','fr','de')),
  subject text not null,
  body text not null,
  tracking_code text not null,
  status text not null default 'prepared' check(status = 'prepared'),
  prepared_by uuid not null references auth.users(id),
  prepared_at timestamptz not null default now()
);
alter table order_shipping_email_drafts enable row level security;
create policy "admin read shipping drafts" on order_shipping_email_drafts for select to authenticated
  using (exists(select 1 from admin_users where id = auth.uid()));
create policy "admin create shipping drafts" on order_shipping_email_drafts for insert to authenticated
  with check (exists(select 1 from admin_users where id = auth.uid()) and prepared_by = auth.uid());

update storage.buckets set allowed_mime_types = array['application/pdf','application/xml','text/xml','image/jpeg','image/png']
  where id = 'export-documents' and public = false;
create or replace function protect_focus_fiscal_object() returns trigger language plpgsql
security definer set search_path = public, storage, pg_temp as $$
begin
  if old.bucket_id = 'export-documents' and exists(
    select 1 from order_focus_nfe where xml_storage_path = old.name or danfe_storage_path = old.name
  ) then raise exception 'Documento Focus vinculado é imutável'; end if;
  return old;
end $$;
create trigger protect_focus_fiscal_object before delete on storage.objects
  for each row execute function protect_focus_fiscal_object();
