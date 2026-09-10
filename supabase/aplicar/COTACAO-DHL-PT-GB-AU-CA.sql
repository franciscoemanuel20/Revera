-- =====================================================================
-- COTACAO DE FRETE INTERNACIONAL — PORTUGAL, REINO UNIDO, AUSTRALIA, CANADA
-- >>> JA APLICADO EM 02/09/2026 pela API REST. NAO RODAR DE NOVO. <<<
-- Rodar de novo INSERE DUPLICATAS (o insert nao e condicionado).
-- Auditoria: docs/auditoria/2026-09-02-cotacoes-pt-gb-au-ca.md
-- =====================================================================
-- Cotadas no MyDHL+ em 02/09/2026, entre 18h09 e 18h14, com exatamente os
-- mesmos parametros da cotacao dos EUA (COTACAO-DHL-US.sql), para que os
-- numeros sejam comparaveis:
--
--   origem       Sao Jose dos Campos, SP — CEP 12216-530
--   embalagem    propria ("Sua Embalagem DHL"), 20 x 19 x 9 cm
--   peso real    0,1 kg   (peso cobrado: 1 kg, por cubagem — ver abaixo)
--   destino      endereco RESIDENCIAL marcado, capital de cada pais
--
--   PT  Lisboa      1000-001
--   GB  Londres     SW1A 1AA
--   AU  Sydney      NSW 2000
--   CA  Toronto     ON M5H 2N2
--
-- ---------------------------------------------------------------------
-- O QUE A DHL DEVOLVEU (em reais, sem IVA), postando 02/09
-- ---------------------------------------------------------------------
--                   EXPRESS EASY   WORLDWIDE   WORLDWIDE    entrega
--                   (loja DHL)     (etiqueta)  (com coleta)
--   PT  Portugal      420,07        484,94       519,35     08/09  (4 du)
--   GB  Reino Unido   420,07        484,94       519,35     08/09  (4 du)
--   AU  Australia     443,39        511,06       545,47     07/09  (3 du)
--   CA  Canada        360,95        448,47       482,87     09/09  (5 du)
--   US  (29/08)       326,57        439,44       473,15     — ver o outro arquivo
--
-- PT e GB deram identicos: mesma zona tarifaria da DHL. Nao e erro de
-- copia. Canada saiu MAIS BARATO que Europa, e Australia mais caro que
-- todos — a tarifa e por zona, nao por distancia.
--
-- Como nos EUA, as tres opcoes entregam na MESMA data. O que muda e quem
-- leva a caixa. **EXPRESS EASY escolhido**, coerente com a decisao do
-- Francisco em 29/08: mais barato, e SEM COLETA — a cada pedido alguem
-- leva a caixa a uma Loja DHL. Isso agora vale para cinco paises.
--
-- ---------------------------------------------------------------------
-- O PESO COBRADO CONTINUA SENDO O DA CAIXA
-- ---------------------------------------------------------------------
-- 20 x 19 x 9 = 3.420 cm3; 3.420 / 5000 = 0,684 kg, acima dos 0,1 kg
-- reais. A DHL cobra o maior: 1 kg. Por isso `max_weight_g` = 1000 —
-- acima disso o peso real passa o cubico e a tarifa muda.
--
-- ---------------------------------------------------------------------
-- DE ONDE VEM O VALOR EM MOEDA LOCAL — E A DIFERENCA PARA OS EUA
-- ---------------------------------------------------------------------
-- PTAX de venda de 02/09/2026:
--   EUR 5,9436   GBP 6,9229   AUD 3,6758   CAD 3,7020
--
--            custo puro        + 4,4% da Stripe      GRAVADO AQUI
--   PT       EUR  70,68             73,79            EUR  74,00
--   GB       GBP  60,68             63,35            GBP  64,00
--   AU       AUD 120,62            125,93            AUD 126,00
--   CA       CAD  97,50            101,79            CAD 102,00
--
-- **Diferenca deliberada em relacao aos EUA:** la foi gravado o custo
-- PURO (US$ 62,80), e o proprio arquivo registra que "para cobrir a taxa
-- e dar folga de cambio, o valor seria US$ 66,00". Ou seja: hoje a loja
-- paga do bolso os 4,4% que a Stripe cobra TAMBEM sobre o frete. Aqui
-- esse buraco foi fechado na origem. Se a intencao for manter paridade
-- com os EUA, troque pelos valores da coluna "custo puro" — e considere
-- corrigir tambem a linha dos EUA.
--
-- O que estes valores NAO cobrem, e continuam sendo do comprador:
-- tributos e taxas de importacao no destino.
--
-- `valid_until` = 02/10/2026 (30 dias). Vencida, o pais se fecha sozinho
-- no checkout em vez de vender no prejuizo — e o cambio anda.
--
-- ---------------------------------------------------------------------
-- PRAZO
-- ---------------------------------------------------------------------
-- `eta_days_min` e a promessa da DHL em dias uteis. `eta_days_max` =
-- min + 2 NAO e numero da DHL: e folga para desembaraco aduaneiro, que a
-- data dela nao inclui. Mesma convencao dos EUA.
--
-- ---------------------------------------------------------------------
-- COMO RODAR
-- ---------------------------------------------------------------------
-- SQL Editor do projeto de PRODUCAO (ngnaemfiytutyplolgxb) — confira o
-- nome REVERA no topo da tela. Rodar isto NAO abre venda nenhuma: os
-- paises so aparecem no checkout quando entrarem em CHECKOUT_PAISES,
-- que hoje vale BR,US.
-- =====================================================================

