/**
 * Número de guia (AWB) da DHL Express: 10 dígitos.
 *
 * Aceita o número colado do MyDHL+ com pontuação de formatação; o que sobra tem de
 * ser exatamente 10 dígitos. Devolve null quando não é uma guia, para a tela
 * recusar em vez de gravar lixo.
 */
export function normalizarAwbDhl(entrada: string): string | null {
  const digitos = entrada.replace(/[.\s\-()/]/g, "");
  return /^\d{10}$/.test(digitos) ? digitos : null;
}
