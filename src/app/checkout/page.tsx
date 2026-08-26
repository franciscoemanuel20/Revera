import type { Metadata } from "next";
import { CheckoutForm } from "./CheckoutForm";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";

export const metadata: Metadata = {
  title: "Checkout — Reverá",
};

// Só a casca da página (metadata + layout) — o formulário em si
// (CheckoutForm) é client, porque precisa do estado do carrinho
// (useCart(), o mesmo do Header/drawer) e da consulta de CEP em tempo
// real. Ver docstring de src/app/checkout/actions.ts para onde este fluxo
// para (criação do pedido, sem pagamento nenhum).
export default function CheckoutPage() {
  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <div className="flex flex-col gap-2">
        <span className="eyebrow-ink">Quase lá</span>
        <h1 className="font-display text-3xl text-ink">Finalizar pedido</h1>
      </div>
      <CheckoutForm />
    </main>
  );
}
