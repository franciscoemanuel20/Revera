-- Checkout internacional observável, multigateway e pronto para expedição DHL.
-- Mudança inteiramente aditiva: nenhum histórico financeiro é reclassificado.

alter table orders drop constraint if exists orders_payment_preference_valida;
alter table orders add constraint orders_payment_preference_valida
  check (payment_preference in ('default', 'apple_pay', 'stripe', 'paypal'));

comment on column orders.payment_preference is
  'Preferencia escolhida no checkout: default, apple_pay (BRL), stripe ou paypal (internacional).';

create table if not exists payment_journey_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  payment_id uuid references payments(id) on delete set null,
  provider text,
  event_type text not null check (event_type in (
    'checkout_created',
    'checkout_redirected',
    'checkout_returned_unpaid',
    'checkout_canceled',
    'payment_declined',
    'payment_approved',
    'checkout_abandoned'
  )),
  source text not null check (source in ('server', 'browser', 'webhook', 'reconciliation', 'admin')),
  event_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_journey_order_created_idx
  on payment_journey_events (order_id, created_at desc);
create index if not exists payment_journey_type_created_idx
  on payment_journey_events (event_type, created_at desc);

alter table payment_journey_events enable row level security;
drop policy if exists "admin read payment_journey_events" on payment_journey_events;
create policy "admin read payment_journey_events" on payment_journey_events for select
  using (exists (select 1 from admin_users where id = auth.uid()));

alter table product_variants
  add column if not exists shipping_weight_g integer check (shipping_weight_g > 0),
  add column if not exists shipping_length_cm numeric check (shipping_length_cm > 0),
  add column if not exists shipping_width_cm numeric check (shipping_width_cm > 0),
  add column if not exists shipping_height_cm numeric check (shipping_height_cm > 0),
  add column if not exists customs_hs_code text,
  add column if not exists origin_country char(2)
    check (origin_country is null or origin_country ~ '^[A-Z]{2}$');

create table if not exists international_export_settings (
  singleton boolean primary key default true check (singleton),
  legal_name text,
  tax_id text,
  country char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  postal_code text,
  city text,
  region text,
  address_line1 text,
  contact_name text,
  phone text,
  email text,
  invoice_mode text not null default 'not_configured'
    check (invoice_mode in ('not_configured', 'external', 'api')),
  dhl_account_confirmed boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into international_export_settings (singleton)
values (true)
on conflict (singleton) do nothing;

alter table international_export_settings enable row level security;
drop policy if exists "admin manage international_export_settings" on international_export_settings;
create policy "admin manage international_export_settings" on international_export_settings for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

alter table shipments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column shipments.metadata is
  'Metadados operacionais sem segredo: documentos DHL, coleta e resposta sanitizada.';
