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
      className="group flex flex-col gap-3 rounded-lg border border-sand p-3 transition-shadow duration-300 hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-sand">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt || name}
            fill
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : null}
        {isFeatured ? (
          <span className="absolute left-2 top-2 rounded-full bg-gold-metal px-2 py-1 text-xs font-semibold text-ink">
            Destaque
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        {textureLabel ? <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/60">{textureLabel}</span> : null}
        <h3 className="font-display text-base text-ink">{name}</h3>
        {summary ? <p className="text-sm leading-5 text-ink/70">{summary}</p> : null}
      </div>
      {priceCents != null ? (
        <Price cents={priceCents} compareAtCents={compareAtCents} />
      ) : (
        <span className="text-sm text-ink/60">Em breve</span>
      )}
    </Link>
  );
}
