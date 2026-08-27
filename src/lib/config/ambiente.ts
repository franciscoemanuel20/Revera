/**
 * Qual ambiente é este, e o que ele tem permissão de fazer.
 *
 * ===========================================================================
 * POR QUE `APP_ENV` SÓ SABE DIZER "STAGING" (27/08/2026)
 * ===========================================================================
 * A tentação era `APP_ENV=development | staging | production`, com o código
 * obedecendo ao que a variável mandasse. Isso cria um caminho de rebaixamento:
 * quem conseguisse escrever `APP_ENV=development` no projeto de produção
 * destravaria o provedor simulado de pagamento — e a loja real passaria a
 * APROVAR COMPRA SEM COBRAR. Uma variável de ambiente não pode ser a única
 * coisa entre o dinheiro e o prejuízo.
 *
 * Então esta variável tem exatamente um valor útil, `staging`, e ela só é
 * OBEDECIDA onde o ambiente por baixo já prova que não é a produção. No
 * domínio de produção da Vercel (`VERCEL_ENV=production`) ela é ignorada, e
 * a verificação de deploy recusa a publicação para a incoerência não passar
 * despercebida.
 *
 * Resumindo a direção: `APP_ENV` nunca torna um ambiente mais permissivo do
 * que ele já seria sem ela — só separa staging de preview, que antes eram a
 * mesma coisa.
 *
 * ===========================================================================
 * POR QUE PREVIEW NÃO VIROU STAGING AUTOMATICAMENTE
 * ===========================================================================
 * Preview da Vercel tem URL pública e é gerado a cada branch. Tratar todo
 * preview como staging faria qualquer branch aceitar pagamento simulado numa
 * URL que o Google pode indexar. Preview continua sendo preview: sem gasto,
 * sem rastreamento, e sem simulação.
 *
 * Staging é um lugar deliberado, configurado à mão, uma vez.
 */

export type Ambiente = "desenvolvimento" | "staging" | "preview" | "producao";

/**
 * O único valor aceito. Qualquer outra coisa — vazio, `production`, erro de
 * digitação — não vira nada: o ambiente é decidido pelo resto da regra.
 * Fail-closed por construção, porque não existe valor que afrouxe.
 */
const VALOR_STAGING = "staging";

export function ambienteAtual(): Ambiente {
  const vercel = process.env.VERCEL_ENV;
  const appEnv = (process.env.APP_ENV ?? "").trim().toLowerCase();
  const querStaging = appEnv === VALOR_STAGING;

  // 1) O domínio de produção manda, e APP_ENV não o contradiz. Se alguém
  //    escreveu `staging` aqui, é engano de configuração — e o pedido é
  //    ignorado em vez de obedecido. Quem avisa é verify-deploy-seguro.mjs,
  //    que recusa o deploy antes de a loja subir assim.
  if (vercel === "production") return "producao";

  // 2) Desenvolvimento local continua reconhecido primeiro: `next dev` é o
  //    ambiente mais restrito de todos em consequência (ninguém compra ali).
  if (vercel === "development") return "desenvolvimento";
  if (!vercel && (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")) {
    return "desenvolvimento";
  }

  // 3) Aqui, e só aqui, o pedido de staging vale: não é a produção, e foi
  //    declarado explicitamente.
  if (querStaging) return "staging";

  if (vercel === "preview") return "preview";

  // 4) Sinal ausente, vazio ou desconhecido. Fail-closed: é produção, que é
  //    o ambiente com as regras mais duras.
  return "producao";
}

/**
 * Configuração incoerente: alguém pediu staging no domínio de produção.
 * Não muda comportamento nenhum — existe para a verificação de deploy poder
 * recusar a publicação com uma mensagem que explica o que houve.
 */
export function pediuStagingEmProducao(): boolean {
  return (
    process.env.VERCEL_ENV === "production" &&
    (process.env.APP_ENV ?? "").trim().toLowerCase() === VALOR_STAGING
  );
}

/* =========================================================================
 * CAPACIDADES
 * =========================================================================
 * As perguntas que o resto do código faz. Cada uma é uma pergunta de
 * NEGÓCIO ("dá para gastar dinheiro aqui?"), não de infraestrutura ("é
 * produção?") — assim um ambiente novo se descreve preenchendo esta tabela,
 * em vez de caçar comparações espalhadas pelo código.
 * =======================================================================*/

/** Existe risco de uma pessoa real comprar aqui? */
export function podeReceberComprador(): boolean {
  const a = ambienteAtual();
  return a === "producao" || a === "preview";
}

/**
 * Provedor simulado / test mode é aceitável?
 *
 * Preview fica de FORA de propósito: a URL é pública, e um preview que
 * aprova pagamento simulado é uma loja que entrega sem receber.
 */
export function permiteSimulacao(): boolean {
  const a = ambienteAtual();
  return a === "desenvolvimento" || a === "staging";
}

/** Pode falar com a API de sandbox da transportadora? Mesma regra. */
export function permiteSandboxDeFrete(): boolean {
  return permiteSimulacao();
}

/**
 * Pode debitar dinheiro de verdade — carteira da SuperFrete, etiqueta paga?
 *
 * SÓ produção. Staging entra aqui como "não", que é o ponto inteiro dele.
 */
export function podeGastarDinheiroReal(): boolean {
  return ambienteAtual() === "producao";
}

/**
 * Pode disparar conversão para as contas reais de anúncio, e mandar
 * WhatsApp de verdade? Só produção — evento de teste na conta real estraga
 * a otimização das campanhas, e mensagem de teste chega em telefone real.
 */
export function podeUsarServicosReais(): boolean {
  return ambienteAtual() === "producao";
}

export function ehProducao(): boolean {
  return ambienteAtual() === "producao";
}

export function ehStaging(): boolean {
  return ambienteAtual() === "staging";
}

export function descricaoDoAmbiente(): string {
  return `ambiente=${ambienteAtual()} (VERCEL_ENV=${
    process.env.VERCEL_ENV ?? "ausente"
  }, NODE_ENV=${process.env.NODE_ENV ?? "ausente"}, APP_ENV=${
    process.env.APP_ENV ?? "ausente"
  })`;
}
