-- Liga cada pedido internacional à cotação DHL exata que foi apresentada e
-- confirmada pelo comprador. Não fazemos backfill por “cotação mais recente”:
-- isso poderia associar um pedido antigo a uma tarifa que ele não confirmou.
alter table public.orders
  add column if not exists shipping_quote_id uuid
    references public.shipping_quotes(id) on delete restrict;

-- shipping_quotes.order_id já aponta para orders com ON DELETE CASCADE.
-- Manter o vínculo inverso como CASCADE e adicionar orders.shipping_quote_id
-- com RESTRICT cria um ciclo que pode impedir a compensação de um pedido.
-- Ao remover um pedido, preservamos o recibo da cotação e soltamos apenas a
-- referência histórica; a compensação pode removê-lo explicitamente depois.
alter table public.shipping_quotes
  drop constraint if exists shipping_quotes_order_id_fkey;

alter table public.shipping_quotes
  add constraint shipping_quotes_order_id_fkey
    foreign key (order_id) references public.orders(id) on delete set null;

create unique index if not exists orders_shipping_quote_id_unico
  on public.orders (shipping_quote_id)
  where shipping_quote_id is not null;

comment on column public.orders.shipping_quote_id is
  'Cotação DHL exata exibida e confirmada no checkout internacional. Nulo para pedidos nacionais e pedidos internacionais legados sem vínculo confiável.';
