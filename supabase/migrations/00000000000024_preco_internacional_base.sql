-- Proveniência da conversão autorizada em 10/09/2026. Não altera preços existentes.
alter table public.variant_prices add column if not exists pricing_basis jsonb;
comment on column public.variant_prices.pricing_basis is
  'Base BRL, cotação BCB, data, tarifa usada e preço anterior da última precificação. Não é taxa efetiva de liquidação.';
