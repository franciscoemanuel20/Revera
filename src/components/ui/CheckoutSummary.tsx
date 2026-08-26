import { Price } from "./Price";

export interface CheckoutSummaryProps {
  subtotalCents: number;
  discountCents: number;
  // null = frete ainda não cotado (CEP em branco, ou a transportadora não
  // respondeu) — mostra texto, nunca um valor inventado. Zero está proibido
  // aqui de propósito: "R$ 0,00" no lugar de "ainda não calculado" é uma
  // promessa de frete grátis que ninguém fez. 26/08/2026.
  shippingCents: number | null;
  // Onde este resumo aparece, o frete se resolve de um jeito diferente: no
  // checkout basta preencher o CEP; no carrinho ainda não há endereço.
  shippingHint?: string;
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
  shippingHint = "calculado na próxima etapa",
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
        <dd>{shippingCents == null ? <span className="text-ink/60">{shippingHint}</span> : <Price cents={shippingCents} />}</dd>
      </div>
      {/* aria-live: o total muda quando quantidade/desconto mudam antes do
          envio — quem usa leitor de tela precisa ouvir isso sem navegar até
          aqui de novo. */}
      <div className="flex justify-between border-t border-sand pt-2 text-lg font-semibold text-ink" aria-live="polite">
        <dt>Total</dt>
        <dd>
          <Price cents={totalCents} />
        </dd>
      </div>
    </dl>
  );
}
