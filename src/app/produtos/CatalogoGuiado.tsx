"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { Button } from "@/components/ui/Button";
import type { TexturaCatalogo } from "@/lib/catalog/apresentacao";

type Filtro = "todas" | TexturaCatalogo;
type Prioridade = "discricao" | "equilibrio" | "fixacao" | "textura";

export interface ProdutoGuiado {
  slug: string;
  name: string;
  titulo: string;
  resumo: string;
  textura: TexturaCatalogo;
  prioridade: Prioridade;
  imageUrl: string;
  imageAlt: string | null;
  priceCents: number | null;
  isFeatured: boolean;
}

const FILTROS: Array<{ id: Filtro; rotulo: string }> = [
  { id: "todas", rotulo: "Todas" },
  { id: "lisa", rotulo: "Lisa" },
  { id: "cacheada", rotulo: "Cacheada" },
  { id: "crespa", rotulo: "Crespa" },
  { id: "afro", rotulo: "Afro" },
];

const ROTULO_TEXTURA: Record<TexturaCatalogo, string> = {
  lisa: "Lisa",
  cacheada: "Cacheada",
  crespa: "Crespa",
  afro: "Afro",
};

export function CatalogoGuiado({ produtos }: { produtos: ProdutoGuiado[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [guiaAberto, setGuiaAberto] = useState(false);
  const [textura, setTextura] = useState<TexturaCatalogo | null>(null);
  const [prioridade, setPrioridade] = useState<Prioridade | null>(null);
  const [primeiraPeca, setPrimeiraPeca] = useState<boolean | null>(null);

  const visiveis = useMemo(
    () => produtos.filter((produto) => filtro === "todas" || produto.textura === filtro),
    [filtro, produtos]
  );

  const recomendado = useMemo(() => {
    if (!textura || !prioridade) return null;
    const mesmaTextura = produtos.filter((produto) => produto.textura === textura);
    return mesmaTextura.find((produto) => produto.prioridade === prioridade) ?? mesmaTextura[0] ?? null;
  }, [prioridade, produtos, textura]);

  function reiniciarGuia() {
    setTextura(null);
    setPrioridade(null);
    setPrimeiraPeca(null);
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="rounded-lg border border-sand bg-sand/30 p-5 sm:p-6" aria-labelledby="guia-titulo">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="eyebrow-ink">Escolha com segurança</span>
            <h2 id="guia-titulo" className="mt-1 font-display text-2xl text-ink">Não sabe qual prótese escolher?</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink/70">Responda três perguntas rápidas e veja a peça mais próxima do que você procura.</p>
          </div>
          <Button type="button" variant={guiaAberto ? "ghost" : "primary"} onClick={() => { setGuiaAberto((aberto) => !aberto); if (guiaAberto) reiniciarGuia(); }}>
            {guiaAberto ? "Fechar guia" : "Encontrar minha peça"}
          </Button>
        </div>

        {guiaAberto ? (
          <div className="mt-5 grid gap-5 border-t border-sand pt-5 md:grid-cols-3">
            <Pergunta titulo="1. Qual textura você procura?">
              {(["lisa", "cacheada", "crespa", "afro"] as TexturaCatalogo[]).map((opcao) => (
                <Opcao key={opcao} ativa={textura === opcao} onClick={() => { setTextura(opcao); setPrioridade(opcao === "lisa" ? null : "textura"); }}>
                  {ROTULO_TEXTURA[opcao]}
                </Opcao>
              ))}
            </Pergunta>
            <Pergunta titulo="2. O que mais importa para você?">
              {textura === "lisa" ? <>
                <Opcao ativa={prioridade === "discricao"} onClick={() => setPrioridade("discricao")}>Frente mais discreta</Opcao>
                <Opcao ativa={prioridade === "equilibrio"} onClick={() => setPrioridade("equilibrio")}>Equilíbrio para o dia a dia</Opcao>
                <Opcao ativa={prioridade === "fixacao"} onClick={() => setPrioridade("fixacao")}>Fixação mais segura</Opcao>
              </> : textura ? <p className="text-sm text-ink/70">Para esta textura, indicamos o modelo próprio para o seu acabamento.</p> : <p className="text-sm text-ink/60">Escolha primeiro a textura.</p>}
            </Pergunta>
            <Pergunta titulo="3. É sua primeira peça?">
              <Opcao ativa={primeiraPeca === true} onClick={() => setPrimeiraPeca(true)}>Sim, quero uma escolha simples</Opcao>
              <Opcao ativa={primeiraPeca === false} onClick={() => setPrimeiraPeca(false)}>Não, já sei o que procuro</Opcao>
              {recomendado && primeiraPeca !== null ? (
                <div className="mt-3 rounded-md bg-paper p-3">
                  <p className="font-semibold text-ink">Nossa indicação: {recomendado.titulo}</p>
                  <p className="mt-1 text-sm text-ink/70">{recomendado.resumo}</p>
                  <Link className="mt-3 inline-flex text-sm font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4" href={`/produtos/${recomendado.slug}`}>Ver esta peça</Link>
                </div>
              ) : null}
            </Pergunta>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="catalogo-titulo" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="catalogo-titulo" className="font-display text-2xl text-ink">Compare por textura</h2>
            <p className="text-sm text-ink/70">Cada peça mostra para quem ela é indicada antes de você abrir os detalhes.</p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Filtrar produtos por textura">
            {FILTROS.map((opcao) => <Button key={opcao.id} type="button" size="sm" variant={filtro === opcao.id ? "secondary" : "ghost"} onClick={() => setFiltro(opcao.id)}>{opcao.rotulo}</Button>)}
          </div>
        </div>

        {visiveis.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visiveis.map((produto) => <li key={produto.slug}><ProductCard slug={produto.slug} name={produto.titulo} summary={produto.resumo} textureLabel={ROTULO_TEXTURA[produto.textura]} imageUrl={produto.imageUrl} imageAlt={produto.imageAlt} priceCents={produto.priceCents} isFeatured={produto.isFeatured} /></li>)}
          </ul>
        ) : <p className="rounded-md border border-sand px-4 py-3 text-sm text-ink/70">Ainda não temos uma peça publicada para esta textura.</p>}
      </section>
    </div>
  );
}

function Pergunta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div><h3 className="text-sm font-semibold text-ink">{titulo}</h3><div className="mt-2 flex flex-col items-start gap-2">{children}</div></div>;
}

function Opcao({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${ativa ? "border-gold bg-paper font-semibold text-ink" : "border-sand bg-paper/70 text-ink/80 hover:border-gold"}`}>{children}</button>;
}
