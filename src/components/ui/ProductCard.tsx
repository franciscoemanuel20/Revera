import Image from "next/image";
import Link from "next/link";
import { Price } from "./Price";

export interface ProductCardProps {
  slug: string;
  name: string;
  imageUrl?: string | null;
  priceCents?: number | null;
  compareAtCents?: number | null;
  isFeatured?: boolean;
}

// Card de vitrine — priceCents/imageUrl são opcionais porque o produto seed
// (micropele-008) ainda não tem preço nem foto real (ver seeds/products.json,
// seeds/colors.json). Sem preço, mostra "Em breve" em vez de R$ NaN.
export function ProductCard({
  slug,
  name,
  imageUrl,
  priceCents,
  compareAtCents,
  isFeatured,
}: ProductCardProps) {
  return (
    <Link
      href={`/produtos/${slug}`}
      className="group flex flex-col gap-3 rounded-lg border border-sand p-3 transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-sand">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : null}
        {isFeatured ? (
          <span className="absolute left-2 top-2 rounded-full bg-copper px-2 py-1 text-xs font-semibold text-paper">
            Destaque
          </span>
        ) : null}
      </div>
      <h3 className="font-display text-base text-ink">{name}</h3>
      {priceCents != null ? (
        <Price cents={priceCents} compareAtCents={compareAtCents} />
      ) : (
        <span className="text-sm text-ink/60">Em breve</span>
      )}
    </Link>
  );
}
