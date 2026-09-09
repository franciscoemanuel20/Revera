-- Conversão para Meta/GA4 é opcional. Ausência de consentimento é recusa:
-- pedidos antigos e qualquer cliente sem escolha explícita não são enviados.
alter table orders
  add column if not exists tracking_consent boolean not null default false;
