"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { Button } from "@/components/ui/Button";
import { QuantitySelector } from "@/components/ui/QuantitySelector";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { medirAdicionarAoCarrinho, medirVerProduto } from "@/lib/tracking/browser";

export interface VarianteInternacional {
  id: string;
  colorId: string | null;
  colorCode: string | null;
  colorName: string | null;
  colorPhotoUrl: string | null;
  stockQty: number;
  priceBrlCents: number;
  priceUsdCents: number;
}

export function ProdutoInternacional({
  name,
  description,
  imageUrl,
  variants,
}: {
  name: string;
  description: string | null;
  imageUrl: string | null;
  variants: VarianteInternacional[];
}) {
  const { adicionarItem, pendente } = useCart();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const viewed = useRef(false);
  const selected = useMemo(
    () => variants.find((variant) => variant.id === selectedId) ?? null,
    [selectedId, variants]
  );

  useEffect(() => {
    if (viewed.current || variants.length === 0) return;
    viewed.current = true;
    const first = variants[0];
    if (!first) return;
    medirVerProduto({
      variantId: first.id,
      nome: name,
      quantidade: 1,
      precoUnitarioCents: first.priceUsdCents,
      currency: "USD",
    });
  }, [name, variants]);

  async function addToCart() {
    setError(null);
    setAdded(false);
    if (!selected) {
      setError("Choose your color before continuing.");
      return;
    }
    const result = await adicionarItem(selected.id, quantity);
    if (result.erro) {
      setError("We could not add this item. Please try again.");
      return;
    }
    medirAdicionarAoCarrinho({
      variantId: selected.id,
      nome: name,
      quantidade: quantity,
      precoUnitarioCents: selected.priceUsdCents,
      currency: "USD",
    });
    setAdded(true);
  }

  return (
    <main
      lang="en-US"
      className="mx-auto w-full max-w-5xl px-6 pb-20"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-sand">
          {imageUrl ? (
            <Image src={imageUrl} alt={name} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          ) : null}
        </div>

        <section className="flex flex-col gap-6">
          <div>
            <span className="eyebrow-ink">Revera hair system</span>
            <h1 className="mt-2 font-display text-4xl text-ink">{name}</h1>
            <p className="mt-3 text-ink/70">
              {description || "A natural-looking hair system, checked by our team before international shipping."}
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-ink">Choose your color</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedId(variant.id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left ${
                    selectedId === variant.id ? "border-gold bg-gold/10" : "border-sand bg-paper"
                  }`}
                >
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-sand">
                    {variant.colorPhotoUrl ? (
                      <Image src={variant.colorPhotoUrl} alt="" fill sizes="40px" className="object-cover" />
                    ) : null}
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {variant.colorCode || variant.colorName || "Standard"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {selected ? (
            <div className="rounded-xl border border-sand p-4">
              <p className="font-display text-3xl font-semibold text-ink">
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(selected.priceUsdCents / 100)}
              </p>
              <p className="mt-1 text-xs text-ink/60">
                Shipping is calculated from your US delivery address at checkout. Import duties and taxes, if charged, are paid by the recipient.
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-4">
            <QuantitySelector value={quantity} onChange={setQuantity} max={selected?.stockQty} />
            <Button size="lg" className="flex-1" disabled={pendente || !selected} onClick={() => void addToCart()}>
              {pendente ? "Adding…" : "Add to cart"}
            </Button>
          </div>

          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          {added ? (
            <p role="status" className="rounded-lg bg-moss px-4 py-3 text-sm text-paper">
              Added to your cart. <Link href="/en/checkout" className="underline">Continue to checkout</Link>
            </p>
          ) : null}

          <ul className="grid gap-2 text-sm text-ink/70">
            <li>✓ Secure international payment</li>
            <li>✓ Tracked DHL shipping from Brazil</li>
            <li>✓ Color and item checked before dispatch</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
