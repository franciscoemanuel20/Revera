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
 *   4. localhost:3001 — desenvolvimento (3001, não 3000: a 3000 é do
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

  return "http://localhost:3001";
}
