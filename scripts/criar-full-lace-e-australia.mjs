/**
 * Cria as peças FULL LACE e AUSTRÁLIA — só na cor 1B.
 *
 * Pedido do Francisco em 29/08/2026, com as fotos.
 *
 * Nascem em `draft` e com `price_cents = 0` de PROPÓSITO: ele ainda não
 * disse o preço, e preço é regra comercial — não se inventa nem se copia do
 * vizinho. `produtoEstaVendavel` (src/lib/catalog/vitrine.ts) já recusa
 * variante com preço zero, então mesmo que alguém ative o produto por
 * engano ele não aparece no catálogo nem vende a peça por R$ 0.
 *
 * Publicar depois é: preço na variante + status 'active'.
 *
 * Idempotente.
 *
 *   node scripts/criar-full-lace-e-australia.mjs            # simula
 *   node scripts/criar-full-lace-e-australia.mjs --aplicar  # grava
 */
import { readFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
async function rest(path, init = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } });
  const t = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

// Descrições CURTAS e descritivas, escritas a partir do que a foto mostra.
// Precisam do olhar do Francisco antes de virar copy de venda.
const NOVOS = [
  {
    slug: "full-lace",
    name: "Prótese Full Lace",
    description: "Base inteira em renda, sem película. A construção mais leve e ventilada da linha.",
    base_type: "full lace",
    sort_order: 6,
    foto: "/media/produtos/full-lace.jpg",
    alt: "Prótese Full Lace vista de cima, base inteira em renda",
    sku: "FULL-LACE",
  },
  {
    slug: "australia",
    name: "Prótese Austrália",
    description: "Renda no topo e perímetro em película: renda onde a peça aparece, película onde a fixação precisa segurar.",
    base_type: "australia",
    sort_order: 7,
    foto: "/media/produtos/australia.jpg",
    alt: "Prótese Austrália vista de cima, renda no topo e perímetro em película",
    sku: "AUSTRALIA",
  },
];

const cor1b = (await rest("colors?select=id,code&code=eq.1b"))[0];
if (!cor1b) throw new Error("cor 1b não encontrada");

const existentes = await rest("products?select=slug");
const jaTem = new Set(existentes.map((p) => p.slug));
const criar = NOVOS.filter((p) => !jaTem.has(p.slug));

console.log(`produtos a criar: ${criar.map((p) => p.slug).join(", ") || "nenhum"}`);
if (!APLICAR) { console.log("(simulação — rode com --aplicar)"); process.exit(0); }

for (const novo of criar) {
  const [produto] = await rest("products", {
    method: "POST",
    body: JSON.stringify({
      slug: novo.slug, name: novo.name, description: novo.description,
      base_type: novo.base_type, is_featured: false,
      status: "draft", sort_order: novo.sort_order,
    }),
  });
  await rest("product_variants", {
    method: "POST",
    body: JSON.stringify({
      product_id: produto.id, sku: `${novo.sku}-COR-1B`, color_id: cor1b.id,
      // Zero de propósito — ver o cabeçalho deste arquivo.
      price_cents: 0, stock_qty: 999, is_active: true,
    }),
  });
  await rest("product_media", {
    method: "POST",
    body: JSON.stringify({
      product_id: produto.id, url: novo.foto, alt_text: novo.alt,
      type: "image", is_primary: true, sort_order: 0,
    }),
  });
  console.log(`criado: ${novo.slug} (draft, sem preço)`);
}
console.log("pronto — falta preço e status 'active'");
