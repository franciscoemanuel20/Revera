"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { salvarReviewsAction } from "./actions";

export interface ReviewRow {
  key: string;
  id?: string;
  customerName: string;
  city: string;
  professionalName: string;
  rating: string;
  comment: string;
  photoUrl: string;
  videoUrl: string;
  isPublished: boolean;
  sortOrder: string;
}

function novaChave() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `linha-${Date.now()}`;
}

export function novoDepoimento(proximaOrdem: number): ReviewRow {
  return {
    key: novaChave(),
    customerName: "",
    city: "",
    professionalName: "",
    rating: "",
    comment: "",
    photoUrl: "",
    videoUrl: "",
    isPublished: false,
    sortOrder: String(proximaOrdem),
  };
}

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";

// Mesmo padrão de FaqManager.tsx e ProductForm.tsx: um botão "Salvar"
// sincroniza a lista inteira.
export function ReviewsManager({ initialItems }: { initialItems: ReviewRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState<ReviewRow[]>(initialItems);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function atualizar(key: string, patch: Partial<ReviewRow>) {
    setItems((atuais) => atuais.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function remover(key: string) {
    setItems((atuais) => atuais.filter((i) => i.key !== key));
  }

  async function salvar() {
    setErro(null);
    setSucesso(false);
    setSalvando(true);
    const resultado = await salvarReviewsAction({
      items: items.map((i) => ({
        id: i.id,
        customerName: i.customerName,
        city: i.city.trim() ? i.city : null,
        professionalName: i.professionalName.trim() ? i.professionalName : null,
        rating: i.rating.trim() ? Number(i.rating) : null,
        comment: i.comment.trim() ? i.comment : null,
        photoUrl: i.photoUrl.trim() ? i.photoUrl : null,
        videoUrl: i.videoUrl.trim() ? i.videoUrl : null,
        isPublished: i.isPublished,
        sortOrder: Number(i.sortOrder || "0"),
      })),
    });
    setSalvando(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    setSucesso(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      {sucesso ? <Toast message="Depoimentos salvos." variant="success" onClose={() => setSucesso(false)} /> : null}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-ink">Depoimentos</h2>
        <Button type="button" variant="secondary" size="sm" onClick={() => setItems((i) => [...i, novoDepoimento(i.length)])}>
          Adicionar depoimento
        </Button>
      </div>

      {items.length === 0 ? <p className="text-sm text-ink/60">Nenhum depoimento cadastrado ainda.</p> : null}

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div key={item.key} className="grid grid-cols-2 gap-3 rounded-md border border-sand p-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm text-ink">
              Nome do cliente
              <input value={item.customerName} onChange={(e) => atualizar(item.key, { customerName: e.target.value })} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Cidade
              <input value={item.city} onChange={(e) => atualizar(item.key, { city: e.target.value })} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Atendida por (profissional)
              <input
                value={item.professionalName}
                onChange={(e) => atualizar(item.key, { professionalName: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Nota (1 a 5)
              <input
                type="number"
                min="1"
                max="5"
                step="1"
                value={item.rating}
                onChange={(e) => atualizar(item.key, { rating: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-sm text-ink sm:col-span-3">
              Comentário
              <textarea
                rows={2}
                value={item.comment}
                onChange={(e) => atualizar(item.key, { comment: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              URL da foto (opcional)
              <input value={item.photoUrl} onChange={(e) => atualizar(item.key, { photoUrl: e.target.value })} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              URL do vídeo (opcional)
              <input value={item.videoUrl} onChange={(e) => atualizar(item.key, { videoUrl: e.target.value })} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Ordem
              <input
                type="number"
                min="0"
                step="1"
                value={item.sortOrder}
                onChange={(e) => atualizar(item.key, { sortOrder: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={item.isPublished}
                onChange={(e) => atualizar(item.key, { isPublished: e.target.checked })}
                className="h-5 w-5"
              />
              Publicado
            </label>
            <div className="flex items-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => remover(item.key)}>
                Remover
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <Button type="button" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar depoimentos"}
        </Button>
      </div>
    </div>
  );
}
