/**
 * O WhatsApp da Reverá — um número, um lugar.
 *
 * ===========================================================================
 * CORRIGIDO EM 09/09/2026 — a constante volta a ser o número original
 * ===========================================================================
 * O registro de 03/09/2026 (histórico, logo abaixo) trocou o número da
 * constante achando que a citação antiga — a que este comentário chamava
 * de "número antigo, da conta oficial da Meta" — estava presa numa conta
 * de API sem pessoa do outro lado. O Francisco corrigiu isso em
 * 09/09/2026, direto: **"esse é o correto, troca!"** — perguntado uma vez
 * de propósito, porque contradizia o que estava escrito aqui, e confirmado
 * duas vezes antes da troca. Não reverter de novo achando que é
 * "consertar": o texto de 03/09 é que estava errado sobre qual dos dois
 * números caía na API.
 *
 * ===========================================================================
 * REGISTRO DE 03/09/2026 (histórico — a troca de número que ele descreve
 * abaixo foi desfeita pela correção acima; a Meta/API citada não é mais o
 * número antigo-de-proposito, é o valor que a constante tinha ANTES de
 * 09/09/2026)
 * ===========================================================================
 * Palavras dele em 03/09: "esse novo... ele não é oficial da meta". É um
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
 * TENTADO E REVERTIDO EM 08/09/2026 — um botão flutuante chegou a existir
 * na home (`BotaoWhatsAppHome.tsx`, já apagado) e foi removido no mesmo
 * dia: WhatsApp só pode aparecer para quem JÁ COMPROU, nunca em página
 * pré-compra, porque atrapalha o registro do Purchase do pixel no
 * fechamento da venda. Não recriar um botão de WhatsApp em página pública
 * (home, produto, checkout) sem confirmar de novo com o Francisco.
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
export const WHATSAPP_REVERA = "5512981409901";

/** "(12) 98140-9901" em pt, "+55 12 98140-9901" fora — para ler na tela. */
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
