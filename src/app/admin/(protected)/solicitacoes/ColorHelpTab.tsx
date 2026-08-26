"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { formatarDataHora } from "@/lib/format/date";
import { responderAjudaCorAction } from "./actions";

export interface ColorHelpItem {
  id: string;
  customerName: string;
  contact: string;
  status: string;
  suggestedColorId: string | null;
  adminNotes: string | null;
  createdAt: string;
  // URL assinada (curta duração), gerada no server component (page.tsx) —
  // ver comentário lá sobre por que isto usa createAdminClient() como
  // exceção. Pode vir null se a geração falhar (foto some da tela nesse
  // caso, em vez de quebrar a página inteira).
  signedPhotoUrl: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  new: "Novo",
  answered: "Respondido",
  closed: "Encerrado",
};

export function ColorHelpTab({
  items,
  colors,
}: {
  items: ColorHelpItem[];
  colors: Array<{ id: string; label: string }>;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink/60">Nenhum pedido de ajuda de cor ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <Linha key={item.id} item={item} colors={colors} />
      ))}
    </div>
  );
}

function Linha({ item, colors }: { item: ColorHelpItem; colors: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [colorId, setColorId] = useState(item.suggestedColorId ?? "");
  const [notes, setNotes] = useState(item.adminNotes ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const resultado = await responderAjudaCorAction({
      id: item.id,
      suggestedColorId: colorId || null,
      notes: notes.trim() ? notes : null,
    });
    setSalvando(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-sand p-4 sm:flex-row">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      {item.signedPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada
        // temporária do Supabase Storage; next/image exigiria cadastrar o
        // domínio do projeto Supabase em next.config.js para uma URL que
        // muda de query string a cada carregamento (a assinatura expira).
        <img
          src={item.signedPhotoUrl}
          alt={`Foto enviada por ${item.customerName}`}
          className="h-32 w-32 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-md bg-sand text-xs text-ink/50">
          Sem foto
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-ink">{item.customerName}</p>
            <p className="text-sm text-ink/60">
              {item.contact} · {formatarDataHora(item.createdAt)}
            </p>
          </div>
          <span className="rounded-full bg-sand px-2 py-1 text-xs font-semibold text-ink">
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
        </div>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Cor sugerida
          <select
            value={colorId}
            onChange={(e) => setColorId(e.target.value)}
            className="min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink"
          >
            <option value="">—</option>
            {colors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Notas
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-md border border-sand bg-paper px-3 py-2 text-ink"
          />
        </label>

        <div>
          <Button type="button" size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar resposta"}
          </Button>
        </div>
      </div>
    </div>
  );
}
