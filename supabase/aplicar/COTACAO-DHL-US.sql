-- =====================================================================
-- COTACAO DE FRETE INTERNACIONAL — ESTADOS UNIDOS
-- =====================================================================
-- Cotada no MyDHL+ em 29/08/2026, com os dados reais da operacao:
--
--   origem       Sao Jose dos Campos, SP — CEP 12216-530
--   destino      New York, NY 10001 (entrega RESIDENCIAL marcada)
--   embalagem    propria, 20 x 19 x 9 cm
--   peso real    0,1 kg
--
-- A DHL devolveu tres servicos, TODOS entregando na mesma data (3 de
-- setembro, postando dia 29). O que muda entre eles nao e a velocidade, e
-- quem leva a caixa ate a DHL:
--
--   EXPRESS EASY        R$ 326,57   voce leva numa Loja DHL      <== ESCOLHIDO
--   EXPRESS WORLDWIDE   R$ 439,44   etiqueta preparada online
--   EXPRESS WORLDWIDE   R$ 473,15   DHL busca no seu endereco
--
-- Francisco escolheu o EXPRESS EASY em 29/08/2026. Consequencia
-- operacional, e ela e real: NAO HA COLETA. A cada pedido internacional
-- alguem leva a caixa ate um ponto DHL. Foi o que comprou os R$ 146,58 de
-- diferenca para a opcao com coleta.
--
-- ---------------------------------------------------------------------
-- O PESO COBRADO NAO E O PESO DA PECA
-- ---------------------------------------------------------------------
-- A DHL cobra o MAIOR entre peso real e peso cubico. A caixa de
-- 20 x 19 x 9 da 3.420 cm3, e 3.420 / 5000 = 0,684 kg — bem acima dos
-- 0,1 kg reais. Ou seja, esta cotacao vale igual para uma peca de 100 g
-- ou de 900 g: quem manda e a caixa.
--
-- Por isso `max_weight_g` = 1000. Acima disso o peso real passa o cubico
-- e a tarifa muda — a cotacao deixa de valer e precisa ser refeita.
--
-- Falta testar: baixar a caixa para 6 cm derruba o cubico para 0,456 kg e
-- deveria cair na faixa de 0,5 kg. Nao foi cotado ainda.
--
-- ---------------------------------------------------------------------
-- DE ONDE VEM O VALOR EM DOLAR
-- ---------------------------------------------------------------------
-- R$ 326,57 / 5,2005 (PTAX de venda de 28/08/2026) = US$ 62,80.
--
-- E o CUSTO, sem margem — coerente com "quero a de menor custo". Duas
-- coisas que isso NAO cobre, e que sao decisao comercial do Francisco:
--
--   1. a taxa da Stripe incide tambem sobre o frete: 4,4% de R$ 326,57 =
--      R$ 14,37 por envio que sai do bolso;
--   2. o cambio anda. Se o dolar cair, os US$ 62,80 compram menos que os
--      R$ 326,57 que a DHL cobra.
--
-- E `valid_until` que protege dos dois: vencida, o pais se fecha sozinho
-- no checkout em vez de vender no prejuizo. Para cobrir a taxa e dar
-- folga de cambio, o valor seria US$ 66,00.
--
-- ---------------------------------------------------------------------
-- PRAZO
-- ---------------------------------------------------------------------
-- A DHL prometeu 3 de setembro postando dia 29 (sabado) — 4 dias uteis,
-- contados da segunda. `eta_days_max` = 6 NAO e da DHL: e folga minha
-- para desembaraco aduaneiro, que a data dela nao inclui. O texto do
-- checkout ja diz que o prazo e da transportadora e nao inclui alfandega.
--
-- ---------------------------------------------------------------------
-- COMO RODAR
-- ---------------------------------------------------------------------
-- SQL Editor do projeto de PRODUCAO (ngnaemfiytutyplolgxb) — confira o
-- nome REVERA no topo da tela. Rodar isto NAO abre venda nenhuma: sem a
-- chave da Stripe e sem CHECKOUT_PAISES, os EUA seguem indisponiveis.
-- =====================================================================

-- Desativa cotacao anterior dos EUA, se houver: duas ativas ao mesmo
-- tempo deixariam o checkout escolhendo sozinho qual cobrar.
update intl_shipping_quotes
   set is_active = false
 where country = 'US' and is_active = true;

insert into intl_shipping_quotes (
  country, carrier, service_name, currency, price_cents,
  max_weight_g, eta_days_min, eta_days_max,
  quoted_at, valid_until, is_active, notes
) values (
  'US',
  'DHL',
  'Express Easy',
  'USD',
  6280,          -- US$ 62,80  (R$ 326,57 / 5,2005)
  1000,          -- acima de 1 kg o peso real passa o cubico: refazer
  4,             -- dias uteis prometidos pela DHL
  6,             -- folga para desembaraco (nao e numero da DHL)
  '2026-08-29',
  '2026-09-28',  -- 30 dias; vencida, o pais fecha sozinho
  true,
  'MyDHL+ 29/08/2026. Origem 12216-530, destino NY 10001 residencial, caixa 20x19x9 cm, peso cobrado 1 kg por cubagem. Express Easy = ENTREGA EM LOJA DHL, sem coleta. Custo sem margem: nao cobre os 4,4% da Stripe sobre o frete (R$ 14,37) nem variacao cambial. Nao inclui tributos no destino, que sao do comprador.'
);

-- Confira o que entrou:
-- select country, carrier, service_name, currency, price_cents,
--        eta_days_min, eta_days_max, quoted_at, valid_until, is_active
--   from intl_shipping_quotes order by country, quoted_at desc;

-- =====================================================================
-- DESFAZER
-- =====================================================================
-- delete from intl_shipping_quotes where country = 'US' and quoted_at = '2026-08-29';
