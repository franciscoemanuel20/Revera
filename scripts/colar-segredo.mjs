#!/usr/bin/env node
/**
 * Cola um segredo da área de transferência no lugar certo — sem ele passar
 * por lugar nenhum indevido.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE (31/08/2026)
 * ===========================================================================
 * Pedido do Francisco: "eu estou gostando de colar as chaves assim via
 * terminal, se puder memorizar isso para eu nunca mais precisar copiar e
 * ficar procurando Vercel, Supabase etc".
 *
 * O caminho antigo era: abrir o painel do provedor, achar a tela de
 * variáveis, colar num campo, escolher o ambiente, salvar. Cinco passos, em
 * três painéis diferentes, cada um com um jeito próprio de errar.
 *
 * Aqui é um comando. E o valor vem do CLIPBOARD, não de argumento:
 * argumento aparece no `ps` enquanto o processo roda e fica gravado no
 * histórico do shell para sempre.
 *
 * ===========================================================================
 * O QUE ELE NUNCA FAZ
 * ===========================================================================
 * - Nunca IMPRIME o valor. Nem em erro, nem em log. Só um prefixo mascarado
 *   ("sk_live_51ABC…"), o suficiente para você reconhecer sem expor.
 * - Nunca grava o valor em arquivo temporário.
 * - Nunca manda o valor por argumento para outro processo — vai por stdin.
 *
 * ===========================================================================
 * O QUE ELE FAZ E UM CAMPO DE PAINEL NÃO FAZ: CONFERIR ANTES
 * ===========================================================================
 * Esta é a razão real de o script existir, e não um alias de shell.
 *
 * A Reverá tem DOIS pares de conta Stripe. Chave do par errado não dá erro
 * em lugar nenhum: o teste passa, o site cobra, e o dinheiro cai na conta
 * errada. Um campo de texto no painel da Vercel aceita as duas caladas.
 *
 * Aqui, antes de gravar uma chave da Stripe, o script PERGUNTA À STRIPE de
 * qual conta ela é e compara com a esperada. Se não bater, ele recusa.
 *
 * Também recusa chave de teste indo para produção — o erro que só aparece
 * quando o primeiro cliente real não consegue pagar.
 *
 * ===========================================================================
 * USO
 * ===========================================================================
 *   # copie a chave no painel da Stripe, depois:
 *   node scripts/colar-segredo.mjs STRIPE_SECRET_KEY --para=vercel
 *   node scripts/colar-segredo.mjs STRIPE_WEBHOOK_SECRET --para=vercel
 *   node scripts/colar-segredo.mjs STRIPE_READONLY_KEY --para=local
 *
 *   # valor que não é segredo pode vir direto, sem clipboard:
 *   node scripts/colar-segredo.mjs CHECKOUT_PAISES --para=vercel --valor=BR,US
 *
 *   --para=local    grava em .env.local (que está no .gitignore)
 *   --para=vercel   grava na Vercel, ambiente Production
 *   --para=ambos    os dois
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

/** A conta Stripe live da Reverá. A do par ANTIGO é acct_1U9RgID7fHfQt4eq. */
const CONTA_STRIPE_ESPERADA = "acct_1U9TBvRmNIBXBagx";

/**
 * O que cada variável precisa parecer, e o que fazer para conferir.
 *
 * `formato` é a checagem barata (é uma chave live? é um whsec?).
 * `conferirConta` liga a checagem cara, que vai à Stripe perguntar de quem
 * é a chave — só faz sentido para chave da Stripe.
 */
const REGRAS = {
  STRIPE_SECRET_KEY: {
    formato: /^sk_live_[A-Za-z0-9]+$/,
    dica: "Deve começar com sk_live_. Chave sk_test_ é do sandbox e não cobra ninguém.",
    conferirConta: true,
    sensivel: true,
  },
  STRIPE_READONLY_KEY: {
    formato: /^rk_live_[A-Za-z0-9]+$/,
    dica: "Deve começar com rk_live_ (chave restrita, modo live).",
    conferirConta: true,
    sensivel: true,
  },
  STRIPE_WEBHOOK_SECRET: {
    formato: /^whsec_[A-Za-z0-9]+$/,
    dica: "Deve começar com whsec_. É o valor que a Stripe mostra ao criar o endpoint.",
    conferirConta: false,
    sensivel: true,
  },
  DATABASE_URL: {
    formato: /^postgres(ql)?:\/\/.+/,
    dica: "Deve começar com postgresql://. É a URI em Project Settings → Database.",
    conferirConta: false,
    sensivel: true,
  },
  CHECKOUT_PAISES: {
    formato: /^[A-Z]{2}(,[A-Z]{2})*$/,
    dica: "Lista de ISO de dois dígitos separada por vírgula, ex: BR,US. Sem espaços.",
    conferirConta: false,
    sensivel: false,
  },
};

const [nome, ...resto] = process.argv.slice(2);
const opts = Object.fromEntries(
  resto.map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  })
);

