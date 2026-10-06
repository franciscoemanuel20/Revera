"use client";

import { useCart } from "./CartProvider";
import { usePathname } from "next/navigation";
import { localeFromPath, type SiteLocale } from "@/lib/i18n/site";

const COPY: Record<SiteLocale, { label: string; abrir: string; itens: string }> = {
  pt: { label: "Sacola", abrir: "Abrir sacola", itens: "item(ns)" },
  en: { label: "Bag", abrir: "Open bag", itens: "item(s)" },
  es: { label: "Bolsa", abrir: "Abrir bolsa", itens: "artículo(s)" },
  fr: { label: "Panier", abrir: "Ouvrir le panier", itens: "article(s)" },
  de: { label: "Warenkorb", abrir: "Warenkorb öffnen", itens: "Artikel" },
};

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
  const locale = localeFromPath(usePathname()) ?? "pt";
  const copy = COPY[locale];
  const { cart, abrirDrawer, carregando } = useCart();
  const quantidadeTotal = cart.items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <button
      type="button"
      onClick={abrirDrawer}
      aria-label={quantidadeTotal > 0 ? `${copy.abrir}, ${quantidadeTotal} ${copy.itens}` : copy.abrir}
      className={`relative flex min-h-toque min-w-toque items-center gap-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold ${className}`}
    >
      {copy.label}
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
