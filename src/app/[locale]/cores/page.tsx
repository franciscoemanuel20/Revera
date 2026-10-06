import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CoresPage from "@/app/cores/page";
import { normalizeSiteLocale, type SiteLocale } from "@/lib/i18n/site";
import { localizedMetadata } from "@/lib/i18n/seo";

async function localeOf(params: Promise<{locale:string}>) { const locale=normalizeSiteLocale((await params).locale); if(!locale||locale==="pt") notFound(); return locale as Exclude<SiteLocale,"pt">; }
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{return localizedMetadata(await localeOf(params),"/cores");}
export default async function Page({params}:{params:Promise<{locale:string}>}){return CoresPage(undefined, await localeOf(params));}
