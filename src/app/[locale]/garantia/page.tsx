import { notFound } from "next/navigation";
import { GarantiaContent, metadata } from "../../garantia/GarantiaContent";
import { DEFAULT_SITE_LOCALE, SITE_LOCALES, normalizeSiteLocale, type SiteLocale } from "@/lib/i18n/site";

export { metadata };

export const revalidate = 3600;

export function generateStaticParams() {
  return SITE_LOCALES.filter((locale) => locale !== DEFAULT_SITE_LOCALE).map((locale) => ({ locale }));
}

async function localeDosParams(params: Promise<{ locale: string }>): Promise<SiteLocale> {
  const { locale } = await params;
  const normalizado = normalizeSiteLocale(locale);
  if (!normalizado || normalizado === DEFAULT_SITE_LOCALE) notFound();
  return normalizado;
}

export default async function LocalizedGarantiaPage({ params }: { params: Promise<{ locale: string }> }) {
  return <GarantiaContent locale={await localeDosParams(params)} />;
}
