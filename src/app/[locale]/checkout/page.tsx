import { notFound } from "next/navigation";
import { checkoutDoPais } from "@/app/checkout/page";

/**
 * Primeiro mercado publicavel: Estados Unidos. Manter o pais forçado na rota
 * evita depender de geolocalizacao/cookie quando o clique vem do anuncio.
 */
export default async function CheckoutLocalizado({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "en") notFound();
  return checkoutDoPais("US");
}
