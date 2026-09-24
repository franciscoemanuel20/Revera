"use client";

import { useState } from "react";

export function CopiarNumeroPedido({ numeroPedido }: { numeroPedido: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(numeroPedido);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="inline-flex min-h-toque items-center justify-center rounded-xl border border-ink/20 bg-white/60 px-5 py-3 font-semibold text-ink shadow-[inset_0_1px_0_rgb(255_255_255_/_0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-deep hover:bg-paper hover:shadow-soft"
    >
      {copiado ? "Numero copiado" : "Copiar numero do pedido"}
    </button>
  );
}
