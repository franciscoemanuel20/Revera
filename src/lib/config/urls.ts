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
 */
export function baseUrl(): string {
  const explicita = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicita) return explicita.replace(/\/$/, "");

  const producao = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (producao) return `https://${producao}`;

  const deploy = process.env.VERCEL_URL;
  if (deploy) return `https://${deploy}`;

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
  return `http://localhost:${porta}`;
}
