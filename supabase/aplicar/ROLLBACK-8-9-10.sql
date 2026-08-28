-- ===========================================================================
-- ROLLBACK das migrations 8+9+10 — SO PARA EMERGENCIA (28/08/2026)
-- ===========================================================================
-- Desfaz o schema novo e devolve `orders.status` a coluna comum, no formato
-- que o codigo ANTIGO (main @ 8cffe89) espera. Usar SOMENTE se o deploy novo
-- precisar ser revertido no Vercel E o site antigo voltar ao ar — o codigo
-- novo NAO roda com este rollback aplicado.
--
-- Perda aceita ao rodar: colunas internacionais/aceite e a tabela de
-- cotacoes (em emergencia real elas estarao vazias ou quase). Os eixos
-- payment/shipping sao recolapsados no status legado antes de sair.

begin;

-- 10 ----------------------------------------------------------------
alter table orders drop column if exists intl_shipping_quote_id;
drop table if exists intl_shipping_quotes;
alter table orders drop constraint if exists aceite_completo_ou_ausente;
alter table orders drop column if exists terms_version;
alter table orders drop column if exists terms_accepted_at;

-- 9 -----------------------------------------------------------------
alter table orders drop constraint if exists cambio_coerente_com_moeda;
alter table orders drop constraint if exists orders_currency_suportada;
alter table orders drop column if exists exchange_rate;
alter table orders drop column if exists exchange_rate_source;
alter table orders drop column if exists exchange_rate_date;
alter table orders drop column if exists tax_cents;
alter table orders drop column if exists currency;
alter table orders drop constraint if exists orders_export_status_valido;
alter table orders drop column if exists export_status;
drop table if exists variant_prices;
alter table products
  drop column if exists description_en,
  drop column if exists country_of_origin,
  drop column if exists ncm,
  drop column if exists hs_code,
  drop column if exists net_weight_g,
  drop column if exists gross_weight_g,
  drop column if exists length_mm,
  drop column if exists width_mm,
  drop column if exists height_mm;
alter table customers drop constraint if exists customers_country_iso2;
alter table customers drop column if exists foreign_tax_id;
alter table customers drop column if exists country;
alter table addresses drop constraint if exists endereco_completo_por_pais;
alter table addresses drop constraint if exists addresses_country_iso2;
alter table addresses
  drop column if exists country,
  drop column if exists company,
  drop column if exists line1,
  drop column if exists line2,
  drop column if exists postal_code,
  drop column if exists region;
-- volta a obrigatoriedade brasileira original
update addresses set cep = coalesce(cep,''), street = coalesce(street,''),
  number = coalesce(number,''), neighborhood = coalesce(neighborhood,''),
  state = coalesce(state,'');
alter table addresses alter column cep set not null;
alter table addresses alter column street set not null;
alter table addresses alter column number set not null;
alter table addresses alter column neighborhood set not null;
alter table addresses alter column state set not null;

-- 8 -----------------------------------------------------------------
-- status volta a coluna COMUM, derivada uma ultima vez dos eixos.
alter table orders drop column if exists status;
alter table orders add column status text not null default 'new';
update orders set status = case
  when canceled_at is not null            then 'canceled'
  when shipping_status = 'delivered'      then 'delivered'
  when shipping_status = 'shipped'        then 'shipped'
  when shipping_status = 'label_created'  then 'label_ready'
  when shipping_status = 'label_processing' then 'preparing'
  when payment_status  = 'paid'           then 'paid'
  else 'new' end;
alter table orders add constraint orders_status_check
  check (status in ('new','paid','preparing','label_ready','shipped','delivered','canceled','warranty'));
alter table orders drop constraint if exists envio_exige_pagamento;
alter table orders drop column if exists payment_status;
alter table orders drop column if exists shipping_status;
drop table if exists order_notifications;

commit;
