/**
 * Cria UMA variante por (produto ativo × cor ativa) e aposenta a variante
 * "PADRAO" genérica de cada produto.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE (29/08/2026)
 * ===========================================================================
 * O código sempre esteve certo: `cart_items` tem `unique (cart_id,
 * variant_id)` e a linha do carrinho monta o label a partir de
 * `product_variants.color_id`. O que faltava era DADO — cada produto tinha
 * uma única variante com `color_id = null`, então as 8 bolinhas da cartela
 * apontavam todas para a MESMA variante.
 *
 * Consequência real, medida em produção: comprar 2 peças na cor 3 e depois
 * 1 na cor 5 virava uma linha só, "Micropele 0,08mm · 3", e o pedido
 * REV-512676CC foi gravado com `variant_label_snapshot = null` — ou seja,
 * chegava à produção sem dizer de que cor era.
 *
 * Idempotente: rodar duas vezes não duplica nada.
 *
 *   node scripts/criar-variantes-por-cor.mjs           # simula, não grava
 *   node scripts/criar-variantes-por-cor.mjs --aplicar # grava
 */
import { readFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) throw new Error("faltam credenciais do Supabase em .env.local");

async function rest(path, init = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

const produtos = await rest("products?select=id,slug,name&status=eq.active&order=slug");
const cores = await rest("colors?select=id,code,name&is_active=eq.true&order=sort_order");
const variantes = await rest("product_variants?select=id,product_id,sku,color_id,price_cents,stock_qty,compare_at_price_cents,is_active");

console.log(`${produtos.length} produtos ativos · ${cores.length} cores ativas`);

const novas = [];
const aposentar = [];

for (const produto of produtos) {
  const doProduto = variantes.filter((v) => v.product_id === produto.id);
  const generica = doProduto.find((v) => v.color_id == null);
  if (!generica) {
    console.log(`  ${produto.slug}: sem variante genérica, pulando`);
    continue;
  }
  const skuBase = generica.sku.replace(/-PADRAO$/, "");

  for (const cor of cores) {
    const jaTem = doProduto.find((v) => v.color_id === cor.id);
    if (jaTem) continue;
    novas.push({
      product_id: produto.id,
      sku: `${skuBase}-COR-${cor.code.replace(/\./g, "-").toUpperCase()}`,
      color_id: cor.id,
      // Mesmo preço e estoque da genérica: a cor não muda o preço nem a
      // disponibilidade (peça feita sob encomenda, estoque 999).
      price_cents: generica.price_cents,
      compare_at_price_cents: generica.compare_at_price_cents,
      stock_qty: generica.stock_qty,
      is_active: true,
    });
  }
  if (generica.is_active) aposentar.push(generica.id);
}

console.log(`variantes a criar: ${novas.length}`);
console.log(`genéricas a aposentar: ${aposentar.length}`);

if (!APLICAR) {
  console.log("\n(simulação — rode com --aplicar para gravar)");
  for (const n of novas.slice(0, 5)) console.log("  +", n.sku);
  if (novas.length > 5) console.log(`  … e mais ${novas.length - 5}`);
  process.exit(0);
}

if (novas.length > 0) {
  const criadas = await rest("product_variants", { method: "POST", body: JSON.stringify(novas) });
  console.log(`criadas: ${criadas.length}`);
}

// Aposenta a genérica DEPOIS de as coloridas existirem: se a ordem fosse
// inversa, haveria uma janela em que o produto não teria variante vendável.
for (const id of aposentar) {
  await rest(`product_variants?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: false }),
  });
}
console.log(`aposentadas: ${aposentar.length}`);
console.log("pronto");
