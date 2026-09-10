"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { salvarCores, trocarFotoDaCor } from "./actions";

export interface CorEditavel {
  id?: string;
  code: string;
  name: string;
  photoUrl: string;
  sortOrder: number;
  isActive: boolean;
}

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";

function novaCor(ordem: number): CorEditavel {
  return { code: "", name: "", photoUrl: "", sortOrder: ordem, isActive: true };
}

export function CoresManager({ coresIniciais }: { coresIniciais: CorEditavel[] }) {
  const router = useRouter();
  const [cores, setCores] = useState(coresIniciais);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  // Uma cor nova recebe o id no banco. Depois de salvar e dar refresh, o
  // estado local precisa receber essa linha de volta; sem isso ela seguiria
  // parecendo "nova", duplicaria no próximo salvar e não aceitaria foto.
  useEffect(() => {
    setCores(coresIniciais);
  }, [coresIniciais]);

  function atualizar(indice: number, alteracao: Partial<CorEditavel>) {
    setCores((atuais) => atuais.map((cor, i) => (i === indice ? { ...cor, ...alteracao } : cor)));
    setErro(null);
    setSucesso(null);
  }

  async function salvar() {
    setErro(null);
    setSucesso(null);
    setSalvando(true);
    const resultado = await salvarCores({ cores });
    setSalvando(false);
    if ("error" in resultado) return setErro(resultado.error);
    setSucesso("Cores salvas. A cartela do site foi atualizada.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      {sucesso ? <Toast message={sucesso} variant="success" onClose={() => setSucesso(null)} /> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={() => setCores((atuais) => [...atuais, novaCor(atuais.length)])}>
          Adicionar cor
        </Button>
        <Button type="button" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {cores.map((cor, indice) => (
          <CartaoCor
            key={cor.id ?? `nova-${indice}`}
            cor={cor}
            onChange={(alteracao) => atualizar(indice, alteracao)}
            onFoto={(url) => atualizar(indice, { photoUrl: url })}
            onErro={setErro}
            onSucesso={setSucesso}
          />
        ))}
      </div>

      <Button type="button" className="w-fit" onClick={salvar} disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar alterações"}
      </Button>
    </div>
  );
}

function CartaoCor({
  cor,
  onChange,
  onFoto,
  onErro,
  onSucesso,
}: {
  cor: CorEditavel;
  onChange: (alteracao: Partial<CorEditavel>) => void;
  onFoto: (url: string) => void;
  onErro: (mensagem: string | null) => void;
  onSucesso: (mensagem: string | null) => void;
}) {
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviarFoto(arquivo?: File) {
    if (!arquivo) return;
    if (!cor.id) {
      onErro("Salve a nova cor antes de enviar a foto.");
      return;
    }
    setEnviando(true);
    onErro(null);
    const dados = new FormData();
    dados.set("arquivo", arquivo);
    const resultado = await trocarFotoDaCor(cor.id, dados);
    setEnviando(false);
    if ("error" in resultado) return onErro(resultado.error);
    onFoto(resultado.url);
    onSucesso(`Foto da cor ${cor.name || cor.code} atualizada.`);
  }

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-sand p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-sand text-center text-xs text-ink/60">
          {cor.photoUrl ? <img src={cor.photoUrl} alt={`Prévia da cor ${cor.name || cor.code}`} className="h-full w-full object-cover" /> : "Sem foto"}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <label className="text-sm text-ink">Código<input value={cor.code} onChange={(e) => onChange({ code: e.target.value })} className={`${inputClass} mt-1 w-full`} /></label>
          <label className="text-sm text-ink">Nome<input value={cor.name} onChange={(e) => onChange({ name: e.target.value })} className={`${inputClass} mt-1 w-full`} /></label>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-ink">Ordem<input type="number" min="0" value={cor.sortOrder} onChange={(e) => onChange({ sortOrder: Number(e.target.value) })} className={`${inputClass} w-24`} /></label>
        <label className="flex min-h-toque items-center gap-2 text-sm text-ink"><input type="checkbox" checked={cor.isActive} onChange={(e) => onChange({ isActive: e.target.checked })} className="h-5 w-5" />Visível no site</label>
        <input ref={inputArquivo} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(e) => { void enviarFoto(e.target.files?.[0]); e.target.value = ""; }} />
        <Button type="button" variant="secondary" size="sm" onClick={() => inputArquivo.current?.click()} disabled={enviando}>
          {enviando ? "Enviando…" : cor.photoUrl ? "Trocar foto" : "Enviar foto"}
        </Button>
      </div>
    </article>
  );
}
