import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FaqPage from "@/app/faq/page";
import { normalizeSiteLocale, type SiteLocale } from "@/lib/i18n/site";
import { localizedMetadata } from "@/lib/i18n/seo";

async function localeOf(params: Promise<{locale:string}>) { const locale=normalizeSiteLocale((await params).locale); if(!locale||locale==="pt") notFound(); return locale as Exclude<SiteLocale,"pt">; }
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{return localizedMetadata(await localeOf(params),"/faq");}
export default async function Page({params}:{params:Promise<{locale:string}>}){return FaqPage(undefined, await localeOf(params));}
