-- =====================================================================
-- CORRECAO DA LINHA DOS EUA — de US$ 62,80 para US$ 66,00
-- >>> JA APLICADO EM 02/09/2026 pela API REST. NAO RODAR DE NOVO. <<<
-- Auditoria: docs/auditoria/2026-09-02-frete-us-62.80-para-66.00.md
-- O update abaixo e condicionado a price_cents = 6280, entao rodar de novo
-- nao faz nada — fica so como registro do que foi feito.
-- =====================================================================
-- Decidido pelo Francisco em 02/09/2026, ao cotar PT/GB/AU/CA.
--
-- POR QUE
-- -------
-- A cotacao de 29/08 gravou o CUSTO PURO: R$ 326,57 / 5,2005 = US$ 62,80.
-- O proprio arquivo daquele dia (COTACAO-DHL-US.sql) ja registrava o
-- buraco: "a taxa da Stripe incide tambem sobre o frete: 4,4% de
-- R$ 326,57 = R$ 14,37 por envio que sai do bolso" e concluia que "para
-- cobrir a taxa e dar folga de cambio, o valor seria US$ 66,00".
--
-- Ficou assim por um mes. Como nenhuma venda internacional aconteceu, o
-- prejuizo e zero ate agora — mas seria R$ 14,37 em CADA pedido.
--
-- As cotacoes de PT/GB/AU/CA de 02/09 ja nasceram com os 4,4% embutidos.
-- Esta correcao existe para os cinco paises seguirem a MESMA regra.
--
-- O QUE NAO MUDA
-- --------------
-- `quoted_at` (2026-08-29) e `valid_until` (2026-09-28) ficam como estao:
-- a TARIFA da DHL nao mudou, so a margem que a loja cobra sobre ela. A
-- cotacao continua vencendo em 28/09, e ao renovar vale refazer a conta.
--
-- RESSALVA HONESTA SOBRE O NUMERO
-- -------------------------------
-- US$ 66,00 e o numero calculado em 29/08, com PTAX 5,2005. Em 02/09 o
-- dolar caiu para 5,1273, e a mesma conta daria US$ 66,49 (arredondando,
-- 67). A diferenca de US$ 1 e menor que a folga cambial que o proprio
-- valor pretende dar, e US$ 66,00 foi o pedido explicito — fica 66. Se o
-- dolar continuar caindo, quem protege e o `valid_until`.
--
-- COMO RODAR
-- ----------
-- SQL Editor do projeto de PRODUCAO (ngnaemfiytutyplolgxb) — confira o
-- nome REVERA no topo da tela.
-- =====================================================================

update intl_shipping_quotes
   set price_cents = 6600,
       notes = notes ||
         ' | CORRIGIDO em 02/09/2026: de 6280 (US$ 62,80, custo puro) para' ||
         ' 6600 (US$ 66,00), cobrindo os 4,4% da Stripe sobre o frete' ||
         ' (R$ 14,37 por envio) e dando folga de cambio. Mesma regra das' ||
         ' cotacoes de PT/GB/AU/CA de 02/09. A tarifa da DHL nao mudou:' ||
         ' quoted_at e valid_until seguem os de 29/08.'
 where country = 'US'
   and is_active = true
   and price_cents = 6280;

-- Confira (deve voltar 1 linha, com 6600):
-- select country, currency, price_cents, quoted_at, valid_until, is_active
--   from intl_shipping_quotes where country = 'US' and is_active = true;

-- =====================================================================
-- DESFAZER
-- =====================================================================
-- update intl_shipping_quotes set price_cents = 6280
--  where country = 'US' and is_active = true and price_cents = 6600;
