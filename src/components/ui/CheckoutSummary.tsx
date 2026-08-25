import { Price } from "./Price";

export interface CheckoutSummaryProps {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
}

// Espelha exatamente orders.subtotal_cents / discount_cents /
// shipping_cents / total_cents — só exibe, não soma nada sozinho. A soma é
// responsabilidade do backend (evita a UI "corrigir" um total que veio
// errado do servidor e esconder um bug de verdade).
export function CheckoutSummary({
  subtotalCents,
  discountCents,
  shippingCents,
  totalCents,
}: CheckoutSummaryProps) {
  return (
    <dl className="flex flex-col gap-2 rounded-lg border border-sand p-4">
      <div className="flex justify-between text-ink/80">
        <dt>Subtotal</dt>
        <dd>
          <Price cents={subtotalCents} />
        </dd>
      </div>
      {discountCents > 0 ? (
        <div className="flex justify-between text-moss">
          <dt>Desconto</dt>
          <dd>−<Price cents={discountCents} /></dd>
        </div>
      ) : null}
      <div className="flex justify-between text-ink/80">
        <dt>Frete</dt>
        <dd>
          <Price cents={shippingCents} />
        </dd>
      </div>
      <div className="flex justify-between border-t border-sand pt-2 text-lg font-semibold text-ink">
        <dt>Total</dt>
        <dd>
          <Price cents={totalCents} />
        </dd>
      </div>
    </dl>
  );
}
