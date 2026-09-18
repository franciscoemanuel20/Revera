-- Migration 27 (copia ASCII para colar no SQL Editor do Supabase).
-- Libera o kind 'checkout_reengajamento' em order_notifications, usado pela
-- mensagem unica aos checkouts parados (botao em /admin/recuperacao).
-- Idempotente: pode rodar mais de uma vez.
alter table order_notifications
  drop constraint if exists order_notifications_kind_check;

alter table order_notifications
  add constraint order_notifications_kind_check
  check (kind in (
    'venda_paga',
    'carrinho_abandonado',
    'checkout_abandonado_primeiro',
    'checkout_abandonado_ultimo',
    'checkout_reengajamento'
  ));
