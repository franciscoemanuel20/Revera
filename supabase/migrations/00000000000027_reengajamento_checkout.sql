-- Reengajamento único dos checkouts parados (18/09/2026).
--
-- Até 18/09 a tela de pagamento da InfinitePay pedia o endereço de novo, em
-- branco: 89 pedidos, 3 pagos. Corrigido o checkout, a equipe manda UMA
-- mensagem a quem parou ali. Kind próprio porque o unique de
-- order_notifications é (order_id, kind): é ele que garante que ninguém
-- recebe esta mensagem duas vezes, e ele não pode se misturar com os dois
-- avisos automáticos do cron.
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
