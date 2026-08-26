"use client";

import { useCart } from "./CartProvider";

// Botão de sacola do Header — texto, não ícone de bolsa/carrinho genérico:
// a identidade da marca (ver tokens.css) é tipográfica, então "Sacola" lido
// por extenso combina mais com o resto do header do que um emoji ou um SVG
// de e-commerce qualquer. className vem de fora porque o Header usa cores
// diferentes dependendo de estar "flutuante" (sobre hero escuro) ou sólido
// — ver Header.tsx.
export interface CartTriggerButtonProps {
  className?: string;
}

export function CartTriggerButton({ className = "" }: CartTriggerButtonProps) {
  const { cart, abrirDrawer, carregando } = useCart();
  const quantidadeTotal = cart.items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <button
      type="button"
      onClick={abrirDrawer}
      aria-label={quantidadeTotal > 0 ? `Abrir sacola, ${quantidadeTotal} item(ns)` : "Abrir sacola"}
      className={`relative flex min-h-toque min-w-toque items-center gap-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold ${className}`}
    >
      Sacola
      {/* aria-live: quem usa leitor de tela ouve a mudança de contagem sem
          precisar reabrir o botão para descobrir que algo foi adicionado. */}
      <span
        aria-live="polite"
        className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-metal px-1 text-xs font-semibold text-ink transition-opacity ${
          carregando || quantidadeTotal === 0 ? "opacity-0" : "opacity-100"
        }`}
      >
        {quantidadeTotal}
      </span>
    </button>
  );
}
