/**
 * O WhatsApp da Reverá — um número, um lugar.
 *
 * ===========================================================================
 * DECISÃO DO FRANCISCO EM 03/09/2026 — o número mudou, e a regra antiga caiu
 * ===========================================================================
 * O número passa a ser **(12) 98149-9901**. O anterior era o
 * (12) 98140-9901 — numero-antigo-de-proposito, a única citação viva dele em
 * todo o projeto, e é por isso que a linha carrega esse marcador. Ele está
 * na conta OFICIAL da Meta — quem escrevia para lá caía na API, não numa
 * pessoa. Palavras dele: "esse novo... ele não é oficial da meta". É um
 * WhatsApp comum, com alguém do outro lado, e é para ele que todo cliente
 * deve ser mandado.
 *
 * ISSO REVOGA a regra de 26/08/2026 que dizia que o telefone da Reverá só
 * podia aparecer na PÁGINA DO PEDIDO, atrás do `access_token`. Aquela regra
 * protegia o número oficial; este não precisa de proteção — ele já sai no
 * `href` do botão de /para-profissionais, que é página pública. Guardar um
 * número que está publicado seria cerimônia sem efeito, e pior: faria o
 * próximo a ler o código acreditar numa proteção que não existe mais.
 *
 * O que NÃO mudou: onde o botão aparece. Continuam sendo os mesmos dois
 * lugares de antes — a página do pedido e /para-profissionais. Espalhar
 * botão de WhatsApp por home, produto e checkout é decisão comercial (o
 * cliente que vai para o WhatsApp sai do carrinho), e essa o Francisco não
 * tomou.
 *
 * ===========================================================================
 * POR QUE UMA CONSTANTE, E NÃO `process.env`
 * ===========================================================================
 * Era `WHATSAPP_POST_PURCHASE_NUMBER` na Vercel. Variável de ambiente serve
 * para o que muda por ambiente ou não pode ser lido — nenhum dos dois vale
 * para um número que a loja publica no próprio site. Em troca, ela trazia
 * dois defeitos reais desta base:
 *
 *   1. Vazia em produção, a seção de suporte SUMIA sem avisar ninguém.
 *   2. Espaço em branco colado no valor é invisível para quem configura e
 *      fatal para quem valida — foi um TAB numa env que parou a loja de
 *      cobrar por dias em 29/08 (ver src/lib/config/urls.ts).
 *
 * Aqui o valor está escrito, é revisado em diff e não some.
 *
 * A env antiga pode ser apagada da Vercel; ninguém mais a lê.
 */

/** Só dígitos, COM DDI. O `wa.me` exige número internacional completo. */
export const WHATSAPP_REVERA = "5512981499901";

/** "(12) 98149-9901" em pt, "+55 12 98149-9901" fora — para ler na tela. */
export function whatsappLegivel(internacional = false): string {
  const nacional = WHATSAPP_REVERA.replace(/^55/, "");
  const ddd = nacional.slice(0, 2);
  const meio = nacional.slice(2, 7);
  const fim = nacional.slice(7);
  return internacional ? `+55 ${ddd} ${meio}-${fim}` : `(${ddd}) ${meio}-${fim}`;
}

/** Link pronto do WhatsApp, com a mensagem já digitada para o cliente. */
export function linkWhatsApp(mensagem: string): string {
  return `https://wa.me/${WHATSAPP_REVERA}?text=${encodeURIComponent(mensagem)}`;
}
