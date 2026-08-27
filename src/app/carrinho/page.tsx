import type { Metadata } from "next";
import { CarrinhoPageClient } from "./CarrinhoPageClient";

// Server Component só pela metadata — o conteúdo em si é 100% client
// (CarrinhoPageClient usa useCart(), o mesmo estado do drawer e do Header,
// ver src/components/cart/CartProvider.tsx). Não há leitura própria de
// Supabase aqui: duplicar a leitura entre server e client só para o
// primeiro render criaria duas fontes de verdade momentâneas (a do SSR e a
// do Provider, que sempre recarrega no mount) — melhor uma só.
export const metadata: Metadata = {
  title: "Sua sacola",
};

export default function CarrinhoPage() {
  return <CarrinhoPageClient />;
}
