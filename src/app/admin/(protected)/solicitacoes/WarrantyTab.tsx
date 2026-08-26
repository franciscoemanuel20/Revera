"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { formatarDataHora } from "@/lib/format/date";
import { mudarStatusGarantiaAction } from "./actions";

export interface WarrantyItem {
  id: string;
  orderNumber: string | null;
  description: string;
  photoUrls: string[];
  videoUrls: string[];
  status: "new" | "in_review" | "approved" | "denied";
  adminNotes: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<WarrantyItem["status"], string> = {
  new: "Novo",
  in_review: "Em análise",
  approved: "Aprovado",
  denied: "Negado",
};

// new -> in_review -> approved/denied — mesmo mapa da Server Action
// (mudarStatusGarantiaAction), só que aqui é usado para desenhar os
// botões disponíveis (a validação de verdade continua no servidor).
const PROXIMOS_STATUS: Record<WarrantyItem["status"], WarrantyItem["status"][]> = {
  new: ["in_review"],
  in_review: ["approved", "denied"],
  approved: [],
  denied: [],
};

export function WarrantyTab({ items }: { items: WarrantyItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-ink/60">Nenhuma solicitação de garantia ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <Linha key={item.id} item={item} />
      ))}
    </div>
  );
}

function Linha({ item }: { item: WarrantyItem }) {
  const router = useRouter();
  const [notes, setNotes] = useState(item.adminNotes ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  async function mudar(novoStatus: WarrantyItem["status"]) {
    setErro(null);
    setSalvando(novoStatus);
    const resultado = await mudarStatusGarantiaAction({
      id: item.id,
      status: novoStatus,
      notes: notes.trim() ? notes : null,
    });
    setSalvando(null);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    router.refresh();
  }

  const proximos = PROXIMOS_STATUS[item.status];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-sand p-4">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-ink">Pedido {item.orderNumber ?? "—"}</p>
          <p className="text-sm text-ink/60">{formatarDataHora(item.createdAt)}</p>
        </div>
        <span className="rounded-full bg-sand px-2 py-1 text-xs font-semibold text-ink">
          {STATUS_LABEL[item.status]}
        </span>
      </div>

      <p className="text-sm text-ink/80">{item.description}</p>

      {item.photoUrls.length > 0 || item.videoUrls.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-sm">
          {item.photoUrls.map((url, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-ink underline decoration-gold decoration-2 underline-offset-4"
            >
              Foto {i + 1}
            </a>
          ))}
          {item.videoUrls.map((url, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-ink underline decoration-gold decoration-2 underline-offset-4"
            >
              Vídeo {i + 1}
            </a>
          ))}
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-sm text-ink">
        Notas do admin
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-md border border-sand bg-paper px-3 py-2 text-ink"
        />
      </label>

      {proximos.length === 0 ? (
        <p className="text-sm text-ink/60">Solicitação encerrada — sem mais transição de status.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {proximos.map((status) => (
            <Button key={status} type="button" size="sm" disabled={salvando !== null} onClick={() => mudar(status)}>
              {salvando === status ? "Salvando..." : `Mover para: ${STATUS_LABEL[status]}`}
            </Button>
          ))}
          <Button type="button" size="sm" variant="ghost" disabled={salvando !== null} onClick={() => mudar(item.status)}>
            Só salvar a nota
          </Button>
        </div>
      )}
    </div>
  );
}
