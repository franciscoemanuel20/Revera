"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { salvarFaqAction } from "./actions";

export interface FaqRow {
  key: string;
  id?: string;
  question: string;
  answer: string;
  sortOrder: string;
  isVisible: boolean;
}

function novaChave() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `linha-${Date.now()}`;
}

export function novaPergunta(proximaOrdem: number): FaqRow {
  return { key: novaChave(), question: "", answer: "", sortOrder: String(proximaOrdem), isVisible: true };
}

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";

// Mesmo padrão de ProductForm.tsx: um único botão "Salvar" sincroniza a
// lista inteira (upsert por linha + remove o que saiu) — é o gesto que a
// dona da Reverá já aprendeu usando /admin/produtos, não faz sentido esta
// tela se comportar diferente.
export function FaqManager({ initialItems }: { initialItems: FaqRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState<FaqRow[]>(initialItems);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function atualizar(key: string, patch: Partial<FaqRow>) {
    setItems((atuais) => atuais.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function remover(key: string) {
    setItems((atuais) => atuais.filter((i) => i.key !== key));
  }

  async function salvar() {
    setErro(null);
    setSucesso(false);
    setSalvando(true);
    const resultado = await salvarFaqAction({
      items: items.map((i) => ({
        id: i.id,
        question: i.question,
        answer: i.answer,
        sortOrder: Number(i.sortOrder || "0"),
        isVisible: i.isVisible,
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
      {sucesso ? <Toast message="FAQ salva." variant="success" onClose={() => setSucesso(false)} /> : null}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-ink">Perguntas frequentes</h2>
        <Button type="button" variant="secondary" size="sm" onClick={() => setItems((i) => [...i, novaPergunta(i.length)])}>
          Adicionar pergunta
        </Button>
      </div>

      {items.length === 0 ? <p className="text-sm text-ink/60">Nenhuma pergunta cadastrada ainda.</p> : null}

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div key={item.key} className="flex flex-col gap-3 rounded-md border border-sand p-4">
            <label className="flex flex-col gap-1 text-sm text-ink">
              Pergunta
              <input value={item.question} onChange={(e) => atualizar(item.key, { question: e.target.value })} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Resposta
              <textarea
                rows={3}
                value={item.answer}
                onChange={(e) => atualizar(item.key, { answer: e.target.value })}
                className={inputClass}
              />
            </label>
            <div className="flex items-center gap-4">
              <label className="flex flex-col gap-1 text-sm text-ink">
                Ordem
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={item.sortOrder}
                  onChange={(e) => atualizar(item.key, { sortOrder: e.target.value })}
                  className={`${inputClass} w-24`}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={item.isVisible}
                  onChange={(e) => atualizar(item.key, { isVisible: e.target.checked })}
                  className="h-5 w-5"
                />
                Visível no site
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => remover(item.key)}>
                Remover
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <Button type="button" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar FAQ"}
        </Button>
      </div>
    </div>
  );
}
