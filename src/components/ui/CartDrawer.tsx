"use client";
import { Price } from "./Price";
import { QuantitySelector } from "./QuantitySelector";
import { Button } from "./Button";

export interface CartDrawerItem {
  id: string;
  name: string;
  variantLabel?: string | null;
  imageUrl?: string | null;
  quantity: number;
  unitPriceCents: number;
}

export interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  items: CartDrawerItem[];
  subtotalCents: number;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onCheckout: () => void;
}

// Painel lateral do carrinho — espelha `cart_items` (id = cart_items.id,
// não variant_id, para suportar remover uma linha específica). Sem lógica
// de estoque nem de desconto por quantidade aqui: subtotalCents já vem
// calculado (ver src/lib/pricing/discount.ts) de quem monta o carrinho.
export function CartDrawer({
  open,
  onClose,
  items,
  subtotalCents,
  onQuantityChange,
  onRemove,
  onCheckout,
}: CartDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-md flex-col gap-4 bg-paper p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Sua sacola</h2>
          <button type="button" onClick={onClose} aria-label="Fechar carrinho" className="min-h-toque min-w-toque">
            ✕
          </button>
        </div>

        <ul className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {items.length === 0 ? (
            <li className="text-ink/60">Sua sacola está vazia.</li>
          ) : (
            items.map((item) => (
              <li key={item.id} className="flex gap-3">
                <div className="flex-1">
                  <p className="font-medium text-ink">{item.name}</p>
                  {item.variantLabel ? <p className="text-sm text-ink/60">{item.variantLabel}</p> : null}
                  <div className="mt-2 flex items-center gap-4">
                    <QuantitySelector
                      value={item.quantity}
                      onChange={(next) => onQuantityChange(item.id, next)}
                    />
                    <button type="button" onClick={() => onRemove(item.id)} className="text-sm text-ink/60 underline">
                      remover
                    </button>
                  </div>
                </div>
                <Price cents={item.unitPriceCents * item.quantity} />
              </li>
            ))
          )}
        </ul>

        <div className="flex flex-col gap-3 border-t border-sand pt-4">
          <div className="flex justify-between font-semibold text-ink">
            <span>Subtotal</span>
            <Price cents={subtotalCents} />
          </div>
          <Button onClick={onCheckout} disabled={items.length === 0}>
            Finalizar compra
          </Button>
        </div>
      </div>
    </div>
  );
}
