-- Os anúncios da Revera já enviam `sck={{campaign.id}}` na URL.
-- Até esta migration o navegador preservava apenas UTM/fbclid; portanto o
-- ID exato da campanha era descartado antes de o pedido nascer.
alter table public.orders
  add column if not exists meta_campaign_id text;

comment on column public.orders.meta_campaign_id is
  'ID da campanha Meta capturado do parâmetro sck do anúncio; usado para conciliar pagamento real com campanha sem depender do nome da UTM.';

create index if not exists orders_meta_campaign_id_idx
  on public.orders (meta_campaign_id)
  where meta_campaign_id is not null;
