"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import {
  ENVIO_LABEL,
  transicoesEnvioDisponiveis,
  type PaymentStatusValue,
  type ShippingStatusValue,
} from "@/lib/admin/venda-status";
import { cancelarPedidoAction, marcarEnvioAction } from "./actions";

/**
 * As ações possíveis para ESTE pedido, e só elas.
 *
 * Botão que não faz sentido no estado atual não aparece desabilitado com
 * explicação: some. Quem opera a loja não precisa aprender por que uma coisa
 * é impossível — precisa ver as duas ou três coisas que dá para fazer agora.
 *
 * Nada aqui usa palavra de sistema. A versão anterior desta tela explicava
 * que "o pagamento só é confirmado pelo webhook do provedor, ver
 * src/app/api/.../route.ts", com caminho de arquivo e tudo. Estava correto e
 * era ilegível para a pessoa que precisa despachar cinco caixas hoje.
 *
 * print:hidden no wrapper (ver page.tsx do detalhe): quem imprime o pedido
 * quer o conteúdo, não os botões.
 */
export function StatusActions({
  orderId,
  paymentStatus,
  shippingStatus,
  canceladoEm,
}: {
  orderId: string;
  paymentStatus: PaymentStatusValue;
  shippingStatus: ShippingStatusValue;
  canceladoEm: string | null;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [motivo, setMotivo] = useState("");

  const disponiveis = canceladoEm ? [] : transicoesEnvioDisponiveis(shippingStatus);
  // Enviado ou entregue não volta por botão: seria "descancelar" a realidade.
  const podeCancelar =
    !canceladoEm && !["shipped", "delivered"].includes(shippingStatus);

  async function aplicarEnvio(destino: ShippingStatusValue) {
    setErro(null);
    setOcupado(true);
    const resultado = await marcarEnvioAction({ orderId, novoEnvio: destino });
    setOcupado(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    router.refresh();
  }

  async function cancelar() {
    setErro(null);
    setOcupado(true);
    const resultado = await cancelarPedidoAction({ orderId, motivo });
    setOcupado(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    setConfirmandoCancelamento(false);
    setMotivo("");
    router.refresh();
  }

  if (canceladoEm) {
    return (
      <p className="text-sm text-ink/60">
        Pedido cancelado. O histórico fica guardado — nada mais a fazer por aqui.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      {paymentStatus !== "paid" ? (
        <p className="text-sm text-ink/70">
          Esta venda ainda não foi paga. Assim que o pagamento entrar, ela aparece aqui como
          paga sozinha — não é preciso marcar nada à mão.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {disponiveis.map((destino) => (
          <Button
            key={destino}
            type="button"
            disabled={ocupado}
            onClick={() => aplicarEnvio(destino)}
            className="min-h-12"
          >
            {destino === "shipped" ? "Marcar como enviado" : null}
            {destino === "delivered" ? "Marcar como entregue" : null}
            {destino === "awaiting_label" ? "Tentar etiqueta de novo" : null}
            {!["shipped", "delivered", "awaiting_label"].includes(destino)
              ? ENVIO_LABEL[destino]
              : null}
          </Button>
        ))}

        {podeCancelar ? (
          <Button
            type="button"
            variant="secondary"
            disabled={ocupado}
            onClick={() => setConfirmandoCancelamento(true)}
            className="min-h-12"
          >
            Cancelar pedido
          </Button>
        ) : null}
      </div>

      <Modal
        open={confirmandoCancelamento}
        onClose={() => setConfirmandoCancelamento(false)}
        title="Cancelar pedido"
      >
        <p className="text-sm text-ink/80">
          O pedido continua guardado no histórico, na aba de cancelados. Escreva o motivo — é
          o que vai explicar essa venda daqui a três meses.
        </p>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Motivo
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Cliente desistiu, endereço errado, produto sem estoque..."
            className="min-h-12 rounded-md border border-sand bg-white px-3 text-ink"
          />
        </label>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => setConfirmandoCancelamento(false)}>
            Voltar
          </Button>
          <Button type="button" onClick={cancelar} disabled={ocupado || motivo.trim().length < 3}>
            {ocupado ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
