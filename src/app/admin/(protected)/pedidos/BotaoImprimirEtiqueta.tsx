"use client";

import { useState } from "react";
import { Toast } from "@/components/ui/Toast";
import { imprimirEtiquetaAction } from "./etiqueta";

/** Sempre busca um PDF novo; não cria nem paga etiqueta. */
export function BotaoImprimirEtiqueta({
  orderId,
  rotulo = "Imprimir etiqueta",
}: {
  orderId: string;
  rotulo?: string;
}) {
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function imprimir() {
    // A aba é aberta no gesto do usuário para não cair no bloqueador de pop-up
    // enquanto a Server Action pede o PDF à transportadora.
    const aba = window.open("", "_blank");
    setErro(null);
    setBuscando(true);
    try {
      const resultado = await imprimirEtiquetaAction({ orderId });
      if ("error" in resultado) {
        aba?.close();
        setErro(resultado.error);
        return;
      }
      if (aba) {
        aba.opener = null;
        aba.location.href = resultado.etiquetaUrl;
      } else {
        window.location.assign(resultado.etiquetaUrl);
      }
    } catch {
      aba?.close();
      setErro("Não foi possível buscar o PDF agora. Tente novamente em instantes.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <>
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      <button
        type="button"
        onClick={imprimir}
        disabled={buscando}
        className="inline-flex min-h-12 flex-1 items-center justify-center rounded-md border border-ink/20 px-4 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
      >
        {buscando ? "Buscando PDF…" : rotulo}
      </button>
    </>
  );
}
