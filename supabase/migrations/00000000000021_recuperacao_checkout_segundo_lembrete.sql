-- Recuperação de checkout: dois avisos, cada um reservado uma única vez.
--
-- O unique de order_notifications é (order_id, kind). Separar os kinds é o
-- que permite o último lembrete sem abrir a possibilidade de uma terceira
-- mensagem. A lista continua fechada para um typo não virar uma categoria
-- invisível que bloqueia o pedido para sempre.
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
