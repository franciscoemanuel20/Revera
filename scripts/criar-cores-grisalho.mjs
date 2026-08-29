/**
 * Cria as cores de GRISALHO como cores da própria cartela.
 *
 * ===========================================================================
 * A DECISÃO (Francisco, 29/08/2026)
 * ===========================================================================
 * Grisalho entra como MAIS CORES, ao lado das oito que já existem — e não
 * como uma segunda escolha depois da cor. Motivos:
 *   - é como a escala aparece no material dele (1b10 … 1b80);
 *   - é UMA escolha para o cliente, não duas;
 *   - não multiplica o catálogo: 7 cores novas em vez de 8 × 7 = 56
 *     combinações por produto;
 *   - o pedido chega dizendo "Cor 1B 30%", que a operação já entende.
 * Preço: o MESMO da peça sem grisalho. Confirmado por ele.
 *
 * Nascem INATIVAS de propósito. Cor de cabelo sem foto é círculo com texto:
 * quem escolhe às cegas erra, e prótese errada volta. Ligar é um UPDATE
 * depois que as fotos da escala existirem em /media/cores/.
 *
 * Idempotente.
 *
 *   node scripts/criar-cores-grisalho.mjs            # simula
 *   node scripts/criar-cores-grisalho.mjs --aplicar  # grava
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

async function rest(path, init = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

// A escala que já está em gray_levels. O código segue o material do
// Francisco (1b10…1b80); o nome é o que o cliente lê na bolinha e o que sai
// na sacola, então leva o "%" para não virar "mil e dez".
const ESCALA = [10, 20, 30, 40, 50, 65, 80];

const existentes = await rest("colors?select=id,code,sort_order");
const porCodigo = new Map(existentes.map((c) => [c.code, c]));
const maiorOrdem = Math.max(0, ...existentes.map((c) => c.sort_order ?? 0));

const novas = ESCALA.map((percent, i) => ({
  code: `1b${percent}`,
  name: `1B ${percent}%`,
  hex_preview: null,
  photo_url: "",
  sort_order: maiorOrdem + 1 + i,
  is_active: false,
})).filter((c) => !porCodigo.has(c.code));

console.log(`cores de grisalho a criar: ${novas.length} (${novas.map((c) => c.code).join(", ") || "nenhuma"})`);

if (!APLICAR) {
  console.log("(simulação — rode com --aplicar)");
  process.exit(0);
}

let cores = [];
if (novas.length > 0) cores = await rest("colors", { method: "POST", body: JSON.stringify(novas) });
console.log(`cores criadas: ${cores.length}`);

// Uma variante por (produto ativo × cor nova), no mesmo preço e estoque da
// peça — mesma regra de criar-variantes-por-cor.mjs.
/**
 * SÓ A MICROPELE 0,08 TEM GRISALHO (Francisco, 29/08/2026).
 *
 * As outras quatro peças saem só na 1B (castanho escuro). Criar variante de
 * grisalho nelas colocaria na cartela uma cor que a operação não produz — e
 * o pedido só ia dar errado na hora de fabricar.
 */
const produtos = await rest("products?select=id,slug&status=eq.active&slug=eq.micropele-008");
const variantes = await rest("product_variants?select=id,product_id,sku,color_id,price_cents,compare_at_price_cents,stock_qty,is_active");

const novasVariantes = [];
for (const produto of produtos) {
  const doProduto = variantes.filter((v) => v.product_id === produto.id);
  const modelo = doProduto.find((v) => v.color_id != null) ?? doProduto[0];
  if (!modelo) continue;
  const skuBase = modelo.sku.replace(/-COR-.*$/, "").replace(/-PADRAO$/, "");
  for (const cor of cores) {
    if (doProduto.some((v) => v.color_id === cor.id)) continue;
    novasVariantes.push({
      product_id: produto.id,
      sku: `${skuBase}-COR-${cor.code.toUpperCase()}`,
      color_id: cor.id,
      price_cents: modelo.price_cents,
      compare_at_price_cents: modelo.compare_at_price_cents,
      stock_qty: modelo.stock_qty,
      // Ativa: quem decide se a cor aparece é `colors.is_active`, um lugar só.
      is_active: true,
    });
  }
}

if (novasVariantes.length > 0) {
  const criadas = await rest("product_variants", { method: "POST", body: JSON.stringify(novasVariantes) });
  console.log(`variantes criadas: ${criadas.length}`);
}
console.log("pronto — cores INATIVAS até as fotos da escala existirem");
