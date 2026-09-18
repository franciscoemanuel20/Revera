"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  enviarReengajamentoAction,
  previaReengajamentoAction,
  type PreviaReengajamento,
} from "./actions";

const MOTIVO_LABEL: Record<string, string> = {
  teste: "pedidos de teste",
  sem_telefone: "sem telefone válido",
  outro_pedido_da_mesma_pessoa: "mesma pessoa em outro pedido",
  ja_recebeu: "já receberam esta mensagem",
  mudou_de_estado: "pagaram ou foram cancelados",
  comprou_em_outro_pedido: "compraram por outro pedido",
  ja_reservado: "já reservados",
  envio_recusado: "recusados pela Clint",
};

/**
 * Mensagem única aos checkouts parados (18/09/2026). Prévia primeiro, envio
 * depois — nunca um clique que manda sem mostrar para quem.
 */
export function ReengajamentoUnico({ texto }: { texto: string }) {
  const router = useRouter();
  const [previa, setPrevia] = useState<PreviaReengajamento | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [relato, setRelato] = useState<string | null>(null);

  async function verPrevia() {
    setOcupado(true);
    setRelato(null);
    setPrevia(await previaReengajamentoAction());
    setOcupado(false);
  }

  async function enviar() {
    if (!previa || "error" in previa) return;
    const n = Math.min(previa.pessoas.length, 20);
    if (!window.confirm(`Mandar a mensagem para ${n} pessoa(s) agora? Cada uma recebe uma vez só.`)) return;
    setOcupado(true);
    const r = await enviarReengajamentoAction();
    setOcupado(false);
    if ("error" in r) {
      setRelato(`Não enviado: ${r.error}`);
      return;
    }
    const pulos = Object.entries(r.pulados)
      .map(([m, q]) => `${q} ${MOTIVO_LABEL[m] ?? m}`)
      .join(", ");
    setRelato(`${r.enviados} enviada(s).${pulos ? ` Fora: ${pulos}.` : ""}${r.erro ? ` Parou: ${r.erro}` : ""}`);
    setPrevia(null);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-sand p-4">
      <div>
        <h2 className="font-display text-lg text-ink">Mensagem única: pagamento ficou mais simples</h2>
        <p className="text-sm text-ink/60">
          Para quem parou no pagamento nos últimos 10 dias. Uma vez por pessoa, até 20 por clique, das 9h às 20h.
        </p>
      </div>
      <p className="rounded-md bg-sand/40 p-3 text-sm text-ink/80">{texto}</p>

      {previa && "error" in previa ? <p className="text-sm text-red-700">{previa.error}</p> : null}
      {previa && !("error" in previa) ? (
        <div className="text-sm text-ink/80">
          <p className="font-medium">
            {previa.pessoas.length} pessoa(s) na fila
            {Object.keys(previa.fora).length > 0
              ? ` · fora: ${Object.entries(previa.fora)
                  .map(([m, q]) => `${q} ${MOTIVO_LABEL[m] ?? m}`)
                  .join(", ")}`
              : ""}
          </p>
          <ul className="mt-2 max-h-48 overflow-auto text-xs text-ink/70">
            {previa.pessoas.map((p) => (
              <li key={p.codigo}>
                {p.codigo} · {p.nome} · {p.telefone}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {relato ? <p className="text-sm text-ink">{relato}</p> : null}

      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={verPrevia} disabled={ocupado}>
          {ocupado ? "Aguarde…" : "Ver para quem vai"}
        </Button>
        {previa && !("error" in previa) && previa.pessoas.length > 0 ? (
          <Button type="button" size="sm" onClick={enviar} disabled={ocupado}>
            Enviar agora
          </Button>
        ) : null}
      </div>
    </section>
  );
}
