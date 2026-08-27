-- =====================================================================
-- PRECOS DA REVERA - definidos pelo Francisco em 27/08/2026
-- =====================================================================
-- JA APLICADO no banco em 27/08/2026 via API REST (service_role).
-- Este arquivo fica como registro e como forma de recriar do zero.
-- Idempotente. ASCII puro (o SQL Editor do Supabase corrompe acento
-- colado pelo Chrome); acentos entram por E'\uXXXX'.
--
-- Nada aqui coloca produto a venda: tudo nasce 'draft' com variante
-- inativa. Estoque 999 = feito sob encomenda.
-- =====================================================================

-- 1. MICROPELE 0,08 mm - R$ 650, com faixa por quantidade
update product_variants
   set price_cents = 65000, stock_qty = 999, updated_at = now()
 where sku = 'MICROPELE-008-PADRAO';

delete from quantity_discount_rules
 where product_id = (select id from products where slug = 'micropele-008');

insert into quantity_discount_rules
  (product_id, min_qty, unit_price_cents, label, sort_order, is_active)
select p.id, v.min_qty, v.unit_price_cents, v.label, v.sort_order, true
  from products p,
       (values (5,  62000, E'A partir de 5 pe\u00E7as',  1),
               (10, 60000, E'A partir de 10 pe\u00E7as', 2)
       ) as v(min_qty, unit_price_cents, label, sort_order)
 where p.slug = 'micropele-008';

-- 2..5. DEMAIS PRODUTOS - R$ 750 unitario, sem faixa por quantidade
--
-- Cacho aberto, cacho fechado e Afro sao PRODUTOS SEPARADOS, nao
-- variacoes de um so: a pagina de produto (ProdutoInterativo.tsx) monta
-- variacao lendo color_id, e trata variante sem cor como "generica" \u2014
-- tres variantes sem cor no mesmo produto deixariam duas inalcancaveis.
-- Textura viraria dimensao propria so com coluna nova + mexer no
-- carrinho. Decidido pelo Francisco em 27/08/2026.
insert into products (slug, name, base_type, base_thickness_mm, status, sort_order)
values
  ('micropele-006', 'Micropele 0,06mm',            'micropele', 0.06, 'draft', 2),
  ('cacho-aberto',  E'Pr\u00F3tese Cacho Aberto',  'cacheada',  null, 'draft', 3),
  ('cacho-fechado', E'Pr\u00F3tese Cacho Fechado', 'cacheada',  null, 'draft', 4),
  ('afro',          E'Pr\u00F3tese Afro',          'afro',      null, 'draft', 5)
on conflict (slug) do update
   set name = excluded.name,
       base_type = excluded.base_type,
       base_thickness_mm = excluded.base_thickness_mm,
       sort_order = excluded.sort_order,
       updated_at = now();

insert into product_variants (product_id, sku, price_cents, is_active, stock_qty)
select p.id, v.sku, 75000, false, 999
  from products p
  join (values ('micropele-006', 'MICROPELE-006-PADRAO'),
               ('cacho-aberto',  'CACHO-ABERTO-PADRAO'),
               ('cacho-fechado', 'CACHO-FECHADO-PADRAO'),
               ('afro',          'AFRO-PADRAO')
       ) as v(slug, sku) on v.slug = p.slug
on conflict (sku) do update
   set price_cents = excluded.price_cents,
       stock_qty  = excluded.stock_qty,
       updated_at = now();

-- CONFERENCIA
select p.slug, p.name, p.status, v.sku, v.price_cents, v.is_active, v.stock_qty
  from products p join product_variants v on v.product_id = p.id
 order by p.sort_order;
