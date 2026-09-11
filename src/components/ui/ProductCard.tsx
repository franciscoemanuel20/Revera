import Image from "next/image";
import Link from "next/link";
import { Price } from "./Price";

export interface ProductCardProps {
  slug: string;
  name: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  priceCents?: number | null;
  compareAtCents?: number | null;
  isFeatured?: boolean;
  summary?: string | null;
  textureLabel?: string | null;
}

// Card de vitrine — priceCents/imageUrl são opcionais porque o produto seed
// (micropele-008) ainda não tem preço nem foto real (ver seeds/products.json,
// seeds/colors.json). Sem preço, mostra "Em breve" em vez de R$ NaN.
export function ProductCard({
  slug,
  name,
  imageUrl,
  imageAlt,
  priceCents,
  compareAtCents,
  isFeatured,
  summary,
  textureLabel,
}: ProductCardProps) {
  return (
    <Link
      href={`/produtos/${slug}`}
      className="group flex flex-col gap-4 rounded-2xl border border-sand/90 bg-paper p-3.5 shadow-[0_1px_0_rgb(255_255_255_/_0.8)] transition-all duration-300 hover:-translate-y-1 hover:border-gold/70 hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-sand">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt || name}
            fill
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : null}
        {isFeatured ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-gold-metal px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
            Destaque
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5 px-0.5">
        {textureLabel ? <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/60">{textureLabel}</span> : null}
        <h3 className="font-display text-base text-ink">{name}</h3>
        {summary ? <p className="text-sm leading-5 text-ink/70">{summary}</p> : null}
      </div>
      {priceCents != null ? (
        <div className="mt-auto flex items-center justify-between border-t border-sand/70 px-0.5 pt-3">
          <Price cents={priceCents} compareAtCents={compareAtCents} />
          <span aria-hidden="true" className="text-lg text-gold-deep transition-transform duration-300 group-hover:translate-x-0.5">→</span>
        </div>
      ) : (
        <span className="text-sm text-ink/60">Em breve</span>
      )}
    </Link>
  );
}
