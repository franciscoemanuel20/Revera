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

// Página completa do carrinho — o drawer (CartDrawer, no Header) é o
// resumo rápido; esta página é a revisão de verdade antes do checkout,
// com o que o escopo pediu: foto da cor, quantidade editável, degraus de
// desconto por item e o resumo com subtotal/desconto/frete/total. Cliente
// puro (useCart) porque o estado já vive no CartProvider do layout raiz —
// ver comentário em page.tsx sobre não duplicar a leitura.
export function CarrinhoPageClient() {
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
        <span className="eyebrow-ink">Sua sacola</span>
        <h1 className="font-display text-3xl text-ink">Carrinho</h1>
      </div>

      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      {carregando ? (
        <p className="text-ink/60">Carregando sua sacola…</p>
      ) : cart.items.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-lg border border-sand p-8">
          <p className="text-ink/70">Sua sacola está vazia.</p>
          <Link href="/">
            <Button variant="secondary">Ver produtos</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[1fr_320px] lg:items-start">
          <ul className="flex flex-col gap-6">
            {cart.items.map((item) => (
              <li key={item.cartItemId} className="flex flex-col gap-4 border-b border-sand pb-6 last:border-b-0">
                <div className="flex gap-4">
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

                  <div className="flex flex-1 flex-col gap-1">
                    <p className="font-medium text-ink">{item.productName}</p>
                    {item.variantLabel ? <p className="text-sm text-ink/60">{item.variantLabel}</p> : null}
                    <p className="text-sm text-ink/60">{formatarBRL(item.unitPriceCents)} / unidade</p>

                    <div className="mt-2 flex items-center gap-4">
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
                        remover
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <Price cents={item.subtotalCents} />
                    {item.discountCents > 0 ? (
                      <p className="mt-1 text-xs font-semibold text-gold-deep">
                        Economizou {formatarBRL(item.discountCents)}
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
                <dt>Subtotal</dt>
                <dd>
                  <Price cents={cart.subtotalSemDescontoCents} />
                </dd>
              </div>
              {cart.discountCents > 0 ? (
                <div className="flex justify-between text-gold-deep">
                  <dt>Desconto por quantidade</dt>
                  <dd>−{formatarBRL(cart.discountCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-ink/80">
                <dt>Frete</dt>
                <dd className="text-ink/60">calculado na próxima etapa</dd>
              </div>
              {/* aria-live: o total muda a cada alteração de quantidade —
                  quem usa leitor de tela precisa ouvir isso sem navegar até
                  aqui de novo. */}
              <div
                className="flex justify-between border-t border-sand pt-2 text-lg font-semibold text-ink"
                aria-live="polite"
              >
                <dt>Total</dt>
                <dd>
                  <Price cents={cart.totalCents} />
                </dd>
              </div>
            </dl>

            <Link href="/checkout">
              <Button size="lg" className="w-full">
                Ir para o checkout
              </Button>
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
