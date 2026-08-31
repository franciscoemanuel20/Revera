/**
 * Estado da conta Stripe da Reverá — e o que a análise ainda quer.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE (30/08/2026)
 * ===========================================================================
 * A pergunta "já aprovou? falta algum documento?" foi feita três vezes, e as
 * três vezes a resposta exigiu alguém abrir o Dashboard, logar na conta
 * certa e interpretar um banner. Isto responde em dois segundos, e responde
 * a coisa exata: a lista `requirements`, que é o que a Stripe realmente
 * cobra — o banner é só o resumo dela.
 *
 * ===========================================================================
 * QUAL CHAVE USAR, E POR QUE UMA RESTRITA BASTA
 * ===========================================================================
 * Ele lê, nesta ordem, a primeira que existir:
 *
 *   STRIPE_READONLY_KEY   ← a recomendada: chave RESTRITA, só leitura
 *   STRIPE_SECRET_KEY     ← funciona, mas é a chave que move dinheiro
 *
 * A restrita se cria em: Dashboard (conta da Reverá, modo LIVE) →
 * Developers → API keys → "Create restricted key" → dê permissão de LEITURA
 * (Read) só em "Account". Nada mais. Uma chave dessas não cobra ninguém, não
 * estorna, não lê cliente — se vazar, o estrago é ela contar o que já está
 * no painel.
 *
 * Guarde em `.env.local` (que não vai para o Git). NUNCA cole chave em
 * conversa, em issue, nem em commit.
 *
 * ===========================================================================
 * A ARMADILHA QUE ESTE SCRIPT DENUNCIA
 * ===========================================================================
 * Existem DOIS pares de conta Reverá, e o staging usa o par ANTIGO. Uma
 * chave do par errado não dá erro nenhum: responde bonito, sobre a conta
 * que não é a sua. Por isso a primeira linha da saída é sempre o `acct_` —
 * confira contra o que você espera antes de ler o resto.
 *
 * Uso:
 *   cd ~/Claude/revera && node scripts/stripe-status.mjs
 */

import fs from "node:fs";
import path from "node:path";

/** A conta que está sendo ativada, para o script avisar se a chave é de outra. */
const CONTA_ESPERADA = "acct_1U9TBvRmNIBXBagx";

function lerEnv() {
  const valores = {};
  for (const arquivo of [".env.local", ".env.staging"]) {
    const caminho = path.resolve(process.cwd(), arquivo);
    if (!fs.existsSync(caminho)) continue;
    for (const linha of fs.readFileSync(caminho, "utf8").split("\n")) {
      const m = linha.match(/^([A-Z_]+)=(.*)$/);
      // Primeiro arquivo vence: .env.local manda mais que .env.staging.
      if (m && !(m[1] in valores)) valores[m[1]] = m[2].trim();
    }
  }
  return valores;
}

const env = lerEnv();
const chave = env.STRIPE_READONLY_KEY || env.STRIPE_SECRET_KEY;

if (!chave) {
  console.log("Nenhuma chave encontrada.\n");
  console.log("Ponha em .env.local uma destas (a de cima é a recomendada):");
  console.log("  STRIPE_READONLY_KEY=rk_live_...   chave restrita, só leitura de Account");
  console.log("  STRIPE_SECRET_KEY=sk_live_...     a chave que move dinheiro\n");
  console.log("Como criar a restrita: Dashboard da Reverá em modo LIVE →");
  console.log("Developers → API keys → Create restricted key → Account: Read.");
  process.exit(1);
}

if (chave.includes("_test_")) {
  console.log("A chave encontrada é de TESTE (sk_test/rk_test).\n");
  console.log("Chave de teste não enxerga a conta live — ela responde sobre o");
  console.log("sandbox, e o sandbox está sempre 'não aprovado'. Para conferir a");
  console.log("análise, é preciso uma chave do modo LIVE.");
  process.exit(1);
}

const resposta = await fetch("https://api.stripe.com/v1/account", {
  headers: { Authorization: `Bearer ${chave}` },
});
const conta = await resposta.json();

if (!resposta.ok) {
  console.log(`A Stripe recusou a chave (HTTP ${resposta.status}).`);
  console.log(conta?.error?.message ?? "");
  process.exit(1);
}

const req = conta.requirements ?? {};
const lista = (a) => (a && a.length ? a : null);

console.log("=".repeat(66));
console.log("CONTA     :", conta.id, conta.id === CONTA_ESPERADA ? "✓ é a que está sendo ativada" : "⚠ NÃO é a conta esperada (" + CONTA_ESPERADA + ")");
console.log("NOME      :", conta.settings?.dashboard?.display_name ?? conta.business_profile?.name ?? "(sem nome)");
console.log("PAÍS      :", conta.country, "· moeda", (conta.default_currency ?? "").toUpperCase());
console.log("TIPO      :", conta.business_type ?? "(ainda não definido)");
console.log("-".repeat(66));
console.log("COBRA?    :", conta.charges_enabled ? "SIM — a conta está liberada" : "não");
console.log("REPASSA?  :", conta.payouts_enabled ? "SIM" : "não");
console.log("ENVIADO?  :", conta.details_submitted ? "sim, formulário enviado" : "NÃO — o formulário nunca foi enviado");
console.log("=".repeat(66));

/**
 * A leitura que importa. `requirements` vazio significa coisas OPOSTAS
 * conforme `details_submitted`: antes do envio quer dizer "nem começou";
 * depois do envio quer dizer "não estão pedindo nada, é só esperar".
 */
if (conta.charges_enabled) {
  console.log("\n✅ APROVADA. Pode seguir para o webhook e as chaves na Vercel.");
} else if (!conta.details_submitted) {
  console.log("\n⛔ O formulário de ativação nunca foi enviado. Não adianta esperar.");
} else {
  const pendencias = [
    ["PEDIDOS AGORA (bloqueiam)", lista(req.currently_due)],
    ["ATRASADOS (bloqueiam já)", lista(req.past_due)],
    ["EM VERIFICAÇÃO (nada a fazer)", lista(req.pending_verification)],
    ["VÃO SER PEDIDOS DEPOIS", lista(req.eventually_due)],
  ].filter(([, v]) => v);

  if (pendencias.length === 0) {
    console.log("\n⏳ EM ANÁLISE, e a Stripe NÃO está pedindo documento nenhum.");
    console.log("   Não há o que fazer além de esperar.");
  } else {
    console.log("\n⏳ EM ANÁLISE. O que a Stripe lista:\n");
    for (const [titulo, itens] of pendencias) {
      console.log(` ${titulo}:`);
      for (const i of itens) console.log(`   · ${i}`);
      console.log("");
    }
  }
  if (req.current_deadline) {
    console.log("   Prazo dado pela Stripe:", new Date(req.current_deadline * 1000).toISOString().slice(0, 10));
  }
  if (req.disabled_reason) {
    console.log("   Motivo de ainda não cobrar:", req.disabled_reason);
  }
}
