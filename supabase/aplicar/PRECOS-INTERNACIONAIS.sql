-- =====================================================================
-- PRECOS INTERNACIONAIS DA REVERA — conversao direta do preco do site
-- =====================================================================
-- Gerado em 28/08/2026, por decisao do Francisco: "o preco e so voce
-- converter na moeda deles o que esta no site".
--
-- Cambio: PTAX de VENDA do Banco Central, cotacao de 28/08/2026:
--   USD 5,2005 | EUR 6,0315 | GBP 7,0493 | AUD 3,7262 | CAD 3,7424
-- Fonte: olinda.bcb.gov.br/olinda/servico/PTAX (CotacaoMoedaPeriodo).
--
-- ---------------------------------------------------------------------
-- O QUE ESTE ARQUIVO NAO FAZ, E POR QUE IMPORTA
-- ---------------------------------------------------------------------
-- Isto e uma FOTOGRAFIA do cambio de hoje, gravada como preco fixo. O
-- sistema NAO converte sozinho, de proposito: preco que se mexe com o
-- dolar muda de valor entre a pessoa ver e a pessoa pagar, e ninguem
-- entende por que o carrinho subiu. Cambio andou muito? Rode de novo.
--
-- ---------------------------------------------------------------------
-- A CONTA QUE O FRANCISCO PRECISA SABER
-- ---------------------------------------------------------------------
-- A conversao pura devolve exatamente o preco do site em real — MENOS a
-- taxa da Stripe em cartao internacional, que nao existe na venda
-- nacional. A ~4,4%:
--
--   peca de R$ 650  ->  liquido R$ 621,40  (-R$ 28,60)
--   peca de R$ 750  ->  liquido R$ 717,00  (-R$ 33,00)
--
-- Mais 4,4% sobre o frete cobrado, seja ele qual for. Para receber o
-- mesmo que no Brasil, os precos abaixo precisariam subir ~4,6%.
--
-- ---------------------------------------------------------------------
-- COMO RODAR
-- ---------------------------------------------------------------------
-- SQL Editor do projeto de PRODUCAO (ngnaemfiytutyplolgxb) — confira o
-- nome REVERA no topo da tela antes de colar. E idempotente: rodar duas
-- vezes deixa o mesmo resultado.
--
-- Nada muda para o cliente ao rodar isto. Sem chave da Stripe e sem
-- cotacao de frete vigente, o pais continua indisponivel no checkout.
-- =====================================================================

