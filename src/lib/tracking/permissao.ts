import { ehProducao, descricaoDoAmbiente } from "@/lib/config/ambiente";

/**
 * Quem tem direito de virar conversão na conta de anúncios.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE (P0-3, 27/08/2026)
 * ===========================================================================
 * O sistema já garantia que Purchase só nasce depois de pagamento
 * confirmado. O que ele NÃO garantia é que o pagamento confirmado fosse
 * DINHEIRO. Com PAYMENT_PROVIDER=mock, `confirmPayment()` devolve paid:true
 * sempre — então o fluxo inteiro rodava certo, o pedido virava 'paid' de
 * verdade, e o Purchase saía para o Pixel e a CAPI REAIS.
 *
 * Na auditoria de 26/08/2026 o ambiente local estava exatamente assim: mock
 * combinado com NEXT_PUBLIC_META_PIXEL_ID e META_CAPI_TOKEN de produção. Um
 * clique em "Simular pagamento aprovado" injetaria uma venda inexistente na
 * conta de anúncios — e a Meta otimizaria as campanhas em cima dela.
 *
 * Duas perguntas independentes decidem, e as DUAS precisam ser "sim":
 *
 *   1. O pagamento foi feito por um provedor REAL?
 *      Um pagamento de mentira não vira conversão, nem que o ambiente seja
 *      produção.
 *
 *   2. Este AMBIENTE pode falar com a conta real?
 *      Um pagamento real confirmado a partir da máquina de alguém em
 *      desenvolvimento também não deve contar. É a mesma conta de anúncios.
 *
 * Separar as duas importa porque elas falham de formas diferentes: a
 * primeira pega o mock; a segunda pega o teste automatizado, o preview, e o
 * `next start` local que alguém deixou rodando.
 */

/**
 * Provedores que não movimentam dinheiro. Um pagamento confirmado por
 * qualquer um deles é ficção — útil para exercitar o fluxo, nunca para
 * medir.
 */
export const PROVIDERS_SIMULADOS = new Set(["mock", "simulado", "teste"]);

export interface DecisaoConversao {
  pode: boolean;
  /** Preenchido quando `pode` é false — vai para conversion_logs. */
  motivo: string | null;
  /**
   * Envio permitido, mas marcado como TESTE na plataforma (a Meta aceita
   * `test_event_code`, que aparece no Gerenciador de Eventos e não entra na
   * otimização). É o único jeito de exercitar a integração de verdade sem
   * sujar a conta.
   */
  comoTeste: boolean;
}

const NAO = (motivo: string): DecisaoConversao => ({
  pode: false,
  motivo,
  comoTeste: false,
});

/**
 * Código de evento de teste da Meta, quando configurado. Só tem efeito
 * junto com TRACKING_ALLOW_DEV_SEND=1.
 */
export function codigoDeEventoDeTeste(): string | null {
  const codigo = process.env.META_TEST_EVENT_CODE?.trim();
  return codigo ? codigo : null;
}

export function podeEnviarConversao(input: {
  /** payments.provider do pagamento que confirmou este pedido. */
  providerPagamento: string | null | undefined;
}): DecisaoConversao {
  const provider = input.providerPagamento?.trim().toLowerCase() ?? "";

  // ---------------------------------------------------------------------
  // Pergunta 1 — o pagamento foi real?
  // ---------------------------------------------------------------------
  if (!provider) {
    // Fail-closed. Não conseguir provar que houve dinheiro é motivo
    // suficiente para não contar. Perder uma conversão legítima é um
    // problema de relatório, e fica registrado em conversion_logs com este
    // motivo; contar uma inexistente é um problema de otimização de
    // campanha, e não fica registrado em lugar nenhum.
    return NAO(
      "provedor do pagamento desconhecido — sem prova de que houve cobrança real"
    );
  }

  if (PROVIDERS_SIMULADOS.has(provider)) {
    return NAO(
      `pagamento simulado (provider="${provider}") — nenhum dinheiro entrou, ` +
        "não pode virar conversão"
    );
  }

  // ---------------------------------------------------------------------
  // Pergunta 2 — este ambiente pode falar com a conta real?
  // ---------------------------------------------------------------------
  if (ehProducao()) {
    return { pode: true, motivo: null, comoTeste: false };
  }

  const liberadoParaDev = process.env.TRACKING_ALLOW_DEV_SEND?.trim() === "1";
  const codigoTeste = codigoDeEventoDeTeste();

  if (liberadoParaDev && codigoTeste) {
    // Vai, mas identificado como teste. A Meta separa esses eventos e não os
    // usa para otimizar.
    return { pode: true, motivo: null, comoTeste: true };
  }

  if (liberadoParaDev && !codigoTeste) {
    return NAO(
      "TRACKING_ALLOW_DEV_SEND=1 sem META_TEST_EVENT_CODE — envio fora de " +
        "produção só é permitido como evento de teste identificado. " +
        descricaoDoAmbiente()
    );
  }

  return NAO(
    `envio bloqueado fora de produção (${descricaoDoAmbiente()}) — para ` +
      "exercitar a integração, defina TRACKING_ALLOW_DEV_SEND=1 e " +
      "META_TEST_EVENT_CODE"
  );
}

/**
 * Se o rastreamento de navegador (Pixel base, PageView, ViewContent…) deve
 * sequer carregar neste ambiente.
 *
 * Chamado no layout, que é Server Component — é o único lugar que enxerga
 * VERCEL_ENV/NODE_ENV. Um componente client só vê variáveis NEXT_PUBLIC_, e
 * nenhuma delas distingue produção de desenvolvimento.
 *
 * Separado de `podeEnviarConversao` de propósito: aquela decide sobre UMA
 * venda (e depende do provedor do pagamento); esta decide sobre a sessão
 * inteira, antes de existir venda nenhuma.
 */
export function rastreamentoAtivoNesteAmbiente(): boolean {
  if (ehProducao()) return true;
  return (
    process.env.TRACKING_ALLOW_DEV_SEND?.trim() === "1" &&
    codigoDeEventoDeTeste() !== null
  );
}
