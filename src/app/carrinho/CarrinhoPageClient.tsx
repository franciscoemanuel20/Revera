"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { Button } from "@/components/ui/Button";
import { DiscountLadder } from "@/components/ui/DiscountLadder";
import { Price } from "@/components/ui/Price";
import { QuantitySelector } from "@/components/ui/QuantitySelector";
import { Toast } from "@/components/ui/Toast";
import { formatarBRL } from "@/lib/format/money";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { localizePath, type SiteLocale } from "@/lib/i18n/site";

const COPY: Record<SiteLocale, { eyebrow: string; titulo: string; carregando: string; vazio: string; produtos: string; unidade: string; remover: string; economizou: string; subtotal: string; desconto: string; frete: string; freteInfo: string; total: string; checkout: string }> = {
  pt: { eyebrow: "Sua sacola", titulo: "Carrinho", carregando: "Carregando sua sacola…", vazio: "Sua sacola está vazia.", produtos: "Ver produtos", unidade: "unidade", remover: "remover", economizou: "Economizou", subtotal: "Subtotal", desconto: "Desconto por quantidade", frete: "Frete", freteInfo: "calculado na próxima etapa", total: "Total", checkout: "Ir para o checkout" },
  en: { eyebrow: "Your bag", titulo: "Cart", carregando: "Loading your bag…", vazio: "Your bag is empty.", produtos: "View products", unidade: "unit", remover: "remove", economizou: "You saved", subtotal: "Subtotal", desconto: "Quantity discount", frete: "Shipping", freteInfo: "calculated at the next step", total: "Total", checkout: "Continue to checkout" },
  es: { eyebrow: "Tu bolsa", titulo: "Carrito", carregando: "Cargando tu bolsa…", vazio: "Tu bolsa está vacía.", produtos: "Ver productos", unidade: "unidad", remover: "eliminar", economizou: "Has ahorrado", subtotal: "Subtotal", desconto: "Descuento por cantidad", frete: "Envío", freteInfo: "calculado en el siguiente paso", total: "Total", checkout: "Ir al checkout" },
  fr: { eyebrow: "Votre panier", titulo: "Panier", carregando: "Chargement de votre panier…", vazio: "Votre panier est vide.", produtos: "Voir les produits", unidade: "unité", remover: "supprimer", economizou: "Vous économisez", subtotal: "Sous-total", desconto: "Remise sur quantité", frete: "Livraison", freteInfo: "calculée à l’étape suivante", total: "Total", checkout: "Continuer vers le paiement" },
  de: { eyebrow: "Ihr Warenkorb", titulo: "Warenkorb", carregando: "Warenkorb wird geladen…", vazio: "Ihr Warenkorb ist leer.", produtos: "Produkte ansehen", unidade: "Stück", remover: "entfernen", economizou: "Sie sparen", subtotal: "Zwischensumme", desconto: "Mengenrabatt", frete: "Versand", freteInfo: "wird im nächsten Schritt berechnet", total: "Gesamt", checkout: "Weiter zur Kasse" },
};

