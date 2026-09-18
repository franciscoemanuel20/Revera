-- Carteiras digitais nacionais via Stripe
--
-- O pedido continua BRL, mas a preferencia abaixo permite que a tela de
-- pagamento roteie apenas esse caso para a Stripe. No Stripe Checkout
-- hospedado, Apple Pay ou Google Pay aparecem quando disponiveis e cartao
-- fica como fallback.
-- O caminho padrao nacional permanece no provider nacional configurado.

alter table orders
  add column if not exists payment_preference text not null default 'default';

alter table orders
  drop constraint if exists orders_payment_preference_valida;

alter table orders
  add constraint orders_payment_preference_valida
  check (payment_preference in ('default', 'apple_pay'));

comment on column orders.payment_preference is
  'Preferencia escolhida no checkout. default usa o provider da moeda; apple_pay abre Stripe em pedido BRL para Apple Pay/Google Pay quando disponivel, com cartao como fallback.';