if (!nome || !REGRAS[nome]) {
  console.error("Uso: node scripts/colar-segredo.mjs NOME_DA_VARIAVEL --para=local|vercel|ambos");
  console.error("\nVariáveis conhecidas:");
  for (const [k, r] of Object.entries(REGRAS)) console.error(`  ${k.padEnd(24)} ${r.dica}`);
  process.exit(2);
}

const regra = REGRAS[nome];
const destino = opts.para ?? "local";
if (!["local", "vercel", "ambos"].includes(destino)) {
  console.error("--para precisa ser local, vercel ou ambos.");
  process.exit(2);
}

/**
 * O valor. Segredo vem do clipboard; valor público pode vir por --valor.
 * Um segredo NUNCA vem por --valor, e o script recusa se tentarem.
 */
let valor;
if (opts.valor) {
  if (regra.sensivel) {
    console.error(
      `${nome} é segredo e não aceita --valor: argumento aparece no \`ps\` e fica no\n` +
        "histórico do shell. Copie o valor e rode sem --valor, que eu leio da\n" +
        "área de transferência."
    );
    process.exit(2);
  }
  valor = String(opts.valor).trim();
} else {
  try {
    valor = execFileSync("pbpaste", { encoding: "utf8" }).trim();
  } catch {
    console.error("Não consegui ler a área de transferência (pbpaste).");
    process.exit(2);
  }
}

if (!valor) {
  console.error("A área de transferência está vazia. Copie o valor e rode de novo.");
  process.exit(2);
}

/** Mostra o bastante para reconhecer, nunca o bastante para vazar. */
const mascarar = (v) =>
  v.length <= 12 ? `${v.slice(0, 3)}…` : `${v.slice(0, 12)}…${v.slice(-2)} (${v.length} caracteres)`;

console.log(`Variável : ${nome}`);
console.log(`Valor    : ${mascarar(valor)}`);
console.log(`Destino  : ${destino}`);

if (!regra.formato.test(valor)) {
  console.error(`\nRECUSADO — o formato não bate.\n  ${regra.dica}`);
  process.exit(1);
}

/* =========================================================================
 * A CONFERÊNCIA QUE VALE DINHEIRO
 * =======================================================================*/
if (regra.conferirConta) {
  process.stdout.write("Perguntando à Stripe de qual conta é esta chave… ");
  const r = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${valor}` },
  });
  const conta = await r.json();
  if (!r.ok) {
    console.error(`\nRECUSADO — a Stripe não aceitou a chave (HTTP ${r.status}).`);
    console.error(`  ${conta?.error?.message ?? ""}`);
    process.exit(1);
  }
  if (conta.id !== CONTA_STRIPE_ESPERADA) {
    console.error(`\nRECUSADO — esta chave é da conta ${conta.id}.`);
    console.error(`  A esperada é ${CONTA_STRIPE_ESPERADA} (Reverá, live).`);
    console.error("  Chave do par errado não dá erro em lugar nenhum: o site cobra e o");
    console.error("  dinheiro cai na conta errada. Por isso eu paro aqui.");
    process.exit(1);
  }
  console.log(`ok — ${conta.id}`);
  if (conta.charges_enabled === false) {
    console.log("AVISO: esta conta ainda não pode cobrar (charges_enabled: false).");
  }
}

/* =========================================================================
 * GRAVAR
 * =======================================================================*/
function gravarLocal() {
  const caminho = new URL("../.env.local", import.meta.url);
  let conteudo = existsSync(caminho) ? readFileSync(caminho, "utf8") : "";
  const linha = `${nome}=${valor}`;
  const re = new RegExp(`^${nome}=.*$`, "m");
  conteudo = re.test(conteudo)
    ? conteudo.replace(re, linha)
    : conteudo.replace(/\n*$/, "\n") + linha + "\n";
  writeFileSync(caminho, conteudo);
  console.log("Gravado em .env.local (que está no .gitignore).");
}

function gravarVercel() {
  // Remove antes de adicionar: a Vercel não sobrescreve, ela recusa.
  // `|| true` porque não existir ainda é o caso normal na primeira vez.
  spawnSync("npx", ["vercel", "env", "rm", nome, "production", "--yes"], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  // O valor vai por STDIN, nunca por argumento.
  const r = spawnSync("npx", ["vercel", "env", "add", nome, "production"], {
    input: valor,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error("Falhou ao gravar na Vercel:");
    console.error((r.stderr || r.stdout || "").split("\n").slice(-6).join("\n"));
    process.exit(1);
  }
  console.log("Gravado na Vercel, ambiente Production.");
  console.log("A Vercel NÃO republica sozinha por mudança de variável —");
  console.log("é preciso um novo deploy para ela valer. Um push na main resolve.");
}

if (destino === "local" || destino === "ambos") gravarLocal();
if (destino === "vercel" || destino === "ambos") gravarVercel();

console.log("\nPronto.");
