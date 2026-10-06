import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CuidadosPage from "../../cuidados/page";
import { DEFAULT_SITE_LOCALE, SITE_COPY, SITE_LOCALES, localizePath, normalizeSiteLocale } from "@/lib/i18n/site";

export const revalidate = 3600;
export function generateStaticParams() {
  return SITE_LOCALES.filter((locale) => locale !== DEFAULT_SITE_LOCALE).map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normalizeSiteLocale((await params).locale) ?? "pt";
  const path = "/cuidados";
  const title = SITE_COPY[locale].nav[path];
  const description = SITE_COPY[locale].seoSuffix.description;
  const url = localizePath(path, locale);
  return { title, description, alternates: { canonical: url }, openGraph: { title: `${title} — Revera`, description, url } };
}

export default async function CuidadosLocalizado({ params }: { params: Promise<{ locale: string }> }) {
  const locale = normalizeSiteLocale((await params).locale);
  if (!locale || locale === "pt") notFound();
  return CuidadosPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }, locale);
}
