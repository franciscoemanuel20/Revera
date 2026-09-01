#!/usr/bin/env node
/**
 * "Dá para vender para os EUA agora?" — as quatro pernas, conferidas.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE
 * ===========================================================================
 * `src/lib/internacional/mercado.ts` diz que um país só abre quando TODAS as
 * quatro pernas existem. Três delas moram no banco ou no ambiente, e a
 * pergunta "está pronto?" vinha sendo respondida abrindo painel por painel —
 * ou pior, adivinhando.
 *
 * O modo de falha que isto previne é específico: preparar três pernas, achar
 * que abriu, e descobrir com um cliente americano parado no checkout. As
 * pernas 3 e 4 são as que somem sem avisar — cotação de frete VENCE por data,
 * e preço em USD some quando alguém cadastra uma variante nova.
 *
 * SOMENTE LEITURA. Não escreve nada.
 *
 * ===========================================================================
 * USO
 * ===========================================================================
 *   node scripts/mercado-pronto.mjs             # US, o padrão
 *   node scripts/mercado-pronto.mjs --pais=PT
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const arg = (n) => {
  const a = process.argv.find((x) => x.startsWith(`${n}=`));
  return a ? a.slice(n.length + 1) : null;
};

function lerEnv(arquivo) {
  try {
    const env = {};
    for (const l of readFileSync(join(root, arquivo), "utf8").split("\n")) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return env;
  } catch {
    return {};
  }
}

/** A moeda de cada mercado. Espelha src/lib/internacional/moeda.ts. */
const MOEDA = { US: "USD", PT: "EUR", ES: "EUR", GB: "GBP", AU: "AUD", CA: "CAD" };

const pais = (arg("--pais") ?? "US").toUpperCase();
const moeda = MOEDA[pais];
if (!moeda) {
  console.error(`\nRECUSADO: não conheço a moeda de "${pais}". Conhecidos: ${Object.keys(MOEDA).join(", ")}\n`);
  process.exit(2);
}

const env = lerEnv(".env.local");
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error(`\nRECUSADO: faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local\n`);
  process.exit(2);
}

const rest = async (caminho) => {
  const r = await fetch(`${URL}/rest/v1/${caminho}`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
  return r.json();
};

const OK = "  ok   ";
const NAO = " FALTA ";
const linha = (m, t, d) => console.log(`  [${m}] ${t}${d ? `\n          ${d}` : ""}`);
const dinheiro = (c, m) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: m });

console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`  MERCADO ${pais} (${moeda}) — as quatro pernas`);
console.log(`═══════════════════════════════════════════════════════════════\n`);

let faltam = 0;

// --- perna 1: o país está liberado por env ---------------------------------
//
// Lida da PRODUÇÃO, não do arquivo local: é o valor publicado que decide o
// que o cliente vê, e confundir os dois já produziu conclusão errada antes.

