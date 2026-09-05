-- Carrinho abandonado da Reverá — 05/09/2026
--
-- A tabela order_notifications já tinha o desenho certo para isto: reserva
-- por `unique (order_id, kind)`, `sent_at` nulo enquanto não saiu, e
-- `last_error` para distinguir "não avisamos" de "tentamos e recusaram".
--
-- O que impedia era o CHECK, que aceitava só 'venda_paga'. Ele foi escrito
-- quando havia um aviso só, e estava certo naquele dia.
--
-- Continua sendo uma lista FECHADA, de propósito: com texto livre, um typo
-- no kind criaria uma segunda categoria que nenhum código lê, e o pedido
-- ficaria marcado como avisado sem ninguém ter sido avisado.
--
-- Enquanto este arquivo não rodar, o cron de carrinho abandonado não manda
-- nada: a reserva falha, ele registra e segue. Publicar o código antes desta
-- migration é seguro.
alter table order_notifications
  drop constraint if exists order_notifications_kind_check;

alter table order_notifications
  add constraint order_notifications_kind_check
  check (kind in ('venda_paga', 'carrinho_abandonado'));
