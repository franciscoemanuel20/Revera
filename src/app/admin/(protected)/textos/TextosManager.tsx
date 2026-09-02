"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { salvarTexto, restaurarOriginal, trocarImagem } from "./actions";

export interface TextoItemView {
  chave: string;
  rotulo: string;
  tipo: "texto" | "paragrafo" | "imagem";
  /**
   * O que está escrito no código — o que volta ao restaurar.
   *
   * Para `tipo: "imagem"`, é o caminho da foto que veio versionada em
   * public/ (ex.: "/media/base/base-com-fios.jpg").
   */
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
              {grupo.itens.map((item) =>
                item.tipo === "imagem" ? (
                  <ItemImagem key={item.chave} item={item} somenteLeitura={somenteLeitura} />
                ) : (
                  <ItemTexto key={item.chave} item={item} somenteLeitura={somenteLeitura} />
                )
              )}
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

/**
 * O cartão de uma FOTO do site (02/09/2026).
 *
 * Um cartão separado, e não um `if` dentro de ItemTexto, porque o que muda
 * não é a caixinha: é o fluxo inteiro. Texto se digita e se salva; foto se
 * escolhe do computador, sobe, e só então existe um valor para gravar. Um
 * componente tentando ser os dois teria dois estados de "salvando", dois
 * significados para "alterações não salvas", e um campo de digitação que
 * ninguém deveria usar.
 *
 * NÃO EXISTE CAMPO PARA DIGITAR O ENDEREÇO DA FOTO, de propósito. Quem usa
 * esta tela não é programador; um campo de URL só serviria para colar um
 * endereço errado — e endereço errado numa foto não deixa a foto quebrada,
 * deixa a PÁGINA quebrada (ver motivoDeImagemInvalida em lib/conteudo/midia).
 * O botão de enviar arquivo cobre o caso real e não tem como errar o formato.
 */
function ItemImagem({ item, somenteLeitura }: { item: TextoItemView; somenteLeitura: boolean }) {
  const router = useRouter();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function enviar() {
    if (!arquivo) {
      setErro("Escolha uma foto antes de enviar.");
      return;
    }
    setErro(null);
    setSucesso(false);
    setEnviando(true);
    const dados = new FormData();
    dados.append("arquivo", arquivo);
    const resultado = await trocarImagem(item.chave, dados);
    setEnviando(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    setArquivo(null);
    // Limpa o seletor: sem isso o nome do arquivo continua na tela depois de
    // trocado, e dá a impressão de que ainda falta enviar.
    if (inputArquivo.current) inputArquivo.current.value = "";
    setSucesso(true);
    router.refresh();
  }

  async function restaurar() {
    const confirmou = window.confirm(
      `Voltar "${item.rotulo}" à foto original do site? A foto enviada aqui deixa de aparecer.`
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
      className={`flex flex-col gap-3 rounded-md border p-4 ${
        item.editado ? "border-gold bg-gold/5" : "border-sand"
      }`}
    >
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      {sucesso ? (
        <Toast message="Foto trocada." variant="success" onClose={() => setSucesso(false)} />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{item.rotulo}</p>
        <span className="text-xs text-ink/40">{item.chave}</span>
      </div>

      <span
        className={`w-fit rounded-full px-2 py-0.5 text-xs ${
          item.editado ? "bg-gold/20 text-ink" : "bg-sand text-ink/60"
        }`}
      >
        {item.editado ? `Trocada${item.updatedBy ? ` por ${item.updatedBy}` : ""}` : "Foto original"}
      </span>

      <div className="flex flex-wrap items-end gap-4">
        <figure className="flex flex-col gap-1">
          <span className="text-xs text-ink/60">No site agora</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- tela
              interna de conferência; passar pelo otimizador do Next aqui
              obrigaria a listar o host do Storage também para o admin, sem
              ganho nenhum para quem só quer ver qual foto está no ar. */}
          <img
            src={item.valorAtual}
            alt=""
            className="h-28 w-40 rounded border border-sand bg-paper object-contain"
          />
        </figure>

        {/* A foto original só aparece quando há o que comparar. É o mesmo
            princípio do "Texto original:" do cartão de texto: restaurar sem
            ver o que volta é um salto no escuro. */}
        {item.editado ? (
          <figure className="flex flex-col gap-1">
            <span className="text-xs text-ink/60">Original do site</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- idem acima */}
            <img
              src={item.padrao}
              alt=""
              className="h-28 w-40 rounded border border-sand bg-paper object-contain opacity-70"
            />
          </figure>
        ) : null}
      </div>

      {somenteLeitura ? null : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm text-ink">
            Trocar por uma foto do computador
            <input
              ref={inputArquivo}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                setErro(null);
                setSucesso(false);
              }}
              className={inputClass}
            />
          </label>
          <p className="text-xs text-ink/50">
            JPG, PNG, WEBP ou AVIF, até 5 MB. A foto nova entra no site em instantes.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" onClick={enviar} disabled={enviando || !arquivo}>
              {enviando ? "Enviando…" : "Enviar e trocar"}
            </Button>
            {item.editado ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={restaurar}
                disabled={restaurando}
              >
                {restaurando ? "Restaurando…" : "Voltar à foto original"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
