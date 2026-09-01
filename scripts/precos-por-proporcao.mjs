#!/usr/bin/env node
/**
 * Preço internacional de um produto, proporcional a outro que já tem preço.
 *
 * ===========================================================================
 * POR QUE PROPORÇÃO, E NÃO CONVERSÃO NOVA
 * ===========================================================================
 * `mercado.ts` diz: "preço não se converte, se decide". Os preços que existem
 * foram DECIDIDOS pelo Francisco — não calculados por cotação do dia.
 *
 * Quando entra um produto novo, converter o real dele pela PTAX de hoje jogaria
 * fora essa decisão e criaria uma segunda régua: dois produtos com o mesmo
 * preço no Brasil ficariam com preços diferentes lá fora, só porque foram
 * cadastrados em dias diferentes.
 *
 * A proporção preserva a régua. Se a referência custa R$ 650 / US$ 124,99, um
 * produto de R$ 700 sai a US$ 134,60 — a mesma relação entre nacional e
 * internacional que já foi escolhida.
 *
 * ===========================================================================
 * USO
 * ===========================================================================
 *   node scripts/precos-por-proporcao.mjs \
 *     --produto="Full Lace" --referencia="Micropele 0,08"
 *
 *   ...mesma linha... --criar
 *
 * `--produto` aceita pedaço do nome, e pode repetir. Sem `--criar` é somente
 * leitura. Preço já existente na moeda é ATUALIZADO, não duplicado — foi
 * assim que dois produtos ficaram com USD de uma régua e o resto de outra.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = (n) => process.argv.filter((x) => x.startsWith(`${n}=`)).map((x) => x.slice(n.length + 1));
const arg = (n) => args(n)[0] ?? null;
const flag = (n) => process.argv.includes(n);

const env = {};
for (const l of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) {
  console.error("\nRECUSADO: faltam credenciais do Supabase em .env.local\n");
  process.exit(2);
}
const H = { apikey: K, authorization: `Bearer ${K}`, "content-type": "application/json" };
const get = async (q) => {
  const r = await fetch(`${U}/rest/v1/${q}`, { headers: H, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${q}: HTTP ${r.status}`);
  return r.json();
};

const alvos = args("--produto");
const refNome = arg("--referencia");
if (!alvos.length || !refNome) {
  console.error(`\nUSO: --produto="Full Lace" [--produto=...] --referencia="Micropele 0,08" [--criar]\n`);
  process.exit(2);
}

const produtos = await get("products?select=id,name");
const variantes = await get("product_variants?select=id,sku,product_id,price_cents&is_active=eq.true");
const precos = await get("variant_prices?select=id,variant_id,currency,price_cents&is_active=eq.true");

const acha = (pedaco) => produtos.filter((p) => p.name.toLowerCase().includes(pedaco.toLowerCase()));

const refs = acha(refNome);
if (refs.length !== 1) {
  console.error(`\nRECUSADO: "${refNome}" casou com ${refs.length} produto(s): ${refs.map((p) => p.name).join(", ") || "nenhum"}\n`);
  process.exit(2);
}
const ref = refs[0];
const refVars = variantes.filter((v) => v.product_id === ref.id);
const refBRL = [...new Set(refVars.map((v) => v.price_cents))];
if (refBRL.length !== 1) {
  console.error(`\nRECUSADO: a referência "${ref.name}" tem preços em real diferentes entre variantes (${refBRL.join(", ")}). A proporção ficaria ambígua.\n`);
  process.exit(2);
}
const refIds = new Set(refVars.map((v) => v.id));
const base = {};
for (const p of precos) if (refIds.has(p.variant_id)) base[p.currency] = p.price_cents;
if (!Object.keys(base).length) {
  console.error(`\nRECUSADO: a referência "${ref.name}" não tem preço internacional para servir de base.\n`);
  process.exit(2);
}

const money = (c, m) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: m });
console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`  PREÇO POR PROPORÇÃO`);
console.log(`═══════════════════════════════════════════════════════════════\n`);
console.log(`  referência: ${ref.name} — ${money(refBRL[0], "BRL")}`);
console.log(`              ${Object.entries(base).map(([m, c]) => `${m} ${money(c, m)}`).join(" · ")}\n`);

const criar = [], atualizar = [];

for (const pedaco of alvos) {
  const achados = acha(pedaco);
  if (achados.length !== 1) {
    console.error(`  RECUSADO: "${pedaco}" casou com ${achados.length}: ${achados.map((p) => p.name).join(", ") || "nenhum"}`);
    process.exit(2);
  }
  const prod = achados[0];
  const vars = variantes.filter((v) => v.product_id === prod.id);
  const brl = [...new Set(vars.map((v) => v.price_cents))];
  if (brl.length !== 1) {
    console.error(`  RECUSADO: "${prod.name}" tem preços em real diferentes entre variantes.`);
    process.exit(2);
  }
  const fator = brl[0] / refBRL[0];

  console.log(`  ${prod.name} — ${money(brl[0], "BRL")}   (fator ${fator.toFixed(6)})`);
  for (const [moeda, b] of Object.entries(base)) {
    const novo = Math.round(b * fator);
    for (const v of vars) {
      const existente = precos.find((p) => p.variant_id === v.id && p.currency === moeda);
      if (existente) {
        if (existente.price_cents !== novo) atualizar.push({ id: existente.id, price_cents: novo, sku: v.sku, moeda, de: existente.price_cents });
      } else {
        criar.push({ variant_id: v.id, currency: moeda, price_cents: novo, is_active: true });
      }
    }
    console.log(`    ${moeda}  ${money(novo, moeda)}`);
  }
  console.log("");
}

for (const u of atualizar) {
  console.log(`  CORRIGE  ${u.sku} ${u.moeda}: ${money(u.de, u.moeda)} → ${money(u.price_cents, u.moeda)}`);
}
console.log(`\n  ${criar.length} a criar · ${atualizar.length} a corrigir`);

if (!flag("--criar")) {
  console.log(`\n  Nada foi escrito. Repita com --criar\n`);
  process.exit(0);
}

if (criar.length) {
  const r = await fetch(`${U}/rest/v1/variant_prices`, {
    method: "POST", headers: { ...H, prefer: "return=minimal" }, body: JSON.stringify(criar),
  });
  if (!r.ok) { console.error(`\nFALHOU ao criar: ${r.status} ${await r.text()}\n`); process.exit(1); }
}
for (const u of atualizar) {
  const r = await fetch(`${U}/rest/v1/variant_prices?id=eq.${u.id}`, {
    method: "PATCH", headers: { ...H, prefer: "return=minimal" },
    body: JSON.stringify({ price_cents: u.price_cents }),
  });
  if (!r.ok) console.error(`  aviso: não corrigi ${u.sku} ${u.moeda} (HTTP ${r.status})`);
}
console.log(`\n  ${criar.length} criado(s), ${atualizar.length} corrigido(s).`);
console.log(`  Confira com:  node scripts/mercado-pronto.mjs\n`);
