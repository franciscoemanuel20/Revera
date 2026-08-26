"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { salvarContentBlockAction } from "./actions";

export interface ContentBlockItem {
  id: string;
  sectionKey: string;
  title: string;
  body: string;
  mediaUrl: string;
  isVisible: boolean;
  sortOrder: number;
}

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";

// Diferente de FaqManager/ReviewsManager: aqui cada bloco tem seu PRÓPRIO
// botão de salvar, e não existe botão de criar/remover — ver comentário em
// actions.ts (salvarContentBlockAction) sobre por que section_key nunca é
// criado nem apagado por esta tela.
export function ContentBlocksManager({ items }: { items: ContentBlockItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        Nenhuma seção cadastrada ainda. `content_blocks` só ganha linha quando um desenvolvedor
        cria um `section_key` novo (via migration/seed) para uma página específica ler depois —
        este painel não inventa chave nova sozinho.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <Linha key={item.id} item={item} />
      ))}
    </div>
  );
}

function Linha({ item }: { item: ContentBlockItem }) {
  const router = useRouter();
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [mediaUrl, setMediaUrl] = useState(item.mediaUrl);
  const [isVisible, setIsVisible] = useState(item.isVisible);
  const [sortOrder, setSortOrder] = useState(String(item.sortOrder));
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setSucesso(false);
    setSalvando(true);
    const resultado = await salvarContentBlockAction({
      id: item.id,
      title: title.trim() ? title : null,
      body: body.trim() ? body : null,
      mediaUrl: mediaUrl.trim() ? mediaUrl : null,
      isVisible,
      sortOrder: Number(sortOrder || "0"),
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
    <div className="flex flex-col gap-3 rounded-md border border-sand p-4">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      {sucesso ? <Toast message="Seção salva." variant="success" onClose={() => setSucesso(false)} /> : null}

      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{item.sectionKey}</p>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Título
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Texto
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        URL de mídia (imagem/vídeo)
        <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} className={inputClass} />
      </label>

      <div className="flex items-center gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Ordem
          <input
            type="number"
            min="0"
            step="1"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={`${inputClass} w-24`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)} className="h-5 w-5" />
          Visível no site
        </label>
        <Button type="button" size="sm" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar seção"}
        </Button>
      </div>
    </div>
  );
}
