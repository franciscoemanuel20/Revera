"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { salvarTexto, restaurarOriginal } from "./actions";

export interface TextoItemView {
  chave: string;
  rotulo: string;
  tipo: "texto" | "paragrafo";
  /** O texto que está escrito no código — o que volta ao restaurar. */
  padrao: string;
  /** O que aparece no site hoje: edição do banco, ou o próprio padrão. */
  valorAtual: string;
  /** Existe linha em site_texts para esta chave. */
  editado: boolean;
  updatedBy: string | null;
}

export interface GrupoTextos {
  pagina: string;
  titulo: string;
  itens: TextoItemView[];
}

const inputClass =
  "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink disabled:cursor-not-allowed disabled:bg-sand/40 disabled:text-ink/50";

export function TextosManager({
  grupos,
  somenteLeitura,
}: {
  grupos: GrupoTextos[];
  somenteLeitura: boolean;
}) {
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();

  // Filtro simples por rótulo/texto/chave — com ~90 itens no registro
  // inteiro, rolar a página inteira para achar "frete" não é razoável para
  // quem não é programador e não sabe em que página um texto mora.
  const gruposFiltrados = useMemo(() => {
    if (!termo) return grupos;
    return grupos
      .map((grupo) => ({
        ...grupo,
        itens: grupo.itens.filter(
          (item) =>
            item.rotulo.toLowerCase().includes(termo) ||
            item.valorAtual.toLowerCase().includes(termo) ||
            item.chave.toLowerCase().includes(termo)
        ),
      }))
      .filter((grupo) => grupo.itens.length > 0);
  }, [grupos, termo]);

  return (
    <div className="flex flex-col gap-8">
      <label className="flex flex-col gap-1 text-sm text-ink">
        Buscar por texto ou rótulo
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Ex.: garantia, frete, título do botão..."
          className={inputClass}
        />
      </label>

      {gruposFiltrados.length === 0 ? (
        <p className="text-sm text-ink/60">Nenhum texto encontrado para essa busca.</p>
      ) : (
        gruposFiltrados.map((grupo) => (
          <section key={grupo.pagina} className="flex flex-col gap-4">
            <h2 className="font-display text-lg text-ink">Página: {grupo.titulo}</h2>
            <div className="flex flex-col gap-4">
              {grupo.itens.map((item) => (
                <ItemTexto key={item.chave} item={item} somenteLeitura={somenteLeitura} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ItemTexto({ item, somenteLeitura }: { item: TextoItemView; somenteLeitura: boolean }) {
  const router = useRouter();
  const [valor, setValor] = useState(item.valorAtual);
  const [salvando, setSalvando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const sujo = valor !== item.valorAtual;

  function onChange(novoValor: string) {
    setValor(novoValor);
    setErro(null);
    setSucesso(false);
  }

  async function salvar() {
    setErro(null);
    setSucesso(false);
    setSalvando(true);
    const resultado = await salvarTexto(item.chave, valor);
    setSalvando(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    setSucesso(true);
    router.refresh();
  }

  async function restaurar() {
    const confirmou = window.confirm(
      `Voltar "${item.rotulo}" ao texto original do código? A edição feita aqui vai ser apagada.`
    );
    if (!confirmou) return;
    setErro(null);
    setRestaurando(true);
    const resultado = await restaurarOriginal(item.chave);
    setRestaurando(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-md border p-4 ${
        item.editado ? "border-gold bg-gold/5" : "border-sand"
      }`}
    >
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      {sucesso ? <Toast message="Salvo." variant="success" onClose={() => setSucesso(false)} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{item.rotulo}</p>
        <span className="text-xs text-ink/40">{item.chave}</span>
      </div>

      <span
        className={`w-fit rounded-full px-2 py-0.5 text-xs ${
          item.editado ? "bg-gold/20 text-ink" : "bg-sand text-ink/60"
        }`}
      >
        {item.editado ? `Editado${item.updatedBy ? ` por ${item.updatedBy}` : ""}` : "Texto original"}
      </span>

      {item.tipo === "paragrafo" ? (
        <textarea
          rows={5}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          disabled={somenteLeitura}
          className={inputClass}
        />
      ) : (
        <input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          disabled={somenteLeitura}
          className={inputClass}
        />
      )}

      {/* Comparação para quem vai decidir se restaura — sem isso, restaurar
          é um salto no escuro: o Francisco teria que confiar de memória no
          que o site mostrava antes de editar. */}
      {item.editado ? (
        <p className="text-xs text-ink/50">
          Texto original: <span className="italic">{item.padrao}</span>
        </p>
      ) : null}

      {sujo && !somenteLeitura ? <p className="text-xs text-amber-700">Alterações não salvas.</p> : null}

      {somenteLeitura ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
          {item.editado ? (
            <Button type="button" variant="ghost" size="sm" onClick={restaurar} disabled={restaurando}>
              {restaurando ? "Restaurando…" : "Voltar ao texto original"}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
