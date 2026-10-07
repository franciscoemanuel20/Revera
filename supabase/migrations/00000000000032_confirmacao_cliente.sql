-- E-mail de confirmação ao cliente com a informação de desistência
-- (07/10/2026). Reaproveita a reserva de order_notifications
-- (unique order_id + kind): um e-mail por pedido, decidido pelo banco.
alter table order_notifications
  drop constraint if exists order_notifications_kind_check;

alter table order_notifications
  add constraint order_notifications_kind_check
  check (kind in (
    'venda_paga',
    'carrinho_abandonado',
    'checkout_abandonado_primeiro',
    'checkout_abandonado_ultimo',
    'checkout_reengajamento',
    'confirmacao_cliente'
  ));
