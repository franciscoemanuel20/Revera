import "server-only";

/**
 * URL base pública do site, para montar links que saem daqui (webhook e
 * redirect do gateway). Precisa ser ABSOLUTA: o gateway está fora, não
 * resolve caminho relativo.
 *
 * Ordem de precedência:
 *   1. NEXT_PUBLIC_SITE_URL — definida à mão, ganha de tudo. É a que vale
 *      em produção, porque é o domínio da marca.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — o domínio de produção do projeto,
 *      injetado pela Vercel. Estável entre deploys.
 *   3. VERCEL_URL — a URL única DAQUELE deploy. Serve para preview.
 *   4. localhost na porta REAL do servidor — desenvolvimento. A porta sai de
 *      `PORT` quando o Next a exporta, e cai em 3001 (não 3000: a 3000 é do
 *      projeto irmão nesta máquina, ver scripts/dev.sh).
 *
 * Por que não usar VERCEL_URL em produção: ela muda a cada deploy. Um
 * webhook registrado com ela morre no deploy seguinte — e o pagamento
 * deixaria de se confirmar sozinho, calado.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO HIGIENIZA O VALOR (29/08/2026) — bug que parou a loja
 * ===========================================================================
 * A loja passou dias sem conseguir cobrar ninguém por causa de UM caractere.
 * `NEXT_PUBLIC_SITE_URL` na Vercel estava gravada como "\thttps://www.
 * reveraprotesecapilar.com" — com um TAB colado antes do "h", quase certamente
 * de um copiar-e-colar. O valor "parecia" certo em toda tela onde aparecia.
 *
 * O estrago:
 *   - a InfinitePay recusou a criação do link com 422 "Invalid checkout link
 *     params / redirect_url must be a valid HTTP(S) URL with a host", e o
 *     cliente via "Não conseguimos abrir o pagamento" depois de o pedido já
 *     ter sido criado;
 *   - o `webhook_url` saía com o mesmo defeito, então mesmo um pagamento que
 *     tivesse acontecido não se confirmaria sozinho;
 *   - o robots.txt saía com "Host: \thttps://..." e o sitemap com um TAB
 *     dentro de cada <loc>.
 *
 * Lição: espaço em branco em variável de ambiente é invisível para quem
 * configura e fatal para quem valida do outro lado. Este módulo é o único
 * lugar do sistema que decide a URL base, então é aqui que se limpa e se
 * valida — não em cada chamador.
 *
 * Regra adotada:
 *   - todo candidato é `trim()`ado antes de qualquer coisa;
 *   - todo candidato precisa passar por `new URL()` E ter protocolo http/https
 *     E ter host; se não passar, é DESCARTADO com um erro no log e a busca
 *     continua no próximo candidato — uma loja que vende pelo domínio da
 *     Vercel é melhor que uma loja que não vende;
 *   - se nenhum candidato servir, lança. Devolver string inválida daqui é o
 *     que criou o problema original.
 */

function urlValida(bruto: string | undefined, origem: string): string | null {
  const limpo = bruto?.trim();
  if (!limpo) return null;

  let parsed: URL;
  try {
    parsed = new URL(limpo);
  } catch {
    console.error(
      `[urls] ${origem} não é uma URL absoluta válida e foi descartada: ${JSON.stringify(bruto)}`
    );
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    console.error(
      `[urls] ${origem} tem protocolo "${parsed.protocol}" — só http/https servem. Descartada.`
    );
    return null;
  }

  if (!parsed.host) {
    console.error(`[urls] ${origem} não tem host. Descartada.`);
    return null;
  }

  // Sem barra final: quem chama concatena "/pedido/..." logo depois.
  return limpo.replace(/\/+$/, "");
}

export function baseUrl(): string {
  const explicita = urlValida(process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL");
  if (explicita) return explicita;

  const producao = urlValida(
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : undefined,
    "VERCEL_PROJECT_PRODUCTION_URL"
  );
  if (producao) return producao;

  const deploy = urlValida(
    process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : undefined,
    "VERCEL_URL"
  );
  if (deploy) return deploy;

  /**
   * A porta era 3001 FIXA aqui, e isso quebrou uma prova real em 28/08/2026:
   * o servidor de staging subiu em 3002 (para não brigar com o 3001), a
   * Stripe recebeu `http://localhost:3001/pedido/...` como URL de retorno, e
   * o cliente foi devolvido para uma porta morta. O pagamento tinha sido
   * aprovado e o pedido ficou `pending`, porque nenhuma das duas portas de
   * confirmação fechou — o webhook também não alcança localhost.
   *
   * Fora de desenvolvimento isto não muda nada: NEXT_PUBLIC_SITE_URL ou as
   * variáveis da Vercel respondem antes de chegar aqui.
   */
  const porta = (process.env.PORT ?? "").trim() || "3001";
  const local = urlValida(`http://localhost:${porta}`, "localhost");
  if (local) return local;

  throw new Error(
    "Nenhuma URL base válida: NEXT_PUBLIC_SITE_URL, VERCEL_PROJECT_PRODUCTION_URL " +
      "e VERCEL_URL foram todas rejeitadas. Sem URL absoluta válida o gateway " +
      "recusa o redirect e o webhook nunca chega."
  );
}
