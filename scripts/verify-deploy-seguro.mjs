#!/usr/bin/env node
/**
 * Trava de deploy — recusa subir uma configuração que pode custar dinheiro.
 *
 * ===========================================================================
 * POR QUE EXISTE (P0-2, 27/08/2026)
 * ===========================================================================
 * O código já falha fechado em runtime (src/lib/payments/index.ts recusa
 * aprovar qualquer coisa sem PAYMENT_PROVIDER). Isto aqui é a camada de
 * ANTES: em vez de a loja subir e ficar sem pagamento, o deploy nem começa,
 * e quem está publicando lê exatamente qual variável falta.
 *
 * A diferença importa. Uma trava de runtime protege o dinheiro mas só é
 * descoberta pelo primeiro cliente que tentar comprar. Uma trava de deploy é
 * descoberta por quem publicou, no momento em que ele ainda está olhando.
 *
 * ===========================================================================
 * COMO ELA É EXECUTADA — não depende de ninguém lembrar (27/08/2026)
 * ===========================================================================
 * Está ligada ao deploy em `vercel.json`:
 *
 *     "buildCommand": "node scripts/verify-deploy-seguro.mjs && next build"
 *
 * O `&&` é a trava: código de saída 1 aqui e o `next build` NÃO COMEÇA. O
 * deploy falha na Vercel, com estas mensagens no log, antes de existir
 * qualquer URL servindo a loja.
 *
 * Por que em `vercel.json` e não em `prebuild` do package.json: `prebuild`
 * rodaria também no `npm run build` da máquina de quem desenvolve, onde não
 * existem (nem devem existir) as variáveis de produção — e o ambiente é
 * detectado como produção por fail-closed, então o build local quebraria
 * sempre. Na Vercel, `VERCEL_ENV` está sempre definida, então a detecção é
 * exata e a trava mira só onde existe comprador de verdade.
 *
 * Uso manual (continua valendo, para conferir antes de publicar):
 *   node scripts/verify-deploy-seguro.mjs
 *   npm run verify:deploy
 */

const problemas = [];
const avisos = [];

