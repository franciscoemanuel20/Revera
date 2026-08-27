/**
 * Em que ambiente este processo está rodando — e o que ele tem permissão
 * de fingir.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE (P0-2 e P0-3, 27/08/2026)
 * ===========================================================================
 * Duas coisas do sistema só podem existir fora de produção: o provedor de
 * pagamento MOCK (que aprova tudo sem cobrar) e o simulador de checkout.
 * Antes, a única coisa que separava as duas realidades era o valor de uma
 * variável — e a ausência dela caía em mock, silenciosamente.
 *
 * A regra aqui é deliberadamente PESSIMISTA: na dúvida, é produção.
 *
 * Não é simetria. Os dois erros possíveis têm tamanhos muito diferentes:
 *
 *   - achar que é produção quando é desenvolvimento
 *     → o mock não liga e alguém vê um erro claro dizendo o que configurar.
 *       Custo: um minuto de confusão.
 *
 *   - achar que é desenvolvimento quando é produção
 *     → a loja entrega prótese de R$ 1.600 de graça e ensina a Meta a
 *       otimizar campanha em cima de vendas que não existiram.
 *       Custo: dinheiro e conta de anúncio envenenada.
 *
 * Por isso "desenvolvimento" precisa ser PROVADO, não presumido.
 */

export type Ambiente = "desenvolvimento" | "preview" | "producao";

/**
 * As variáveis são lidas a cada chamada (e não capturadas no topo do módulo)
 * para que teste consiga exercitar cada ambiente sem recarregar o módulo.
 */
export function ambienteAtual(): Ambiente {
  // Na Vercel, VERCEL_ENV é a fonte mais confiável: ela distingue o domínio
  // de produção de um preview, coisa que NODE_ENV não faz (os dois são
  // 'production' num build da Vercel).
  const vercel = process.env.VERCEL_ENV;
  if (vercel === "production") return "producao";
  if (vercel === "preview") return "preview";
  if (vercel === "development") return "desenvolvimento";

  // Fora da Vercel: só `next dev` marca NODE_ENV como 'development'.
  // `next start` (build de produção rodando localmente) marca 'production',
  // e é tratado como produção de propósito — é o mesmo binário que
  // atenderia um comprador.
  if (process.env.NODE_ENV === "development") return "desenvolvimento";
  if (process.env.NODE_ENV === "test") return "desenvolvimento";

  // NODE_ENV ausente, vazio ou desconhecido cai aqui. Fail-closed.
  return "producao";
}

export function ehProducao(): boolean {
  return ambienteAtual() === "producao";
}

/**
 * Se este ambiente pode usar dublê — pagamento mock, tela de checkout
 * simulado, e qualquer outro atalho que substitua um serviço externo.
 *
 * `preview` NÃO pode. Um preview da Vercel tem URL pública, pode ser aberto
 * por qualquer pessoa com o link e é onde se mostra o site para alguém antes
 * de publicar. Se o mock funcionasse ali, a primeira demonstração para uma
 * cliente de verdade seria uma compra falsa aprovada.
 */
export function permiteSimulacao(): boolean {
  return ambienteAtual() === "desenvolvimento";
}

/** Frase única de diagnóstico, para as mensagens de erro não divergirem. */
export function descricaoDoAmbiente(): string {
  return `ambiente=${ambienteAtual()} (VERCEL_ENV=${
    process.env.VERCEL_ENV ?? "ausente"
  }, NODE_ENV=${process.env.NODE_ENV ?? "ausente"})`;
}
