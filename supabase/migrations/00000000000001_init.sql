create extension if not exists pgcrypto;

-- CATÁLOGO
create table products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  base_type text,
  base_thickness_mm numeric,
  is_featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  seo_title text,
  seo_description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sizes (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null default 0
);

create table colors (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  hex_preview text,
  photo_url text,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table gray_levels (
  id uuid primary key default gen_random_uuid(),
  percent int not null unique check (percent between 0 and 100),
  label text not null,
  photo_url text,
  uses_synthetic_fiber boolean not null default true,
  sort_order int not null default 0
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text unique not null,
  size_id uuid references sizes(id),
  color_id uuid references colors(id),
  gray_level_id uuid references gray_levels(id),
  length_cm numeric,
  stock_qty int not null default 0,
  price_cents int not null,
  compare_at_price_cents int,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, size_id, color_id, gray_level_id, length_cm)
);

create table product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete cascade,
  type text not null check (type in ('image','video')),
  url text not null,
  alt_text text,
  poster_url text,
  sort_order int not null default 0,
  is_primary boolean not null default false
);

-- PREÇO
create table quantity_discount_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  min_qty int not null,
  unit_price_cents int,
  discount_percent numeric,
  label text,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order int not null default 0,
  is_active boolean not null default true
);

-- VENDA
create table customers (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  full_name text,
  cpf text,
  created_at timestamptz not null default now()
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  label text,
  recipient_name text not null,
  cep text not null,
  street text not null,
  number text not null,
  complement text,
  neighborhood text not null,
  city text not null,
  state text not null,
  created_at timestamptz not null default now()
);

create table carts (
  id uuid primary key default gen_random_uuid(),
  token uuid unique not null default gen_random_uuid(),
  customer_id uuid references customers(id),
  status text not null default 'open' check (status in ('open','converted','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  access_token uuid unique not null default gen_random_uuid(),
  customer_id uuid references customers(id),
  address_id uuid references addresses(id),
  status text not null default 'new' check (status in ('new','paid','preparing','label_ready','shipped','delivered','canceled','warranty')),
  subtotal_cents int not null,
  discount_cents int not null default 0,
  shipping_cents int not null default 0,
  total_cents int not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  product_name_snapshot text not null,
  variant_label_snapshot text,
  unit_price_cents int not null,
  quantity int not null,
  subtotal_cents int not null
);

-- PAGAMENTO E FRETE
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  method text,
  status text not null default 'pending' check (status in ('pending','approved','failed','refunded')),
  amount_cents int not null,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references payments(id) on delete cascade,
  provider text not null,
  event_type text,
  provider_event_id text,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid references carts(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,
  service_name text,
  carrier text,
  price_cents int,
  eta_days int,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null default 'superfrete',
  provider_shipment_id text,
  service_name text,
  tracking_code text,
  label_url text,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tracking_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  status text,
  description text,
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);

-- RELACIONAMENTO
create table color_help_requests (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  contact text not null,
  photo_url text not null,
  status text not null default 'new' check (status in ('new','answered','closed')),
  suggested_color_id uuid references colors(id),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table warranty_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  description text not null,
  photo_urls text[],
  video_urls text[],
  status text not null default 'new' check (status in ('new','in_review','approved','denied')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table professional_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  business_name text,
  city text,
  message text,
  status text not null default 'new' check (status in ('new','contacted','converted','declined')),
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  customer_name text not null,
  city text,
  professional_name text,
  rating int check (rating between 1 and 5),
  comment text,
  photo_url text,
  video_url text,
  is_published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- PLATAFORMA
create table admin_users (
  id uuid primary key references auth.users(id),
  full_name text,
  role text not null default 'operator' check (role in ('owner','operator')),
  created_at timestamptz not null default now()
);

create table site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table content_blocks (
  id uuid primary key default gen_random_uuid(),
  section_key text unique not null,
  title text,
  body text,
  media_url text,
  is_visible boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table faq_items (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  is_visible boolean not null default true
);

create table pixel_event_log (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_id text not null,
  order_id uuid references orders(id),
  payload jsonb,
  sent_web boolean not null default false,
  sent_capi boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_name, event_id)
);

create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  event_name text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references admin_users(id),
  action text not null,
  entity_type text,
  entity_id text,
  diff jsonb,
  created_at timestamptz not null default now()
);

-- RLS: habilitar em tudo
alter table products enable row level security;
alter table product_variants enable row level security;
alter table product_media enable row level security;
alter table colors enable row level security;
alter table gray_levels enable row level security;
alter table sizes enable row level security;
alter table quantity_discount_rules enable row level security;
alter table faq_items enable row level security;
alter table content_blocks enable row level security;
alter table reviews enable row level security;
alter table customers enable row level security;
alter table addresses enable row level security;
alter table carts enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table payment_events enable row level security;
alter table shipping_quotes enable row level security;
alter table shipments enable row level security;
alter table tracking_events enable row level security;
alter table color_help_requests enable row level security;
alter table warranty_requests enable row level security;
alter table professional_leads enable row level security;
alter table admin_users enable row level security;
alter table site_settings enable row level security;
alter table pixel_event_log enable row level security;
alter table analytics_events enable row level security;
alter table audit_logs enable row level security;

-- Leitura pública só do que é seguro mostrar na vitrine
create policy "public read active products" on products for select using (status = 'active');
create policy "public read variants" on product_variants for select using (is_active = true);
create policy "public read media" on product_media for select using (true);
create policy "public read colors" on colors for select using (is_active = true);
create policy "public read gray levels" on gray_levels for select using (true);
create policy "public read sizes" on sizes for select using (true);
create policy "public read discount rules" on quantity_discount_rules for select using (is_active = true);
create policy "public read faq" on faq_items for select using (is_visible = true);
create policy "public read content" on content_blocks for select using (is_visible = true);
create policy "public read reviews" on reviews for select using (is_published = true);

-- Tudo mais: sem policy pública = só service role (backend) acessa. Admin CRUD entra em fase futura via policy checando admin_users.
