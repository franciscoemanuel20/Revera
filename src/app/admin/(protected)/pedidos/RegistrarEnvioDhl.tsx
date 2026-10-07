"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { registrarEnvioDhlAction } from "./envio-dhl";

/**
 * Registrar a guia DHL de um pedido internacional.
 *
 * A etiqueta é feita no MyDHL+; aqui só entra o número dela. Salvar grava o
 * envio no pedido e manda o rastreio ao PayPal quando a venda foi paga por ele.
 * Com a guia já registrada, o botão serve para reenviar ao PayPal (a mesma
 * guia não é gravada duas vezes).
 */
export function RegistrarEnvioDhl({
  orderId,
  guiaRegistrada,
}: {
  orderId: string;
  guiaRegistrada: string | null;
}) {
  const router = useRouter();
  const [awb, setAwb] = useState(guiaRegistrada ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; tipo: "success" | "error" } | null>(null);

  async function salvar() {
    setAviso(null);
    setOcupado(true);
    const r = await registrarEnvioDhlAction({ orderId, awb });
    setOcupado(false);
    if ("error" in r) {
      setAviso({ texto: r.error, tipo: "error" });
      return;
    }
    if (r.paypal === "enviado") {
      setAviso({ texto: "Guia registrada e rastreio enviado ao PayPal.", tipo: "success" });
    } else if (r.paypal === "sem_paypal") {
      setAviso({ texto: "Guia registrada. Este pedido não foi pago pelo PayPal.", tipo: "success" });
    } else {
      setAviso({
        texto: `Guia registrada, mas o rastreio não chegou ao PayPal: ${r.paypal.falhou} Clique de novo para reenviar.`,
        tipo: "error",
      });
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-sand bg-sand/40 p-3 text-sm text-ink/70">
      <p className="font-medium text-ink">Envio internacional — DHL</p>
      <p>
        Gere a etiqueta no MyDHL+ e cole aqui o número da guia (10 dígitos). O rastreio vai
        para o PayPal automaticamente.
      </p>
      {aviso ? <Toast message={aviso.texto} variant={aviso.tipo} onClose={() => setAviso(null)} /> : null}
      <label className="flex flex-col gap-1 text-sm text-ink">
        Número da guia DHL
        <input
          type="text"
          inputMode="numeric"
          value={awb}
          onChange={(e) => setAwb(e.target.value)}
          disabled={Boolean(guiaRegistrada) || ocupado}
          placeholder="1234567890"
          className="min-h-12 rounded-md border border-sand bg-white px-3 text-ink"
        />
      </label>
      <Button type="button" onClick={salvar} disabled={ocupado || awb.trim().length === 0}>
        {ocupado ? "Salvando…" : guiaRegistrada ? "Reenviar rastreio ao PayPal" : "Registrar guia DHL"}
      </Button>
    </div>
  );
}
