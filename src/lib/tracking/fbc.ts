/**
 * A Meta aceita o identificador de clique em dois formatos:
 *
 * - `fbclid` na URL do anúncio;
 * - `_fbc` no cookie, com o formato `fb.1.<timestamp_ms>.<fbclid>`.
 *
 * Se o pixel ainda não carregou quando a pessoa chega, ou se o cookie não
 * estava disponível no checkout, ainda podemos mandar um `_fbc` válido pela
 * Conversions API usando o `fbclid` que já salvamos no pedido.
 */
export function fbcAPartirDeFbclid(
  fbclid: string | null | undefined,
  criadoEm: string | Date | null | undefined
): string | null {
  const clique = fbclid?.trim();
  if (!clique) return null;

  const data =
    criadoEm instanceof Date
      ? criadoEm
      : typeof criadoEm === "string"
        ? new Date(criadoEm)
        : null;

  const timestamp = data?.getTime();
  if (!timestamp || Number.isNaN(timestamp)) return null;

  return `fb.1.${timestamp}.${clique}`;
}
