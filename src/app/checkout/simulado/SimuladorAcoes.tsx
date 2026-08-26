"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { simularPagamentoAction, abandonarAction } from "./actions";

/**
 * Os dois desfechos possíveis na tela de um gateway: pagar, ou sair sem
 * pagar. Ter os dois no simulador importa — o caminho do abandono também
 * precisa funcionar, e é o mais comum na vida real.
 */
export function SimuladorAcoes({
  orderId,
  accessToken,
}: {
  orderId: string;
  accessToken: string;
}) {
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="flex w-full flex-col gap-3">
      <form action={simularPagamentoAction} onSubmit={() => setEnviando(true)}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="accessToken" value={accessToken} />
        <Button type="submit" size="lg" className="w-full" disabled={enviando}>
          {enviando ? "Confirmando…" : "Simular pagamento aprovado"}
        </Button>
      </form>

      <form action={abandonarAction}>
        <input type="hidden" name="accessToken" value={accessToken} />
        <Button type="submit" variant="ghost" size="sm" className="w-full">
          Sair sem pagar
        </Button>
      </form>
    </div>
  );
}
