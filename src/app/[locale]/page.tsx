import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProdutosContent } from "../produtos/ProdutosContent";
import { DEFAULT_SITE_LOCALE, SITE_LOCALES, normalizeSiteLocale, type SiteLocale } from "@/lib/i18n/site";
import { localizedMetadata } from "@/lib/i18n/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return localizedMetadata(await localeDosParams(params) as Exclude<SiteLocale, "pt">, "/");
}

export function generateStaticParams() {
  return SITE_LOCALES.filter((locale) => locale !== DEFAULT_SITE_LOCALE).map((locale) => ({ locale }));
}

async function localeDosParams(params: Promise<{ locale: string }>): Promise<SiteLocale> {
  const { locale } = await params;
  const normalizado = normalizeSiteLocale(locale);
  if (!normalizado || normalizado === DEFAULT_SITE_LOCALE) notFound();
  return normalizado;
}

export default async function LocalizedHomePage({ params }: { params: Promise<{ locale: string }> }) {
  return <ProdutosContent locale={await localeDosParams(params)} />;
}
