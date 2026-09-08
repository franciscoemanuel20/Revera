"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { liberarReservaTravadaAction } from "./actions";

/**
 * Botão de LIBERAR uma reserva de pagamento travada (sem link de checkout
 * guardado em lugar nenhum) — só aparece no cartão de um pagamento nesse
 * estado (ver [id]/page.tsx, que decide quando renderizar isto).
 *
 * A confirmação exige que quem clica tenha conferido no painel do PRÓPRIO
 * gateway se não existe outro link em aberto para este pedido — ver o
 * comentário grande em actions.ts (`liberarReservaTravadaAction`) para o
 * motivo de isto ser um botão de humano, e não algo automático.
 */
export function LiberarReservaButton({
  paymentId,
  orderId,
}: {
  paymentId: string;
  orderId: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function liberar() {
    const confirmou = window.confirm(
      "Antes de continuar: você já conferiu no painel da InfinitePay ou da Stripe que NÃO existe outro link de pagamento em aberto para este pedido?\n\nSe existir, liberar aqui pode deixar dois links válidos ao mesmo tempo. Só confirme se já verificou."
    );
    if (!confirmou) return;

    setErro(null);
    setOcupado(true);
    const resultado = await liberarReservaTravadaAction({ paymentId, orderId });
    setOcupado(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      <Button type="button" variant="ghost" size="sm" onClick={liberar} disabled={ocupado}>
        {ocupado ? "Liberando…" : "Liberar para nova tentativa"}
      </Button>
    </div>
  );
}
