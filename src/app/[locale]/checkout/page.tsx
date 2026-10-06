import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { checkoutDoPais } from "@/app/checkout/checkout-do-pais";
import { GEO_COUNTRY_COOKIE, GEO_COUNTRY_HEADER, normalizeSiteLocale } from "@/lib/i18n/site";

/**
 * O idioma da rota identifica o mercado inicial testado. Manter o país
 * forçado evita depender de cookie/geolocalização quando o clique vem de anúncio.
 */
export default async function CheckoutLocalizado({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = normalizeSiteLocale((await params).locale);
  if (!locale || locale === "pt") notFound();
  const fallback = { en: "US", es: "ES", fr: "FR", de: "DE" }[locale];
  const detected = (
    (await headers()).get(GEO_COUNTRY_HEADER) ??
    (await headers()).get("x-vercel-ip-country") ??
    (await cookies()).get(GEO_COUNTRY_COOKIE)?.value
  )?.trim().toUpperCase();
  // Só os quatro mercados internacionais testados são inferidos. Um idioma
  // compartilhado nunca transforma outro país em mercado aberto.
  const pais = detected === fallback ? detected : fallback;
  return checkoutDoPais(pais);
}
