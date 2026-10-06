import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { converterCentavosBrl, obterCotacaoPtax } from "@/lib/internacional/cambio-ptax";
import { ProdutoInternacional, type VarianteInternacional } from "./ProdutoInternacional";
import { normalizeSiteLocale, localizePath, type SiteLocale } from "@/lib/i18n/site";
import { produtoTraduzido } from "@/lib/i18n/produtos";
import type { Moeda } from "@/lib/internacional/moeda";

const MERCADO: Record<Exclude<SiteLocale, "pt">, { moeda: Extract<Moeda, "USD" | "EUR">; moneyLocale: string }> = {
  en: { moeda: "USD", moneyLocale: "en-US" },
  es: { moeda: "EUR", moneyLocale: "es-ES" },
  fr: { moeda: "EUR", moneyLocale: "fr-FR" },
  de: { moeda: "EUR", moneyLocale: "de-DE" },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = normalizeSiteLocale(rawLocale);
  if (!locale || locale === "pt") return {};
  const translated = produtoTraduzido(slug, locale, "Revera hair system");
  const url = localizePath(`/produtos/${slug}`, locale);
  return {
    title: translated.nome,
    description: translated.descricao,
    alternates: { canonical: url, languages: { "pt-BR": `/produtos/${slug}`, "en-US": `/en/produtos/${slug}`, "es-ES": `/es/produtos/${slug}`, "fr-FR": `/fr/produtos/${slug}`, "de-DE": `/de/produtos/${slug}` } },
    openGraph: { title: `${translated.nome} — Reverá`, description: translated.descricao, url },
    twitter: {
      card: "summary_large_image",
      title: `${translated.nome} — Reverá`,
      description: translated.descricao,
      images: ["/media/hero/produto-close-1.jpeg"],
    },
  };
}

export default async function ProdutoLocalizado({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: rawLocale, slug } = await params;
  const locale = normalizeSiteLocale(rawLocale);
  if (!locale || locale === "pt") notFound();
  const mercado = MERCADO[locale];

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, slug, name, description, product_variants(id, color_id, price_cents, stock_qty, is_active), product_media(url, type, is_primary, sort_order)")
    .eq("slug", slug)
    .maybeSingle();
  if (!product) notFound();

  const active = (product.product_variants ?? []).filter(
    (variant) => variant.is_active && Number(variant.price_cents) > 0 && Number(variant.stock_qty) > 0
  );
  const ids = active.map((variant) => variant.id as string);
  const [{ data: prices }, { data: colors }, quote] = await Promise.all([
    supabase.from("variant_prices").select("variant_id").in("variant_id", ids).eq("currency", mercado.moeda).eq("is_active", true).gt("price_cents", 0),
    supabase.from("colors").select("id, code, name, photo_url").in("id", active.map((variant) => variant.color_id).filter(Boolean)),
    obterCotacaoPtax(mercado.moeda).catch(() => null),
  ]);
  if (!quote) notFound();

  const approved = new Set((prices ?? []).map((price) => price.variant_id as string));
  const colorById = new Map((colors ?? []).map((color) => [color.id as string, color]));
  const variants: VarianteInternacional[] = active
    .filter((variant) => approved.has(variant.id as string))
    .map((variant) => {
      const color = variant.color_id ? colorById.get(variant.color_id as string) : null;
      const priceBrlCents = variant.price_cents as number;
      return {
        id: variant.id as string,
        colorId: (variant.color_id as string | null) ?? null,
        colorCode: (color?.code as string | null) ?? null,
        colorName: (color?.name as string | null) ?? null,
        colorPhotoUrl: (color?.photo_url as string | null) ?? null,
        stockQty: variant.stock_qty as number,
        priceBrlCents,
        priceCents: converterCentavosBrl(priceBrlCents, quote.reaisPorUnidade),
      };
    });
  if (variants.length === 0) notFound();

  const image = (product.product_media ?? [])
    .filter((media) => (media.type ?? "image") === "image")
    .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))[0];

  const translated = produtoTraduzido(slug, locale, product.name as string, product.description as string | null);
  return (
    <ProdutoInternacional
      name={translated.nome}
      description={translated.descricao}
      imageUrl={(image?.url as string | undefined) ?? null}
      variants={variants}
      locale={locale}
      currency={mercado.moeda}
      moneyLocale={mercado.moneyLocale}
    />
  );
}