insert into variant_prices (variant_id, currency, price_cents, is_active)
values
  ('931ad152-8ed7-4eb3-aee4-16e7594b54e4', 'USD', 12499, true),  -- Micropele 0,08mm: R$ 650.00 / 5.2005 = USD 124.99
  ('931ad152-8ed7-4eb3-aee4-16e7594b54e4', 'EUR', 10777, true),  -- Micropele 0,08mm: R$ 650.00 / 6.0315 = EUR 107.77
  ('931ad152-8ed7-4eb3-aee4-16e7594b54e4', 'GBP', 9221, true),  -- Micropele 0,08mm: R$ 650.00 / 7.0493 = GBP 92.21
  ('931ad152-8ed7-4eb3-aee4-16e7594b54e4', 'AUD', 17444, true),  -- Micropele 0,08mm: R$ 650.00 / 3.7262 = AUD 174.44
  ('931ad152-8ed7-4eb3-aee4-16e7594b54e4', 'CAD', 17369, true),  -- Micropele 0,08mm: R$ 650.00 / 3.7424 = CAD 173.69
  ('6924a93e-fbdd-4cee-9619-02c3cfda8803', 'USD', 14422, true),  -- Micropele 0,06mm: R$ 750.00 / 5.2005 = USD 144.22
  ('6924a93e-fbdd-4cee-9619-02c3cfda8803', 'EUR', 12435, true),  -- Micropele 0,06mm: R$ 750.00 / 6.0315 = EUR 124.35
  ('6924a93e-fbdd-4cee-9619-02c3cfda8803', 'GBP', 10639, true),  -- Micropele 0,06mm: R$ 750.00 / 7.0493 = GBP 106.39
  ('6924a93e-fbdd-4cee-9619-02c3cfda8803', 'AUD', 20128, true),  -- Micropele 0,06mm: R$ 750.00 / 3.7262 = AUD 201.28
  ('6924a93e-fbdd-4cee-9619-02c3cfda8803', 'CAD', 20041, true),  -- Micropele 0,06mm: R$ 750.00 / 3.7424 = CAD 200.41
  ('0d06a108-4aef-418b-b05e-836e45141a81', 'USD', 14422, true),  -- Cacho aberto: R$ 750.00 / 5.2005 = USD 144.22
  ('0d06a108-4aef-418b-b05e-836e45141a81', 'EUR', 12435, true),  -- Cacho aberto: R$ 750.00 / 6.0315 = EUR 124.35
  ('0d06a108-4aef-418b-b05e-836e45141a81', 'GBP', 10639, true),  -- Cacho aberto: R$ 750.00 / 7.0493 = GBP 106.39
  ('0d06a108-4aef-418b-b05e-836e45141a81', 'AUD', 20128, true),  -- Cacho aberto: R$ 750.00 / 3.7262 = AUD 201.28
  ('0d06a108-4aef-418b-b05e-836e45141a81', 'CAD', 20041, true),  -- Cacho aberto: R$ 750.00 / 3.7424 = CAD 200.41
  ('f4e9c6b6-d6d9-4ad9-a6ed-f41ded8beb99', 'USD', 14422, true),  -- Cacho fechado: R$ 750.00 / 5.2005 = USD 144.22
  ('f4e9c6b6-d6d9-4ad9-a6ed-f41ded8beb99', 'EUR', 12435, true),  -- Cacho fechado: R$ 750.00 / 6.0315 = EUR 124.35
  ('f4e9c6b6-d6d9-4ad9-a6ed-f41ded8beb99', 'GBP', 10639, true),  -- Cacho fechado: R$ 750.00 / 7.0493 = GBP 106.39
  ('f4e9c6b6-d6d9-4ad9-a6ed-f41ded8beb99', 'AUD', 20128, true),  -- Cacho fechado: R$ 750.00 / 3.7262 = AUD 201.28
  ('f4e9c6b6-d6d9-4ad9-a6ed-f41ded8beb99', 'CAD', 20041, true),  -- Cacho fechado: R$ 750.00 / 3.7424 = CAD 200.41
  ('bb59500d-51b2-4ef0-916d-6b51f07bafd3', 'USD', 14422, true),  -- Afro: R$ 750.00 / 5.2005 = USD 144.22
  ('bb59500d-51b2-4ef0-916d-6b51f07bafd3', 'EUR', 12435, true),  -- Afro: R$ 750.00 / 6.0315 = EUR 124.35
  ('bb59500d-51b2-4ef0-916d-6b51f07bafd3', 'GBP', 10639, true),  -- Afro: R$ 750.00 / 7.0493 = GBP 106.39
  ('bb59500d-51b2-4ef0-916d-6b51f07bafd3', 'AUD', 20128, true),  -- Afro: R$ 750.00 / 3.7262 = AUD 201.28
  ('bb59500d-51b2-4ef0-916d-6b51f07bafd3', 'CAD', 20041, true)  -- Afro: R$ 750.00 / 3.7424 = CAD 200.41
on conflict (variant_id, currency) do update
  set price_cents = excluded.price_cents,
      is_active = true,
      updated_at = now();

-- Confira o que entrou:
-- select pv.sku, vp.currency, vp.price_cents
--   from variant_prices vp join product_variants pv on pv.id = vp.variant_id
--  order by pv.sku, vp.currency;

-- =====================================================================
-- DESFAZER (apaga so o que este arquivo criou)
-- =====================================================================
-- delete from variant_prices where currency <> 'BRL';
