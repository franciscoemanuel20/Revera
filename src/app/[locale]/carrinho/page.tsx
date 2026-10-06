import { notFound } from "next/navigation";
import { CarrinhoPageClient } from "@/app/carrinho/CarrinhoPageClient";
import { isSiteLocale } from "@/lib/i18n/site";

export default async function CarrinhoLocalizado({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSiteLocale(locale) || locale === "pt") notFound();
  return <CarrinhoPageClient locale={locale} />;
}
