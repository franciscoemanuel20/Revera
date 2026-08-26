"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { formatarDataHora } from "@/lib/format/date";
import { mudarStatusProfissionalAction } from "./actions";

export interface ProfessionalItem {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  businessName: string | null;
  city: string | null;
  message: string | null;
  status: "new" | "contacted" | "converted" | "declined";
  createdAt: string;
}

const STATUS_LABEL: Record<ProfessionalItem["status"], string> = {
  new: "Novo",
  contacted: "Contatado",
  converted: "Convertido",
  declined: "Recusado",
};

const PROXIMOS_STATUS: Record<ProfessionalItem["status"], ProfessionalItem["status"][]> = {
  new: ["contacted"],
  contacted: ["converted", "declined"],
  converted: [],
  declined: [],
};

export function ProfessionalTab({ items }: { items: ProfessionalItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-ink/60">Nenhum cadastro de profissional ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <Linha key={item.id} item={item} />
      ))}
    </div>
  );
}

function Linha({ item }: { item: ProfessionalItem }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  async function mudar(novoStatus: ProfessionalItem["status"]) {
    setErro(null);
    setSalvando(novoStatus);
    const resultado = await mudarStatusProfissionalAction({ id: item.id, status: novoStatus });
    setSalvando(null);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    router.refresh();
  }

  const proximos = PROXIMOS_STATUS[item.status];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-sand p-4">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-ink">{item.fullName}</p>
          <p className="text-sm text-ink/60">
            {item.phone}
            {item.email ? ` · ${item.email}` : ""}
            {item.businessName ? ` · ${item.businessName}` : ""}
            {item.city ? ` · ${item.city}` : ""}
          </p>
          <p className="text-xs text-ink/50">{formatarDataHora(item.createdAt)}</p>
        </div>
        <span className="rounded-full bg-sand px-2 py-1 text-xs font-semibold text-ink">
          {STATUS_LABEL[item.status]}
        </span>
      </div>

      {item.message ? <p className="text-sm text-ink/80">{item.message}</p> : null}

      {proximos.length === 0 ? (
        <p className="text-sm text-ink/60">Sem mais transição de status.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {proximos.map((status) => (
            <Button key={status} type="button" size="sm" disabled={salvando !== null} onClick={() => mudar(status)}>
              {salvando === status ? "Salvando..." : `Mover para: ${STATUS_LABEL[status]}`}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
