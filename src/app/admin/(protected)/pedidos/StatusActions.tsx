"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import { STATUS_LABEL, transicoesDisponiveis, type OrderStatusValue } from "@/lib/admin/order-status";
import { mudarStatusPedidoAction } from "./actions";

// print:hidden no wrapper (ver page.tsx do detalhe): quem imprime o pedido
// não precisa ver botão de ação, só o conteúdo do pedido em si.
export function StatusActions({ orderId, status }: { orderId: string; status: OrderStatusValue }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<OrderStatusValue | null>(null);
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);

  const disponiveis = transicoesDisponiveis(status);

  async function aplicar(destino: OrderStatusValue) {
    setErro(null);
    setEnviando(destino);
    const resultado = await mudarStatusPedidoAction({ orderId, novoStatus: destino });
    setEnviando(null);
    setConfirmandoCancelamento(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      {/* A transição para "pago" nunca aparece na lista de disponíveis (ver
          transicoesDisponiveis) — o botão abaixo é só para deixar EXPLÍCITO,
          na tela, por que ele não existe, em vez de um pedido "new" parecer
          travado sem explicação nenhuma. */}
      {status === "new" ? (
        <div className="flex flex-col items-start gap-2 rounded-md border border-sand bg-sand/40 p-3 text-sm text-ink/70">
          <Button type="button" variant="secondary" disabled className="cursor-not-allowed opacity-50">
            Marcar como pago
          </Button>
          <p>
            Este botão fica sempre indisponível: o pagamento só é confirmado pelo webhook do
            provedor, depois de consultar o gateway de verdade (ver
            src/app/api/webhooks/pagamento/route.ts). Marcar manualmente abriria brecha para
            liberar um pedido sem o dinheiro ter entrado — por isso não existe aqui.
          </p>
        </div>
      ) : null}

      {disponiveis.length === 0 ? (
        <p className="text-sm text-ink/60">Este pedido não tem mais transições manuais disponíveis.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {disponiveis.map((destino) =>
            destino === "canceled" ? (
              <Button
                key={destino}
                type="button"
                variant="secondary"
                disabled={enviando !== null}
                onClick={() => setConfirmandoCancelamento(true)}
              >
                Cancelar pedido
              </Button>
            ) : (
              <Button
                key={destino}
                type="button"
                disabled={enviando !== null}
                onClick={() => aplicar(destino)}
              >
                {enviando === destino ? "Salvando..." : `Mover para: ${STATUS_LABEL[destino]}`}
              </Button>
            )
          )}
        </div>
      )}

      <Modal
        open={confirmandoCancelamento}
        onClose={() => setConfirmandoCancelamento(false)}
        title="Cancelar pedido"
      >
        <p className="text-sm text-ink/80">
          Cancelar tira o pedido do fluxo normal e não tem transição de volta. Confirma o
          cancelamento?
        </p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => setConfirmandoCancelamento(false)}>
            Voltar
          </Button>
          <Button type="button" onClick={() => aplicar("canceled")} disabled={enviando !== null}>
            {enviando === "canceled" ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
