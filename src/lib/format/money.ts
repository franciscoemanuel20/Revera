/**
 * Formatação de dinheiro — extraído de components/ui/Price.tsx (fase 1,
 * onde o comentário original dizia "único lugar que faz essa conta na UI")
 * porque o admin (fase 2) também precisa exibir e converter preço, e
 * duplicar `.toLocaleString` divergente é exatamente o que aquele
 * comentário queria evitar. Continua sendo o único lugar que faz a conta;
 * só passou a ser importado em vez de reescrito.
 */

export function formatarBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Converte o que a dona da Reverá digita no formulário de admin (reais,
 * ex.: "349,90" ou "349.90" vindo de <input type="number">) para o
 * inteiro em centavos que o schema exige (`price_cents`). Arredonda em
 * vez de truncar — truncar cortaria centavo para baixo silenciosamente.
 */
export function reaisParaCentavos(valorReais: number): number {
  return Math.round(valorReais * 100);
}

export function centavosParaReais(cents: number): number {
  return cents / 100;
}
