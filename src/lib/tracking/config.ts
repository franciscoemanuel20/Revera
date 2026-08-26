/**
 * Identificadores de rastreamento.
 *
 * ===========================================================================
 * O QUE É SEGREDO AQUI E O QUE NÃO É
 * ===========================================================================
 * ID de pixel NÃO é segredo. Ele aparece no código-fonte de qualquer site que
 * o use — basta abrir "ver fonte". Por isso os IDs vêm de variáveis
 * NEXT_PUBLIC_, que o Next expõe ao navegador de propósito.
 *
 * TOKEN de API é segredo, e mora em variável SEM o prefixo NEXT_PUBLIC_:
 * META_CAPI_TOKEN e GA4_API_SECRET nunca chegam ao navegador. Quem confere
 * isso automaticamente é scripts/verify-no-secrets-in-bundle.mjs, que roda
 * depois do build e falha se um nome desses aparecer no bundle.
 *
 * Confundir os dois é o erro clássico: um token de CAPI no bundle deixa
 * qualquer pessoa forjar conversões na conta de anúncios.
 */

/** Meta (Facebook/Instagram) — ID do pixel. Público. */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

/**
 * Google — a tag do Google (GT-…) ou o ID do GA4 (G-…). Público.
 *
 * Uma tag GT- carrega o GA4 e o Google Ads juntos, que é o formato atual do
 * Google. Um G- puro mede só GA4. Os dois funcionam com o mesmo gtag.js.
 */
export const GOOGLE_TAG_ID = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID ?? "";

/**
 * GA4 para o envio de servidor (Measurement Protocol). Sempre G-…, mesmo
 * quando o navegador usa uma tag GT-. Público.
 */
export const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "";

export const temMeta = () => META_PIXEL_ID.length > 0;
export const temGoogle = () => GOOGLE_TAG_ID.length > 0;

/** Moeda única do projeto. Preços moram em centavos no banco inteiro. */
export const MOEDA = "BRL" as const;

export function centavosParaMoeda(cents: number): number {
  return Math.round(cents) / 100;
}
