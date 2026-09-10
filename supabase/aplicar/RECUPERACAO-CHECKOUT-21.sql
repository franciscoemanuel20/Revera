-- Aplicar junto da migration 00000000000021_recuperacao_checkout_segundo_lembrete.sql.
-- Dois kinds fechados tornam possível enviar o último lembrete sem permitir
-- uma terceira tentativa para o mesmo pedido.
alter table order_notifications
  drop constraint if exists order_notifications_kind_check;

alter table order_notifications
  add constraint order_notifications_kind_check
  check (kind in (
    'venda_paga',
    'carrinho_abandonado',
    'checkout_abandonado_primeiro',
    'checkout_abandonado_ultimo'
  ));
