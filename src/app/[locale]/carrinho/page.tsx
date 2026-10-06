import { notFound, redirect } from "next/navigation";
import { isSiteLocale } from "@/lib/i18n/site";

export default async function CarrinhoLocalizado({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSiteLocale(locale) || locale === "pt") notFound();
  // A sacola compartilhada guarda preços BRL. O comprador internacional vai
  // direto ao resumo precificado no servidor, sem ver desconto/moeda do Brasil.
  redirect(`/${locale}/checkout`);
}