function env(nome) {
  const v = process.env[nome];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Mesma regra de src/lib/config/ambiente.ts — na dúvida, é produção.
 *
 * A duplicação é proposital e conhecida: este arquivo roda como buildCommand
 * na Vercel, ANTES do build, e não tem como importar TypeScript. Mudou lá,
 * muda aqui. As duas versões têm o mesmo teste de matriz cobrindo-as.
 */
function ambienteAtual() {
  const vercel = env("VERCEL_ENV");
  const querStaging = env("APP_ENV").toLowerCase() === "staging";

  if (vercel === "production") return "producao";
  if (vercel === "development") return "desenvolvimento";
  const node = env("NODE_ENV");
  if (!vercel && (node === "development" || node === "test")) return "desenvolvimento";
  if (querStaging) return "staging";
  if (vercel === "preview") return "preview";
  return "producao";
}

const ambiente = ambienteAtual();

/**
 * Existe risco de uma pessoa real comprar aqui?
 *
 * Preview entra: a URL é pública e indexável. Staging NÃO entra — é um lugar
 * deliberado, configurado à mão, e é justamente onde sandbox e test mode
 * precisam ser permitidos. Antes desta separação (27/08/2026) preview e
 * staging eram a mesma coisa, e por isso um staging simplesmente não
 * conseguia subir: a trava exigia dele configuração de produção.
 */
const podeReceberComprador = ambiente === "producao" || ambiente === "preview";
const permiteSimulacao = ambiente === "desenvolvimento" || ambiente === "staging";

/**
 * Incoerência que não pode passar em silêncio: alguém pediu staging no
 * domínio de produção. O runtime IGNORA o pedido (ver ambiente.ts), então a
 * loja não fica insegura — mas quem configurou acha que está num staging, e
 * pode publicar achando que testa. Recusar o deploy é como isso aparece.
 */
if (env("VERCEL_ENV") === "production" && env("APP_ENV").toLowerCase() === "staging") {
  problemas.push(
    "APP_ENV=staging no domínio de PRODUÇÃO. O pedido é ignorado pelo " +
      "runtime (produção nunca vira staging), mas a configuração está " +
      "errada: ou esta variável não deveria estar aqui, ou este deploy não " +
      "deveria ser o de produção. Remova APP_ENV deste projeto."
  );
}

console.log(`\nVerificação de deploy seguro — ambiente detectado: ${ambiente}`);
console.log(
  `  (VERCEL_ENV=${env("VERCEL_ENV") || "ausente"}, NODE_ENV=${
    env("NODE_ENV") || "ausente"
  }, APP_ENV=${env("APP_ENV") || "ausente"})\n`
);

// ---------------------------------------------------------------------------
// P0-2 — pagamento nunca pode cair em mock onde existe comprador real
// ---------------------------------------------------------------------------
const provider = env("PAYMENT_PROVIDER");

if (podeReceberComprador) {
  if (!provider) {
    problemas.push(
      "PAYMENT_PROVIDER ausente. Neste ambiente existe comprador real e não " +
        "há padrão: a loja subiria sem conseguir cobrar. Defina 'infinitepay'."
    );
  } else if (provider === "mock") {
    problemas.push(
      "PAYMENT_PROVIDER=mock neste ambiente. O provedor simulado APROVA " +
        "QUALQUER PAGAMENTO SEM COBRAR — a loja entregaria as peças de graça. " +
        "Use 'infinitepay'."
    );
  } else if (provider !== "infinitepay") {
    problemas.push(
      `PAYMENT_PROVIDER="${provider}" não é um provedor conhecido. ` +
        "Aceitos: 'infinitepay' (real), 'mock' (só em desenvolvimento e staging)."
    );
  }
}

// Staging: provider ainda é obrigatório (ausente continua sendo erro de
// configuração), mas 'mock' é o valor esperado — é para isso que ele existe.
if (permiteSimulacao && ambiente === "staging") {
  if (!provider) {
    problemas.push(
      "PAYMENT_PROVIDER ausente em staging. Mesmo aqui não existe padrão: " +
        "declare 'mock' para simular, ou o provedor de teste quando houver."
    );
  } else if (provider !== "mock" && provider !== "infinitepay") {
    problemas.push(`PAYMENT_PROVIDER="${provider}" desconhecido em staging.`);
  } else if (provider === "infinitepay") {
    problemas.push(
      "PAYMENT_PROVIDER=infinitepay em STAGING. Isso cobraria de verdade, " +
        "com o gateway real, a partir de um ambiente de teste. Use 'mock'."
    );
  }

  if (provider === "infinitepay" && !env("INFINITEPAY_HANDLE")) {
    problemas.push(
      "INFINITEPAY_HANDLE ausente com PAYMENT_PROVIDER=infinitepay. " +
        "A criação da cobrança falharia em toda compra."
    );
  }

  if (!env("PAYMENT_WEBHOOK_SECRET")) {
    problemas.push(
      "PAYMENT_WEBHOOK_SECRET ausente. Sem ela o webhook não tem URL válida " +
        "e nenhuma venda se confirma sozinha. Gere com: openssl rand -base64 32"
    );
  }

  if (!env("NEXT_PUBLIC_SITE_URL")) {
    avisos.push(
      "NEXT_PUBLIC_SITE_URL ausente — o webhook e o redirect do gateway vão " +
        "usar a URL do deploy da Vercel, que muda a cada publicação."
    );
  }
} else if (provider === "mock") {
  console.log("  Pagamento em modo simulado (mock) — permitido em desenvolvimento.\n");
}

// ---------------------------------------------------------------------------
// P0-3 — rastreamento não pode misturar teste com a conta real
// ---------------------------------------------------------------------------
if (podeReceberComprador) {
  if (env("TRACKING_ALLOW_DEV_SEND") === "1") {
    problemas.push(
      "TRACKING_ALLOW_DEV_SEND=1 num ambiente com comprador real. Essa " +
        "variável existe só para exercitar a integração em desenvolvimento; " +
        "em produção ela não tem uso e sinaliza configuração copiada de outro " +
        "ambiente. Remova."
    );
  }
  if (env("META_TEST_EVENT_CODE")) {
    problemas.push(
      "META_TEST_EVENT_CODE definida em ambiente com comprador real. Eventos " +
        "marcados como teste NÃO entram na otimização — as vendas de verdade " +
        "sumiriam do Gerenciador de Eventos. Remova."
    );
  }
  if (env("NEXT_PUBLIC_META_PIXEL_ID") && !env("META_CAPI_TOKEN")) {
    avisos.push(
      "Pixel configurado sem META_CAPI_TOKEN — a medição fica só no " +
        "navegador. Compras por Pix, em que o cliente não volta à página de " +
        "obrigado, não serão contadas."
    );
  }
} else if (env("TRACKING_ALLOW_DEV_SEND") === "1" && !env("META_TEST_EVENT_CODE")) {
  avisos.push(
    "TRACKING_ALLOW_DEV_SEND=1 sem META_TEST_EVENT_CODE — o envio continua " +
      "bloqueado (é o comportamento seguro), mas a intenção parece ter sido " +
      "outra."
  );
}

// ---------------------------------------------------------------------------
// P0-4 — SuperFrete: ambiente explícito, e nunca sandbox atendendo cliente
// ---------------------------------------------------------------------------
const VALORES_SANDBOX = new Set(["1", "true", "sim", "sandbox", "on"]);
const VALORES_PRODUCAO = new Set([
  "0", "false", "nao", "não", "producao", "produção", "production", "off",
]);
const sandboxBruto = env("SUPERFRETE_SANDBOX").toLowerCase();

if (env("SUPERFRETE_TOKEN")) {
  if (!sandboxBruto) {
    problemas.push(
      "SUPERFRETE_SANDBOX ausente com SUPERFRETE_TOKEN definido. Não existe " +
        "padrão: defina '1' (sandbox) ou '0' (produção). Sem ela a cotação " +
        "falha e os pedidos nascem com frete 0."
    );
  } else if (
    !VALORES_SANDBOX.has(sandboxBruto) &&
    !VALORES_PRODUCAO.has(sandboxBruto)
  ) {
    // Nunca ecoa o valor — ele já foi um token uma vez.
    problemas.push(
      `SUPERFRETE_SANDBOX tem valor irreconhecível (${sandboxBruto.length} ` +
        "caracteres). Use '1' ou '0'. Se você colou um token aqui, ele " +
        "pertence a SUPERFRETE_TOKEN."
    );
  } else if (podeReceberComprador && VALORES_SANDBOX.has(sandboxBruto)) {
    // Staging não cai aqui: sandbox é exatamente o que se espera dele.
    problemas.push(
      "SUPERFRETE_SANDBOX em modo sandbox num ambiente com comprador real. " +
        "As etiquetas seriam de mentira e nenhum pedido seria despachado de " +
        "verdade."
    );
  }

  if (ambiente === "staging" && VALORES_PRODUCAO.has(sandboxBruto)) {
    problemas.push(
      "SUPERFRETE_SANDBOX=0 em STAGING. Apontaria para a API real da " +
        "transportadora, e uma etiqueta criada ali é debitada da carteira de " +
        "verdade. Use '1'."
    );
  }

  if (env("SUPERFRETE_SANDBOX") === env("SUPERFRETE_TOKEN")) {
    problemas.push(
      "SUPERFRETE_SANDBOX contém exatamente o mesmo valor de " +
        "SUPERFRETE_TOKEN — é o erro de cópia encontrado em 26/08/2026, que " +
        "fazia o desenvolvimento apontar para a API de produção."
    );
  }
}

// ---------------------------------------------------------------------------
// Segredos que jamais podem virar variável pública
// ---------------------------------------------------------------------------
for (const nome of [
  "SUPABASE_SERVICE_ROLE_KEY",
  "META_CAPI_TOKEN",
  "GA4_API_SECRET",
  "SUPERFRETE_TOKEN",
  "PAYMENT_WEBHOOK_SECRET",
  "WHATSAPP_POST_PURCHASE_NUMBER",
]) {
  if (env(`NEXT_PUBLIC_${nome}`)) {
    problemas.push(
      `NEXT_PUBLIC_${nome} existe. O prefixo NEXT_PUBLIC_ manda o Next colocar ` +
        "o valor no bundle do navegador — este é um segredo e não pode sair daqui."
    );
  }
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
if (avisos.length > 0) {
  console.log("AVISOS (não bloqueiam):");
  for (const a of avisos) console.log(`  - ${a}`);
  console.log("");
}

if (problemas.length > 0) {
  console.error("DEPLOY RECUSADO — problemas que custam dinheiro:\n");
  for (const p of problemas) console.error(`  ✗ ${p}\n`);
  console.error(
    `${problemas.length} problema(s). Corrija as variáveis e rode de novo.\n`
  );
  process.exit(1);
}

console.log("OK — configuração segura para este ambiente.\n");
process.exit(0);
