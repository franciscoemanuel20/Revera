"use client";

import { Button } from "@/components/ui/Button";

// print:hidden: o botão em si não deve aparecer na folha impressa — só
// dispara window.print(), que usa a folha de estilo @media print que o
// Tailwind já gera para a variante `print:` (ver print:hidden espalhado
// pelo layout e por esta página de detalhe).
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" size="sm" className="print:hidden" onClick={() => window.print()}>
      Imprimir pedido
    </Button>
  );
}
