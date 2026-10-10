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

function baseAsaasDeProducao(valor) {
  if (!valor) return false;
  try {
    const url = new URL(valor);
    return url.hostname === "api.asaas.com" || url.hostname === "asaas.com" || url.hostname === "www.asaas.com";
  } catch {
    return false;
  }
}

/** Project ref do Supabase de PRODUÇÃO. Público: é o subdomínio da URL. */
const SUPABASE_REF_PRODUCAO = "ngnaemfiytutyplolgxb";

/**
 * Projetos Supabase em que staging PODE gravar (REVERA-STAGING). Lista
 * fechada de propósito: staging só é seguro se for provadamente outro banco,
 * e "qualquer coisa que não pareça produção" não é prova — um domínio próprio
 * na frente do projeto de produção passaria. Projeto novo de staging entra
 * aqui, com a senha de mudança do AGENTS.md.
 */
const SUPABASE_REFS_STAGING = new Set(["dpeluxmzuuijuveesgtu"]);

/** Só a forma canônica `https://<ref>.supabase.co` prova de qual projeto é. */
function refDaUrlSupabase(valor) {
  if (!valor) return null;
  try {
    const url = new URL(valor);
    const m = url.protocol === "https:" ? url.host.match(/^([a-z0-9]+)\.supabase\.co$/) : null;
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** As chaves JWT do Supabase carregam o `ref` do projeto no payload. */
function refDaChaveSupabase(jwt) {
  if (!jwt || jwt.split(".").length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
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
// Preview só sobe como staging declarado (30/09/2026)
// ---------------------------------------------------------------------------
// Até aqui um Preview "puro" passava se recebesse a configuração de produção
// (REVERA_PAYMENT_PROVIDER=infinitepay): uma URL pública, fora do domínio
// oficial, cobrando de verdade e gravando no banco real. Preview não é lugar
// de credencial de produção. O caminho suportado é APP_ENV=staging com o
// conjunto do staging (mock, Supabase REVERA-STAGING) — ver
// docs/publicacao-rastreavel.md. As demais checagens abaixo continuam
// tratando Preview como ambiente com comprador real.
if (ambiente === "preview") {
  problemas.push(
    "Preview sem APP_ENV=staging. Preview é URL pública e não recebe " +
      "configuração de produção: ou sobe como staging declarado (pagamento " +
      "simulado, Supabase REVERA-STAGING — docs/publicacao-rastreavel.md), ou " +
      "não sobe."
  );
}

// ---------------------------------------------------------------------------
// P0-2 — pagamento nunca pode cair em mock onde existe comprador real
// ---------------------------------------------------------------------------
const providerGenerico = env("PAYMENT_PROVIDER");
const providerIsoladoRevera = env("REVERA_PAYMENT_PROVIDER");
const provider = providerIsoladoRevera || providerGenerico;
const nomeProvider = providerIsoladoRevera ? "REVERA_PAYMENT_PROVIDER" : "PAYMENT_PROVIDER";

if (podeReceberComprador) {
  if (providerIsoladoRevera !== "infinitepay") {
    problemas.push(
      "TRAVA FRANCISCO: produção da Revera está congelada em " +
        "REVERA_PAYMENT_PROVIDER=infinitepay. Não use PAYMENT_PROVIDER como " +
        "fallback e não troque para Asaas/mock sem validar a senha de mudança " +
        "do sistema antes de alterar esta trava."
    );
  }

  if (!provider) {
    problemas.push(
      "REVERA_PAYMENT_PROVIDER/PAYMENT_PROVIDER ausente. Neste ambiente existe comprador real e não " +
        "há padrão: a loja subiria sem conseguir cobrar. Defina 'asaas' ou 'infinitepay'."
    );
  } else if (provider === "mock") {
    problemas.push(
      `${nomeProvider}=mock neste ambiente. O provedor simulado APROVA ` +
        "QUALQUER PAGAMENTO SEM COBRAR — a loja entregaria as peças de graça. " +
        "Use 'asaas' ou 'infinitepay'."
    );
  } else if (provider !== "infinitepay" && provider !== "asaas") {
    problemas.push(
      `${nomeProvider}="${provider}" não é um provedor conhecido. ` +
        "Aceitos: 'asaas' ou 'infinitepay' (reais), 'mock' (só em desenvolvimento e staging)."
    );
  }

  if (provider === "asaas" && !env("ASAAS_API_KEY")) {
    problemas.push(
      `ASAAS_API_KEY ausente com ${nomeProvider}=asaas. ` +
        "A criação do checkout falharia em toda compra."
    );
  }
  if (provider === "asaas" && !env("ASAAS_WEBHOOK_AUTH_TOKEN")) {
    problemas.push(
      `ASAAS_WEBHOOK_AUTH_TOKEN ausente com ${nomeProvider}=asaas. ` +
        "O webhook do Asaas não seria autenticado antes de liberar pedido."
    );
  }
  if (provider === "asaas" && env("ASAAS_API_BASE")) {
    problemas.push(
      "ASAAS_API_BASE definida num ambiente com comprador real. Essa variável " +
        "só existe para sandbox/teste; produção deve usar https://api.asaas.com/v3."
    );
  }
  if (provider === "asaas" && env("ASAAS_CHECKOUT_BASE")) {
    problemas.push(
      "ASAAS_CHECKOUT_BASE definida num ambiente com comprador real. Essa variável " +
        "só existe para sandbox/teste; produção deve usar o checkout oficial do Asaas."
    );
  }
}

// Staging: provider ainda é obrigatório (ausente continua sendo erro de
// configuração), mas 'mock' é o valor esperado — é para isso que ele existe.
if (permiteSimulacao && ambiente === "staging") {
  if (!provider) {
    problemas.push(
      "REVERA_PAYMENT_PROVIDER/PAYMENT_PROVIDER ausente em staging. Mesmo aqui não existe padrão: " +
        "declare 'mock' para simular, ou o provedor de teste quando houver."
    );
  } else if (provider !== "mock" && provider !== "infinitepay" && provider !== "asaas") {
    problemas.push(`${nomeProvider}="${provider}" desconhecido em staging.`);
  } else if (provider === "infinitepay") {
    problemas.push(
      `${nomeProvider}=infinitepay em STAGING. Isso cobraria de verdade, ` +
        "com o gateway real, a partir de um ambiente de teste. Use 'mock'."
    );
  } else if (provider === "asaas") {
    const asaasApiBase = env("ASAAS_API_BASE");
    const asaasCheckoutBase = env("ASAAS_CHECKOUT_BASE");
    if (!asaasApiBase || !asaasCheckoutBase) {
      problemas.push(
        `${nomeProvider}=asaas em STAGING precisa de ASAAS_API_BASE e ` +
          "ASAAS_CHECKOUT_BASE apontando para sandbox/teste. Sem override, " +
          "o adapter usa o Asaas oficial e pode cobrar de verdade. Use 'mock' " +
          "ou configure o sandbox explicitamente."
      );
    } else if (baseAsaasDeProducao(asaasApiBase) || baseAsaasDeProducao(asaasCheckoutBase)) {
      problemas.push(
        `${nomeProvider}=asaas em STAGING está apontando para endpoint oficial ` +
          "do Asaas. Staging não pode criar checkout real; use sandbox/teste ou 'mock'."
      );
    }
  }

  if (provider === "infinitepay" && !env("INFINITEPAY_HANDLE")) {
    problemas.push(
      `INFINITEPAY_HANDLE ausente com ${nomeProvider}=infinitepay. ` +
        "A criação da cobrança falharia em toda compra."
    );
  }
  if (provider === "asaas" && !env("ASAAS_API_KEY")) {
    problemas.push(
      `ASAAS_API_KEY ausente com ${nomeProvider}=asaas. ` +
        "A criação do checkout falharia em toda compra."
    );
  }
  if (provider === "asaas" && !env("ASAAS_WEBHOOK_AUTH_TOKEN")) {
    problemas.push(
      `ASAAS_WEBHOOK_AUTH_TOKEN ausente com ${nomeProvider}=asaas. ` +
        "O webhook do Asaas não seria autenticado antes de liberar pedido."
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

  // -------------------------------------------------------------------------
  // Staging NUNCA no banco de produção (30/09/2026)
  // -------------------------------------------------------------------------
  // Staging autoriza 'mock', e mock aprova pedido sem cobrar. Isso só é
  // seguro porque o staging grava em OUTRO projeto Supabase. Até aqui essa
  // separação era só documentada (.env.staging, provar-isolamento-staging):
  // um Preview da Vercel com APP_ENV=staging e as variáveis de Supabase de
  // produção passava nesta trava e entregava, numa URL pública, pedido
  // "pago" de graça em cima dos dados reais. Agora a trava confere.
  //
  // O project ref é público (está na URL que vai para o navegador). Se a
  // produção mudar de projeto Supabase, atualize SUPABASE_REF_PRODUCAO.
  const refStaging = refDaUrlSupabase(env("NEXT_PUBLIC_SUPABASE_URL"));
  if (!refStaging) {
    problemas.push(
      "NEXT_PUBLIC_SUPABASE_URL ausente ou fora da forma https://<ref>.supabase.co " +
        "em staging. Sem a URL canônica não dá para provar que este ambiente " +
        "está fora do banco de produção (domínio próprio não prova nada)."
    );
  } else if (refStaging === SUPABASE_REF_PRODUCAO) {
    problemas.push(
      "NEXT_PUBLIC_SUPABASE_URL de STAGING aponta para o projeto Supabase de " +
        "PRODUÇÃO. Staging permite pagamento simulado: pedidos seriam aprovados " +
        "sem cobrança em cima dos dados reais. Use o projeto REVERA-STAGING."
    );
  } else if (!SUPABASE_REFS_STAGING.has(refStaging)) {
    problemas.push(
      "NEXT_PUBLIC_SUPABASE_URL de STAGING aponta para um projeto Supabase que " +
        "não está na lista de projetos de staging conhecidos " +
        "(SUPABASE_REFS_STAGING). Staging só sobe num banco provadamente separado."
    );
  }
  // Chave presente tem de PROVAR de que projeto é. Formato sem `ref` legível
  // (não-JWT) é recusado: aceitar "não sei" seria a mesma brecha de antes.
  for (const nome of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const chave = env(nome);
    if (!chave) continue;

    // Chaves modernas do Supabase são opacas e vinculadas ao projeto no
    // servidor. O project ref não fica mais dentro delas; quem prova o
    // destino é a URL canônica, já limitada acima à allowlist de staging.
    // Ainda validamos o tipo para nunca publicar uma sb_secret_ no navegador.
    if (chave.startsWith("sb_")) {
      const prefixoEsperado =
        nome === "NEXT_PUBLIC_SUPABASE_ANON_KEY" ? "sb_publishable_" : "sb_secret_";
      if (!chave.startsWith(prefixoEsperado)) {
        problemas.push(
          `${nome} usa uma chave moderna do tipo errado. Esperado prefixo ` +
            `${prefixoEsperado} para este campo.`
        );
      }
      continue;
    }

    const refChave = refDaChaveSupabase(chave);
    if (refChave === SUPABASE_REF_PRODUCAO) {
      problemas.push(
        `${nome} de STAGING é uma chave do projeto Supabase de PRODUÇÃO. ` +
          "Use as chaves do projeto REVERA-STAGING."
      );
    } else if (!refChave) {
      problemas.push(
        `${nome} de STAGING não é uma chave reconhecida. Use uma chave moderna ` +
          "sb_publishable_/sb_secret_ ou a chave JWT legada do projeto REVERA-STAGING."
      );
    } else if (refStaging && refChave !== refStaging) {
      problemas.push(
        `${nome} pertence a outro projeto Supabase que não o de ` +
          "NEXT_PUBLIC_SUPABASE_URL. URL e chaves do staging têm de ser do mesmo projeto."
      );
    }
  }
  if (env("DATABASE_URL").includes(SUPABASE_REF_PRODUCAO)) {
    problemas.push(
      "DATABASE_URL de STAGING aponta para o banco de PRODUÇÃO. Remova ou use " +
        "a conexão do projeto REVERA-STAGING."
    );
  }
} else if (provider === "mock") {
  console.log("  Pagamento em modo simulado (mock) — permitido em desenvolvimento.\n");
}

// ---------------------------------------------------------------------------
// STRIPE — o gateway internacional segue a mesma disciplina (28/08/2026)
// ---------------------------------------------------------------------------
// As duas direções são perigosas: chave LIVE fora de produção cobra cartão
// de verdade num ambiente de teste; chave TEST em produção "aprova" compra
// em que dinheiro nenhum entrou (o mesmo buraco do mock, com outro nome).
const stripeKey = env("STRIPE_SECRET_KEY");
if (stripeKey) {
  const ehLive = stripeKey.includes("_live") || stripeKey.startsWith("sk_live");
  if (ehLive && !podeReceberComprador) {
    problemas.push(
      "STRIPE_SECRET_KEY LIVE num ambiente sem comprador real. Um teste aqui " +
        "cobraria cartão de verdade. Use a chave sk_test_ correspondente."
    );
  }
  if (!ehLive && podeReceberComprador) {
    problemas.push(
      "STRIPE_SECRET_KEY de TESTE num ambiente com comprador real. Pedido " +
        "internacional seria 'pago' com cartão de teste, sem dinheiro entrar. " +
        "Use a chave live — ou remova a variável até o internacional abrir."
    );
  }
  if (!env("STRIPE_WEBHOOK_SECRET")) {
    problemas.push(
      "STRIPE_SECRET_KEY presente sem STRIPE_WEBHOOK_SECRET. O webhook da " +
        "Stripe ficaria não-verificável e todo evento seria recusado. As duas " +
        "andam juntas (whsec_... está no endpoint do Dashboard)."
    );
  }
} else if (env("STRIPE_WEBHOOK_SECRET")) {
  avisos.push(
    "STRIPE_WEBHOOK_SECRET presente sem STRIPE_SECRET_KEY — metade de uma " +
      "configuração. O internacional continua fechado (comportamento seguro), " +
      "mas confira se a intenção não era outra."
  );
}
if (env("STRIPE_API_BASE") && podeReceberComprador) {
  problemas.push(
    "STRIPE_API_BASE definida num ambiente com comprador real. Essa variável " +
      "aponta o pagamento para um servidor que NÃO é a Stripe — só existe " +
      "para o dublê de teste do staging. Remova."
  );
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
