"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import type { OrderStatusValue } from "@/lib/admin/order-status";
import { gerarEtiquetaAction } from "./etiqueta";

/**
 * Gerar a etiqueta de envio.
 *
 * Pede confirmação de propósito, e a confirmação DIZ QUE CUSTA DINHEIRO —
 * criar a etiqueta debita o frete da carteira da SuperFrete na hora, e não
 * existe desfazer. Um botão que gasta sem avisar é um botão que um dia é
 * clicado por engano.
 */
export function BotaoEtiqueta({
  orderId,
  status,
  jaTemEtiqueta,
}: {
  orderId: string;
  status: OrderStatusValue;
  jaTemEtiqueta: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Só faz sentido a partir de pago, e some depois que a etiqueta existe.
  if (jaTemEtiqueta) return null;
  if (status !== "paid" && status !== "preparing") return null;

  async function gerar() {
    setErro(null);
    setGerando(true);
    const resultado = await gerarEtiquetaAction({ orderId });
    setGerando(false);
    setConfirmando(false);

    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      <Button type="button" onClick={() => setConfirmando(true)} disabled={gerando}>
        {gerando ? "Gerando etiqueta…" : "Gerar etiqueta de envio"}
      </Button>

      <Modal open={confirmando} onClose={() => setConfirmando(false)} title="Gerar etiqueta de envio">
        <p className="text-sm text-ink/80">
          Isto compra a etiqueta na SuperFrete agora, descontando o valor do frete do saldo da
          carteira. Não tem como desfazer, e cada etiqueta gerada é cobrada — mesmo se for
          duplicada.
        </p>
        <p className="text-sm text-ink/80">
          A etiqueta sai no mesmo serviço que o cliente pagou neste pedido.
        </p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
            Voltar
          </Button>
          <Button type="button" onClick={gerar} disabled={gerando}>
            {gerando ? "Gerando…" : "Confirmar e gerar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
