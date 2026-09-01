#!/usr/bin/env node
/**
 * Recadastra os preços internacionais nas variantes ATUAIS.
 *
 * ===========================================================================
 * O QUE ACONTECEU, E POR QUE ISTO PRECISA EXISTIR
 * ===========================================================================
 * Em 29/08/2026 os preços internacionais foram gravados às 06:16 — 25 linhas,
 * 5 produtos × 5 moedas, conferidas por leitura. Às 06:32, a migração "cor
 * virou variante" desativou as 5 variantes PADRAO e criou 24 por cor.
 *
 * Dezesseis minutos separaram o trabalho da sua invalidação. Os preços
 * continuam lá, ativos e corretos — apontando para variantes que não existem
 * mais. Nada acusou: cada tabela, sozinha, parecia certa, e o Brasil seguiu
 * vendendo porque o preço em real mora em `product_variants.price_cents`, não
 * em `variant_prices`.
 *
 * ===========================================================================
 * A REGRA, DECIDIDA PELO FRANCISCO EM 31/08/2026
 * ===========================================================================
 * **Mesmo preço**: dentro de um modelo, todas as cores custam igual. Então o
 * preço da variante PADRAO antiga vale para todas as variantes ativas do
 * mesmo produto, em todas as cinco moedas.
 *
 * O script NÃO inventa preço para produto sem referência — ele lista e para.
 * Preço internacional não se converte, se decide (ver mercado.ts), e decidir
 * é do Francisco.
 *
 * ===========================================================================
 * USO
 * ===========================================================================
 *   node scripts/precos-internacionais.mjs            # mostra o plano
 *   node scripts/precos-internacionais.mjs --criar    # grava
 *
 * Sem `--criar` é SOMENTE LEITURA.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flag = (n) => process.argv.includes(n);

const env = {};
for (const l of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) {
  console.error("\nRECUSADO: faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local\n");
  process.exit(2);
}

const H = { apikey: K, authorization: `Bearer ${K}`, "content-type": "application/json" };
const get = async (q) => {
  const r = await fetch(`${U}/rest/v1/${q}`, { headers: H, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${q}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
};

const variantes = await get("product_variants?select=id,sku,product_id,is_active");
const precos = await get("variant_prices?select=id,variant_id,currency,price_cents,is_active");
const produtos = await get("products?select=id,name");

const nome = Object.fromEntries(produtos.map((p) => [p.id, p.name]));
const porId = Object.fromEntries(variantes.map((v) => [v.id, v]));
const ativas = variantes.filter((v) => v.is_active);

/**
 * A referência de cada produto: o preço que ficou órfão quando a variante
 * dele foi desativada. É a fonte porque foi decidido por uma pessoa — não
 * calculado — e a decisão continua valendo, só mudou a que variante se aplica.
 */
const referencia = {};
for (const p of precos) {
  const v = porId[p.variant_id];
  if (!v || v.is_active) continue;
  (referencia[v.product_id] ??= {})[p.currency] = p.price_cents;
}

/** O que já existe hoje, para não duplicar nem sobrescrever. */
const jaTem = new Set(
  precos.filter((p) => porId[p.variant_id]?.is_active).map((p) => `${p.variant_id}|${p.currency}`)
);

const aCriar = [];
const semReferencia = new Map();

for (const v of ativas) {
  const ref = referencia[v.product_id];
  if (!ref) {
    if (!semReferencia.has(v.product_id)) semReferencia.set(v.product_id, []);
    semReferencia.get(v.product_id).push(v.sku ?? v.id.slice(0, 8));
    continue;
  }
  for (const [moeda, centavos] of Object.entries(ref)) {
    if (jaTem.has(`${v.id}|${moeda}`)) continue;
    aCriar.push({ variant_id: v.id, currency: moeda, price_cents: centavos, is_active: true });
  }
}

const orfaos = precos.filter((p) => !porId[p.variant_id]?.is_active && p.is_active);

const money = (c, m) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: m });

console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`  PREÇOS INTERNACIONAIS — recadastrar nas variantes atuais`);
console.log(`═══════════════════════════════════════════════════════════════\n`);
console.log(`  Regra: mesmo preço dentro do modelo (decisão de 31/08/2026).\n`);

const porProduto = new Map();
for (const l of aCriar) {
  const pid = porId[l.variant_id].product_id;
  porProduto.set(pid, (porProduto.get(pid) ?? 0) + 1);
}
for (const [pid, n] of porProduto) {
  const ref = referencia[pid];
  console.log(`  ${(nome[pid] ?? pid).padEnd(24)} ${String(n).padStart(3)} linha(s)`);
  console.log(`    ${Object.entries(ref).map(([m, c]) => `${m} ${money(c, m)}`).join(" · ")}`);
}

console.log(`\n  Total a criar: ${aCriar.length} linha(s)`);
console.log(`  Órfãs a desativar: ${orfaos.length} (apontam para variantes inativas)`);

if (semReferencia.size) {
  console.log(`\n  SEM REFERÊNCIA — estes produtos ficam de fora, e é decisão sua:`);
  for (const [pid, skus] of semReferencia) {
    const brl = ativas.filter((v) => v.product_id === pid);
    console.log(`    ${(nome[pid] ?? pid).padEnd(24)} ${skus.join(", ")}`);
  }
  console.log(`\n  Eles nasceram depois do cadastro internacional. Preço não se`);
  console.log(`  converte, se decide — me diga o valor e eu acrescento.`);
}

if (!flag("--criar")) {
  console.log(`\n  Nada foi escrito. Para gravar: --criar\n`);
  process.exit(0);
}

if (aCriar.length) {
  const r = await fetch(`${U}/rest/v1/variant_prices`, {
    method: "POST",
    headers: { ...H, prefer: "return=minimal" },
    body: JSON.stringify(aCriar),
  });
  if (!r.ok) {
    console.error(`\nFALHOU ao inserir: HTTP ${r.status} ${await r.text()}\n`);
    process.exit(1);
  }
  console.log(`\n  ${aCriar.length} preço(s) criado(s).`);
}

// Desativar as órfãs é o que impede a próxima pessoa de olhar a tabela, ver
// "USD 124,99 ativo", e concluir que está tudo certo — como aconteceu.
if (orfaos.length) {
  for (const o of orfaos) {
    const r = await fetch(`${U}/rest/v1/variant_prices?id=eq.${o.id}`, {
      method: "PATCH",
      headers: { ...H, prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false }),
    });
    if (!r.ok) console.error(`  aviso: não desativei a órfã ${o.id} (HTTP ${r.status})`);
  }
  console.log(`  ${orfaos.length} órfã(s) desativada(s).`);
}

console.log(`\n  Confira com:  node scripts/mercado-pronto.mjs\n`);
