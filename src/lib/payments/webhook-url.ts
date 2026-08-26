import "server-only";
import { createHash } from "node:crypto";

/**
 * URL do webhook de pagamento, com o segredo NO CAMINHO.
 *
 * ===========================================================================
 * POR QUE NO CAMINHO E NÃO EM QUERY STRING
 * ===========================================================================
 * Lição paga com dinheiro no projeto irmão. Copiado verbatim de
 * `repo/novo-site/src/app/api/checkout/create/route.ts`:
 *
 *   "Segredo no CAMINHO, não na query string. Em 12/08/2026 um pagamento
 *    real foi feito com '?s=SEGREDO' e o webhook nunca chegou (zero
 *    requisições nos logs). Todos os exemplos da documentação da
 *    InfinitePay usam URL sem query."
 *
 * O segredo bruto (`PAYMENT_WEBHOOK_SECRET`) nunca vai para a URL: vai o
 * SHA-256 dele em hexadecimal. Dois motivos:
 *   1. hex é seguro em URL — o segredo cru, gerado com `openssl rand
 *      -base64 32`, contém '/', '+' e '=' que quebrariam o caminho;
 *   2. a URL circula por sistemas de terceiros (painel do gateway, logs);
 *      vazar o hash é menos ruim que vazar o segredo.
 *
 * Isto NÃO é autenticação forte — é uma barreira contra varredura. A
 * segurança de verdade está em `confirmarPagamento`, que pergunta ao
 * gateway em vez de acreditar em quem bateu na porta.
 */

export function segredoDoCaminho(): string {
  const bruto = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!bruto) {
    // Gritar alto, de propósito. No projeto irmão a ausência desta variável
    // saiu calada e nenhum pagamento se confirmou sozinho por dias
    // ("...foi exatamente o que aconteceu em 20/08/2026, quando a variável
    // não existia e este return '' saía calado"). Falhar é melhor que
    // silenciosamente gerar uma URL inválida.
    throw new Error(
      "PAYMENT_WEBHOOK_SECRET ausente — sem ela o webhook de pagamento não " +
        "tem URL válida e nenhuma venda se confirma sozinha. Gere com: " +
        "openssl rand -base64 32"
    );
  }

  return createHash("sha256").update(bruto).digest("hex");
}

export function urlDoWebhook(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/webhooks/pagamento/${segredoDoCaminho()}`;
}

/** Comparação em tempo constante, para não vazar o segredo por timing. */
export function segredoConfere(recebido: string): boolean {
  const esperado = segredoDoCaminho();
  if (recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < recebido.length; i++) {
    diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferenca === 0;
}