let paisesProd = null;
try {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "mercado-"));
  try {
    execFileSync("npx", ["vercel", "link", "--yes", "--project", "revera",
                         "--scope", "franciscoemanuel20s-projects"], { cwd: dir, stdio: "ignore" });
    execFileSync("npx", ["vercel", "env", "pull", ".env", "--environment=production", "--yes"],
                 { cwd: dir, stdio: "ignore" });
    for (const l of readFileSync(join(dir, ".env"), "utf8").split("\n")) {
      const m = l.match(/^\s*(CHECKOUT_PAISES|STRIPE_SECRET_KEY)\s*=\s*(.*)$/);
      if (m) (paisesProd ??= {})[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} catch {
  /* segue sem: as pernas 3 e 4 são o que este script existe para ver */
}

if (paisesProd) {
  const lista = (paisesProd.CHECKOUT_PAISES ?? "BR").split(",").map((s) => s.trim().toUpperCase());
  const liberado = lista.includes(pais);
  linha(liberado ? OK : NAO, `1. país liberado no checkout`,
        `CHECKOUT_PAISES em produção = ${paisesProd.CHECKOUT_PAISES || "(vazio, só BR)"}`);
  if (!liberado) faltam++;

  const sk = paisesProd.STRIPE_SECRET_KEY ?? "";
  const live = sk.startsWith("sk_live_");
  linha(live ? OK : NAO, `2. gateway internacional (Stripe)`,
        live ? "" : sk ? "a chave publicada NÃO é live" : "STRIPE_SECRET_KEY ausente em produção");
  if (!live) faltam++;
} else {
  linha(NAO, "1 e 2. não consegui ler o ambiente de produção",
        'rode "npx vercel login" — as pernas 3 e 4 seguem abaixo mesmo assim');
  faltam += 2;
}

// --- perna 3: cotação de frete ativa e válida ------------------------------

const hoje = new Date().toISOString().slice(0, 10);
try {
  const q = await rest(
    `intl_shipping_quotes?country=eq.${pais}&currency=eq.${moeda}` +
    `&is_active=eq.true&valid_until=gte.${hoje}` +
    `&select=carrier,service_name,price_cents,valid_until,eta_days_min,eta_days_max` +
    `&order=created_at.desc&limit=1`
  );
  if (!q.length) {
    // Vale distinguir "nunca teve" de "venceu": o segundo é conserto de
    // minutos (recotar), o primeiro é trabalho de operação.
    const qq = await rest(
      `intl_shipping_quotes?country=eq.${pais}&select=valid_until,is_active&order=valid_until.desc&limit=1`
    );
    linha(NAO, `3. cotação de frete para ${pais}`,
          qq.length
            ? `existe uma, mas ${qq[0].is_active ? `VENCEU em ${qq[0].valid_until}` : "está inativa"}`
            : "nenhuma cotação cadastrada — frete não se inventa");
    faltam++;
  } else {
    const f = q[0];
    linha(OK, `3. cotação de frete: ${f.carrier} ${f.service_name}`,
          `${dinheiro(f.price_cents, moeda)} · ${f.eta_days_min ?? "?"}–${f.eta_days_max ?? "?"} dias · válida até ${f.valid_until}`);
  }
} catch (e) {
  linha(NAO, "3. não consegui ler intl_shipping_quotes", String(e.message ?? e));
  faltam++;
}

// --- perna 4: preço comercial na moeda do mercado --------------------------

try {
  const variantes = await rest(`product_variants?select=id,sku&is_active=eq.true`);
  const precos = await rest(`variant_prices?currency=eq.${moeda}&is_active=eq.true&select=variant_id,price_cents`);
  const comPreco = new Set(precos.map((p) => p.variant_id));
  const sem = variantes.filter((v) => !comPreco.has(v.id));

  if (sem.length) {
    linha(NAO, `4. preço em ${moeda}: ${variantes.length - sem.length} de ${variantes.length} variantes ativas`,
          `sem preço: ${sem.slice(0, 6).map((v) => v.sku ?? v.id.slice(0, 8)).join(", ")}` +
          (sem.length > 6 ? ` … e mais ${sem.length - 6}` : ""));
    faltam++;

    /**
     * A causa mais provável, e a que aconteceu em 29/08/2026: os preços
     * existem, mas apontam para variantes que foram DESATIVADAS.
     *
     * Naquele dia os preços internacionais foram gravados às 06:16, e às
     * 06:32 a migração "cor virou variante" substituiu as 5 variantes PADRAO
     * por 24 variantes por cor. Dezesseis minutos separaram o trabalho da sua
     * invalidação, e nada apontou isso — cada tabela, sozinha, parecia certa.
     *
     * Dizer "0 de 24" esconde essa história. Dizer "os preços foram para
     * variantes que já não existem" leva direto ao conserto.
     */
    const ativos = new Set(variantes.map((v) => v.id));
    const orfaos = precos.filter((p) => !ativos.has(p.variant_id));
    if (orfaos.length) {
      linha(NAO, `   e ${orfaos.length} preço(s) em ${moeda} apontam para variantes INATIVAS`,
            "os preços foram cadastrados antes de as variantes mudarem — recadastre nas atuais");
    }
  } else {
    const valores = precos.map((p) => p.price_cents).sort((a, b) => a - b);
    linha(OK, `4. preço em ${moeda}: todas as ${variantes.length} variantes`,
          `de ${dinheiro(valores[0], moeda)} a ${dinheiro(valores.at(-1), moeda)}`);
  }
} catch (e) {
  linha(NAO, "4. não consegui ler variant_prices / product_variants", String(e.message ?? e));
  faltam++;
}

console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(faltam === 0
  ? `  ${pais} ABERTO: as quatro pernas existem.`
  : `  ${pais} FECHADO: ${faltam} perna(s) faltando. O checkout recusa com motivo,\n  e não com erro na cara de quem tentar comprar.`);
console.log(`═══════════════════════════════════════════════════════════════\n`);