update intl_shipping_quotes
   set is_active = false
 where country in ('PT','GB','AU','CA') and is_active = true;

insert into intl_shipping_quotes (
  country, carrier, service_name, currency, price_cents,
  max_weight_g, eta_days_min, eta_days_max,
  quoted_at, valid_until, is_active, notes
) values
  ('PT','DHL','Express Easy','EUR',  7400, 1000, 4, 6, '2026-09-02','2026-10-02', true,
   'MyDHL+ 02/09/2026 18h09. Origem 12216-530, destino Lisboa 1000-001 residencial, caixa 20x19x9, peso cobrado 1 kg por cubagem. R$ 420,07 / PTAX venda 5,9436 = EUR 70,68; gravado EUR 74,00 para cobrir os 4,4% da Stripe sobre o frete e dar folga de cambio. Express Easy = ENTREGA EM LOJA DHL, sem coleta. Nao inclui tributos no destino.'),
  ('GB','DHL','Express Easy','GBP',  6400, 1000, 4, 6, '2026-09-02','2026-10-02', true,
   'MyDHL+ 02/09/2026 18h11. Origem 12216-530, destino Londres SW1A 1AA residencial, caixa 20x19x9, peso cobrado 1 kg por cubagem. R$ 420,07 (identico a Portugal: mesma zona DHL) / PTAX venda 6,9229 = GBP 60,68; gravado GBP 64,00 com os 4,4% da Stripe. Express Easy = ENTREGA EM LOJA DHL, sem coleta. Nao inclui tributos no destino.'),
  ('AU','DHL','Express Easy','AUD', 12600, 1000, 3, 5, '2026-09-02','2026-10-02', true,
   'MyDHL+ 02/09/2026 18h13. Origem 12216-530, destino Sydney NSW 2000 residencial, caixa 20x19x9, peso cobrado 1 kg por cubagem. R$ 443,39 / PTAX venda 3,6758 = AUD 120,62; gravado AUD 126,00 com os 4,4% da Stripe. E o destino MAIS CARO dos cinco. Express Easy = ENTREGA EM LOJA DHL, sem coleta. Nao inclui tributos no destino.'),
  ('CA','DHL','Express Easy','CAD', 10200, 1000, 5, 7, '2026-09-02','2026-10-02', true,
   'MyDHL+ 02/09/2026 18h14. Origem 12216-530, destino Toronto ON M5H 2N2 residencial, caixa 20x19x9, peso cobrado 1 kg por cubagem. R$ 360,95 / PTAX venda 3,7020 = CAD 97,50; gravado CAD 102,00 com os 4,4% da Stripe. Mais barato que a Europa, apesar da distancia. Express Easy = ENTREGA EM LOJA DHL, sem coleta. Nao inclui tributos no destino.');

-- Confira o que entrou:
-- select country, carrier, service_name, currency, price_cents,
--        eta_days_min, eta_days_max, quoted_at, valid_until, is_active
--   from intl_shipping_quotes order by country, quoted_at desc;

-- =====================================================================
-- DESFAZER
-- =====================================================================
-- delete from intl_shipping_quotes
--  where country in ('PT','GB','AU','CA') and quoted_at = '2026-09-02';
