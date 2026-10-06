import { notFound, redirect } from "next/navigation";
import { CarrinhoPageClient } from "@/app/carrinho/CarrinhoPageClient";
import { isSiteLocale } from "@/lib/i18n/site";

export default async function CarrinhoLocalizado({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSiteLocale(locale) || locale === "pt") notFound();
  // A sacola compartilhada guarda preços BRL. Até existir um resumo
  // internacional precificado no servidor, o piloto americano segue direto
  // para o checkout USD e não expõe totais/descontos do mercado brasileiro.
  if (locale === "en") redirect("/en/checkout");
  return <CarrinhoPageClient locale={locale} />;
}