// Página completa do carrinho — o drawer (CartDrawer, no Header) é o
// resumo rápido; esta página é a revisão de verdade antes do checkout,
// com o que o escopo pediu: foto da cor, quantidade editável, degraus de
// desconto por item e o resumo com subtotal/desconto/frete/total. Cliente
// puro (useCart) porque o estado já vive no CartProvider do layout raiz —
// ver comentário em page.tsx sobre não duplicar a leitura.
export function CarrinhoPageClient({ locale = "pt" }: { locale?: SiteLocale }) {
  const copy = COPY[locale];
  const { cart, carregando, pendente, alterarQuantidade, removerItem } = useCart();
  const [erro, setErro] = useState<string | null>(null);

  async function handleAlterarQuantidade(cartItemId: string, quantidade: number) {
    const resultado = await alterarQuantidade(cartItemId, quantidade);
    if (resultado.erro) setErro(resultado.erro);
  }

  async function handleRemover(cartItemId: string) {
    const resultado = await removerItem(cartItemId);
    if (resultado.erro) setErro(resultado.erro);
  }

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <div className="flex flex-col gap-2">
        <span className="eyebrow-ink">{copy.eyebrow}</span>
        <h1 className="font-display text-3xl text-ink">{copy.titulo}</h1>
      </div>

      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      {carregando ? (
        <p className="text-ink/60">{copy.carregando}</p>
      ) : cart.items.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-lg border border-sand p-8">
          <p className="text-ink/70">{copy.vazio}</p>
          <Link href={localizePath("/produtos", locale)}>
            <Button variant="secondary">{copy.produtos}</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[1fr_320px] lg:items-start">
          <ul className="flex flex-col gap-6">
            {cart.items.map((item) => (
              <li key={item.cartItemId} className="flex flex-col gap-4 border-b border-sand pb-6 last:border-b-0">
                {/* `flex-wrap` + `min-w-0` (30/09/2026): em 375 px a linha
                    foto + seletor de quantidade + "remover" + preço não cabia
                    e, como item de flex não encolhe abaixo do conteúdo, a
                    página inteira ficava mais larga que a tela e o preço
                    saía cortado. Agora o preço desce para a linha de baixo
                    (alinhado à direita por `ml-auto`) quando não cabe; no
                    desktop nada muda. Mesma correção no CartDrawer. */}
                <div className="flex flex-wrap gap-4">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-sand">
                    {item.colorPhotoUrl ? (
                      <Image
                        src={item.colorPhotoUrl}
                        alt={item.variantLabel ?? item.productName}
                        fill
                        className="object-cover"
                      />
                    ) : null}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="font-medium text-ink">{item.productName}</p>
                    {item.variantLabel ? <p className="text-sm text-ink/60">{item.variantLabel}</p> : null}
                    <p className="text-sm text-ink/60">{formatarBRL(item.unitPriceCents)} / {copy.unidade}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <QuantitySelector
                        value={item.quantity}
                        max={item.stockQty}
                        onChange={(next) => void handleAlterarQuantidade(item.cartItemId, next)}
                      />
                      <button
                        type="button"
                        onClick={() => void handleRemover(item.cartItemId)}
                        disabled={pendente}
                        className="min-h-toque text-sm text-ink/60 underline disabled:opacity-50"
                      >
                        {copy.remover}
                      </button>
                    </div>
                  </div>

                  <div className="ml-auto text-right">
                    <Price cents={item.subtotalCents} />
                    {item.discountCents > 0 ? (
                      <p className="mt-1 text-xs font-semibold text-gold-deep">
                        {copy.economizou} {formatarBRL(item.discountCents)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <DiscountLadder
                  basePriceCents={item.basePriceCents}
                  currentQuantity={item.quantity}
                  rules={item.discountRules}
                />
              </li>
            ))}
          </ul>

          <aside className="flex flex-col gap-4 rounded-lg border border-sand p-6">
            <dl className="flex flex-col gap-2">
              <div className="flex justify-between text-ink/80">
                <dt>{copy.subtotal}</dt>
                <dd>
                  <Price cents={cart.subtotalSemDescontoCents} />
                </dd>
              </div>
              {cart.discountCents > 0 ? (
                <div className="flex justify-between text-gold-deep">
                  <dt>{copy.desconto}</dt>
                  <dd>−{formatarBRL(cart.discountCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-ink/80">
                <dt>{copy.frete}</dt>
                <dd className="text-ink/60">{copy.freteInfo}</dd>
              </div>
              {/* aria-live: o total muda a cada alteração de quantidade —
                  quem usa leitor de tela precisa ouvir isso sem navegar até
                  aqui de novo. */}
              <div
                className="flex justify-between border-t border-sand pt-2 text-lg font-semibold text-ink"
                aria-live="polite"
              >
                <dt>{copy.total}</dt>
                <dd>
                  <Price cents={cart.totalCents} />
                </dd>
              </div>
            </dl>

            <Link href="/checkout">
              <Button size="lg" className="w-full">
                {copy.checkout}
              </Button>
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
