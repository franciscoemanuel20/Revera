/**
 * Fora da Micropele 0,08, a peça só existe na cor 1B (castanho escuro).
 *
 * Decisão do Francisco em 29/08/2026. Quando as cores viraram variantes
 * (criar-variantes-por-cor.mjs), foram criadas as oito cores para os CINCO
 * produtos — o que era mais do que a operação produz. Este script aposenta,
 * nos outros quatro, tudo que não for 1B.
 *
 * Aposenta em vez de apagar: variante referenciada por pedido antigo não
 * pode sumir, e `is_active = false` já basta para ela não ser vendida nem
 * aparecer no carrinho (ver o filtro em src/lib/cart/store.ts).
 *
 *   node scripts/somente-1b-nas-outras.mjs            # simula
 *   node scripts/somente-1b-nas-outras.mjs --aplicar  # grava
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

const cor1b = (await rest("colors?select=id,code&code=eq.1b"))[0];
if (!cor1b) throw new Error("cor 1b não encontrada");

const produtos = await rest("products?select=id,slug&status=eq.active&slug=neq.micropele-008");
const ids = produtos.map((p) => p.id);
const variantes = await rest(`product_variants?select=id,sku,product_id,color_id,is_active&product_id=in.(${ids.join(",")})`);

const aposentar = variantes.filter((v) => v.is_active && v.color_id !== cor1b.id);
console.log(`produtos afetados: ${produtos.map((p) => p.slug).join(", ")}`);
console.log(`variantes a aposentar: ${aposentar.length}`);
console.log(aposentar.slice(0, 6).map((v) => "  - " + v.sku).join("\n"));

if (!APLICAR) { console.log("\n(simulação — rode com --aplicar)"); process.exit(0); }

for (const v of aposentar) {
  await rest(`product_variants?id=eq.${v.id}`, { method: "PATCH", body: JSON.stringify({ is_active: false }) });
}
console.log(`aposentadas: ${aposentar.length}`);
