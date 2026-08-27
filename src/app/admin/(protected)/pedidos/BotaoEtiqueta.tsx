"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import type { PaymentStatusValue, ShippingStatusValue } from "@/lib/admin/venda-status";
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
  paymentStatus,
  shippingStatus,
  jaTemEtiqueta,
}: {
  orderId: string;
  paymentStatus: PaymentStatusValue;
  shippingStatus: ShippingStatusValue;
  /** Etiqueta CONCLUÍDA (com rastreio ou PDF). Meia-etiqueta não conta. */
  jaTemEtiqueta: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Preenchido quando o frete mudou de preço desde a compra: a ação para e
  // devolve os dois números para alguém decidir.
  const [diferenca, setDiferenca] = useState<{
    cobradoCents: number;
    agoraCents: number;
    diferencaCents: number;
    servicoAgora: string;
  } | null>(null);

  /**
   * Some depois que a etiqueta existe de verdade, e nunca aparece em pedido
   * não pago — as duas perguntas ficaram separadas na migration 8.
   *
   * 'shipping_error' MANTÉM o botão: é o "tentar novamente". A ação do
   * servidor sabe distinguir uma emissão do zero de uma retomada de etiqueta
   * já criada, então clicar aqui depois de um erro não gasta duas vezes.
   */
  if (jaTemEtiqueta) return null;
  if (paymentStatus !== "paid") return null;
  if (shippingStatus !== "awaiting_label" && shippingStatus !== "shipping_error") return null;

  async function gerar(confirmarDiferenca = false) {
    setErro(null);
    setGerando(true);
    const resultado = await gerarEtiquetaAction({ orderId, confirmarDiferenca });
    setGerando(false);

    if ("error" in resultado) {
      setConfirmando(false);
      setDiferenca(null);
      setErro(resultado.error);
      return;
    }
    if ("confirmar" in resultado) {
      setConfirmando(false);
      setDiferenca(resultado.confirmar);
      return;
    }
    setConfirmando(false);
    setDiferenca(null);
    router.refresh();
  }

  const brl = (c: number) =>
    (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
          <Button type="button" onClick={() => gerar()} disabled={gerando}>
            {gerando ? "Gerando…" : "Confirmar e gerar"}
          </Button>
        </div>
      </Modal>

      {/* O frete mudou de preço entre a compra e agora. Não bloqueia — mostra
          os dois números e deixa a decisão com quem está olhando. */}
      <Modal
        open={diferenca !== null}
        onClose={() => setDiferenca(null)}
        title="O frete mudou desde a compra"
      >
        {diferenca ? (
          <>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink/70">O cliente pagou</dt>
                <dd className="text-ink">{brl(diferenca.cobradoCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/70">Custa agora ({diferenca.servicoAgora})</dt>
                <dd className="text-ink">{brl(diferenca.agoraCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-sand pt-2 font-semibold">
                <dt className="text-ink">
                  {diferenca.diferencaCents > 0 ? "A operação absorve" : "Sobra"}
                </dt>
                <dd className="text-ink">{brl(Math.abs(diferenca.diferencaCents))}</dd>
              </div>
            </dl>
            <p className="text-sm text-ink/70">
              Pode ser reajuste da transportadora, CEP corrigido, ou uma cotação antiga. Se
              seguir, a etiqueta é comprada pelo valor de agora.
            </p>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setDiferenca(null)}>
                Não comprar
              </Button>
              <Button type="button" onClick={() => gerar(true)} disabled={gerando}>
                {gerando ? "Comprando…" : "Comprar mesmo assim"}
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
