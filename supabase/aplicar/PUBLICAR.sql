-- =====================================================================
-- PUBLICAR OS CINCO PRODUTOS - 27/08/2026
-- =====================================================================
-- Cole no SQL Editor do Supabase e rode. A partir daqui os produtos
-- ficam A VENDA de verdade no site: pagamento real pela InfinitePay,
-- frete real pela SuperFrete.
--
-- Pre-requisitos, todos conferidos em 27/08/2026:
--   - deploy Ready com os 6 commits (be850af) e o codigo novo no ar
--   - SUPERFRETE_SANDBOX = 0 na Vercel (Production), valor conferido
--   - verificacao de deploy seguro passou: "OK - configuracao segura"
--   - as fotos novas respondendo 200 no dominio
--
-- Para tirar do ar de novo, o bloco comentado no fim desfaz tudo.
-- =====================================================================

update products
   set status = 'active', updated_at = now()
 where slug in ('micropele-008','micropele-006','cacho-aberto','cacho-fechado','afro');

update product_variants
   set is_active = true, updated_at = now()
 where sku in ('MICROPELE-008-PADRAO','MICROPELE-006-PADRAO',
               'CACHO-ABERTO-PADRAO','CACHO-FECHADO-PADRAO','AFRO-PADRAO');

-- CONFERENCIA: os cinco tem que sair com status 'active', is_active true,
-- price_cents > 0 e stock_qty > 0. Faltando um desses, o produto aparece
-- na vitrine mas o carrinho recusa a compra.
select p.slug, p.status, v.sku, v.price_cents, v.is_active, v.stock_qty
  from products p join product_variants v on v.product_id = p.id
 order by p.sort_order;

-- ---------------------------------------------------------------------
-- DESFAZER (tira tudo do ar de novo) - descomente e rode
-- ---------------------------------------------------------------------
-- update products set status = 'draft' where slug in
--   ('micropele-008','micropele-006','cacho-aberto','cacho-fechado','afro');
-- update product_variants set is_active = false where sku in
--   ('MICROPELE-008-PADRAO','MICROPELE-006-PADRAO',
--    'CACHO-ABERTO-PADRAO','CACHO-FECHADO-PADRAO','AFRO-PADRAO');
