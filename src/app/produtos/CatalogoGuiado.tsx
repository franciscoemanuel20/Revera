"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { Button } from "@/components/ui/Button";
import type { TexturaCatalogo } from "@/lib/catalog/apresentacao";
import { localizePath, type SiteLocale } from "@/lib/i18n/site";

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

const CATALOGO_GUIADO_COPY: Record<SiteLocale, {
  filtros: Array<{ id: Filtro; rotulo: string }>;
  textura: Record<TexturaCatalogo, string>;
  valor: Record<string, string>;
  titulo: string;
  intro: string;
  filtroAria: string;
  vazioFiltro: string;
  guiaEyebrow: string;
  guiaTitulo: string;
  guiaIntro: string;
  abrir: string;
  fechar: string;
  perguntaTextura: string;
  perguntaPrioridade: string;
  perguntaPrimeira: string;
  frente: string;
  equilibrio: string;
  fixacao: string;
  texturaIndicacao: string;
  escolhaPrimeiro: string;
  primeiraSim: string;
  primeiraNao: string;
  nossaIndicacao: string;
  verPeca: string;
  valueLabelFixacao: string;
  valueLabelNatural: string;
}> = {
  pt: {
    filtros: [
      { id: "todas", rotulo: "Todas" },
      { id: "lisa", rotulo: "Lisa" },
      { id: "cacheada", rotulo: "Cacheada" },
      { id: "crespa", rotulo: "Crespa" },
      { id: "afro", rotulo: "Afro" },
    ],
    textura: { lisa: "Lisa", cacheada: "Cacheada", crespa: "Crespa", afro: "Afro" },
    valor: {
      "micropele-008": "Mais vendida",
      "micropele-006": "Mais discreta",
      "cacho-aberto": "Movimento natural",
      "cacho-fechado": "Cachos definidos",
      afro: "Volume e identidade",
      "full-lace": "Leveza total",
      australia: "Fixação segura",
    },
    titulo: "Compare por textura",
    intro: "Cada peça mostra para quem ela é indicada antes de você abrir os detalhes.",
    filtroAria: "Filtrar produtos por textura",
    vazioFiltro: "Ainda não temos uma peça publicada para esta textura.",
    guiaEyebrow: "Escolha com segurança",
    guiaTitulo: "Não sabe qual prótese escolher?",
    guiaIntro: "Responda três perguntas rápidas e veja a peça mais próxima do que você procura.",
    abrir: "Encontrar minha peça",
    fechar: "Fechar guia",
    perguntaTextura: "1. Qual textura você procura?",
    perguntaPrioridade: "2. O que mais importa para você?",
    perguntaPrimeira: "3. É sua primeira peça?",
    frente: "Frente mais discreta",
    equilibrio: "Equilíbrio para o dia a dia",
    fixacao: "Fixação mais segura",
    texturaIndicacao: "Para esta textura, indicamos o modelo próprio para o seu acabamento.",
    escolhaPrimeiro: "Escolha primeiro a textura.",
    primeiraSim: "Sim, quero uma escolha simples",
    primeiraNao: "Não, já sei o que procuro",
    nossaIndicacao: "Nossa indicação:",
    verPeca: "Ver esta peça",
    valueLabelFixacao: "Fixação",
    valueLabelNatural: "Acabamento natural",
  },
  en: {
    filtros: [
      { id: "todas", rotulo: "All" },
      { id: "lisa", rotulo: "Straight" },
      { id: "cacheada", rotulo: "Curly" },
      { id: "crespa", rotulo: "Coily" },
      { id: "afro", rotulo: "Afro" },
    ],
    textura: { lisa: "Straight", cacheada: "Curly", crespa: "Coily", afro: "Afro" },
    valor: {
      "micropele-008": "Best seller",
      "micropele-006": "Most discreet",
      "cacho-aberto": "Natural movement",
      "cacho-fechado": "Defined curls",
      afro: "Volume and identity",
      "full-lace": "Total lightness",
      australia: "Secure hold",
    },
    titulo: "Compare by texture",
    intro: "Each piece shows who it is best suited for before you open the details.",
    filtroAria: "Filter products by texture",
    vazioFiltro: "We do not have a published piece for this texture yet.",
    guiaEyebrow: "Choose with confidence",
    guiaTitulo: "Not sure which hair system to choose?",
    guiaIntro: "Answer three quick questions and see the piece closest to what you want.",
    abrir: "Find my piece",
    fechar: "Close guide",
    perguntaTextura: "1. Which texture are you looking for?",
    perguntaPrioridade: "2. What matters most to you?",
    perguntaPrimeira: "3. Is this your first piece?",
    frente: "Most discreet front",
    equilibrio: "Daily balance",
    fixacao: "More secure hold",
    texturaIndicacao: "For this texture, we recommend the model made for that finish.",
    escolhaPrimeiro: "Choose the texture first.",
    primeiraSim: "Yes, I want a simple choice",
    primeiraNao: "No, I know what I am looking for",
    nossaIndicacao: "Our recommendation:",
    verPeca: "See this piece",
    valueLabelFixacao: "Hold",
    valueLabelNatural: "Natural finish",
  },
  es: {
    filtros: [
      { id: "todas", rotulo: "Todas" },
      { id: "lisa", rotulo: "Lisa" },
      { id: "cacheada", rotulo: "Rizada" },
      { id: "crespa", rotulo: "Crespa" },
      { id: "afro", rotulo: "Afro" },
    ],
    textura: { lisa: "Lisa", cacheada: "Rizada", crespa: "Crespa", afro: "Afro" },
    valor: {
      "micropele-008": "Mas vendida",
      "micropele-006": "Mas discreta",
      "cacho-aberto": "Movimiento natural",
      "cacho-fechado": "Rizos definidos",
      afro: "Volumen e identidad",
      "full-lace": "Ligereza total",
      australia: "Fijacion segura",
    },
    titulo: "Compara por textura",
    intro: "Cada pieza muestra para quien esta indicada antes de abrir los detalles.",
    filtroAria: "Filtrar productos por textura",
    vazioFiltro: "Todavia no tenemos una pieza publicada para esta textura.",
    guiaEyebrow: "Elige con seguridad",
    guiaTitulo: "No sabes cual protesis elegir?",
    guiaIntro: "Responde tres preguntas rapidas y mira la pieza mas cercana a lo que buscas.",
    abrir: "Encontrar mi pieza",
    fechar: "Cerrar guia",
    perguntaTextura: "1. Que textura buscas?",
    perguntaPrioridade: "2. Que importa mas para ti?",
    perguntaPrimeira: "3. Es tu primera pieza?",
    frente: "Frente mas discreta",
    equilibrio: "Equilibrio para el dia a dia",
    fixacao: "Fijacion mas segura",
    texturaIndicacao: "Para esta textura, indicamos el modelo propio para su acabado.",
    escolhaPrimeiro: "Elige primero la textura.",
    primeiraSim: "Si, quiero una eleccion simple",
    primeiraNao: "No, ya se lo que busco",
    nossaIndicacao: "Nuestra indicacion:",
    verPeca: "Ver esta pieza",
    valueLabelFixacao: "Fijacion",
    valueLabelNatural: "Acabado natural",
  },
};

export function CatalogoGuiado({ locale = "pt", produtos }: { locale?: SiteLocale; produtos: ProdutoGuiado[] }) {
  const copy = CATALOGO_GUIADO_COPY[locale];
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
      <section aria-labelledby="catalogo-titulo" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="catalogo-titulo" className="font-display text-2xl text-ink">{copy.titulo}</h2>
            <p className="text-sm text-ink/70">{copy.intro}</p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label={copy.filtroAria}>
            {copy.filtros.map((opcao) => <Button key={opcao.id} type="button" size="sm" variant={filtro === opcao.id ? "secondary" : "ghost"} onClick={() => setFiltro(opcao.id)}>{opcao.rotulo}</Button>)}
          </div>
        </div>

        {visiveis.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visiveis.map((produto) => (
              <li key={produto.slug}>
                <ProductCard
                  slug={produto.slug}
                  name={produto.titulo}
                  summary={produto.resumo}
                  textureLabel={copy.textura[produto.textura]}
                  imageUrl={produto.imageUrl}
                  imageAlt={produto.imageAlt}
                  priceCents={produto.priceCents}
                  isFeatured={produto.isFeatured}
                  badge={copy.valor[produto.slug] ?? null}
                  valueLabel={produto.prioridade === "fixacao" ? copy.valueLabelFixacao : copy.valueLabelNatural}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        ) : <p className="rounded-md border border-sand px-4 py-3 text-sm text-ink/70">{copy.vazioFiltro}</p>}
      </section>

      <section className="rounded-lg border border-sand bg-sand/30 p-5 sm:p-6" aria-labelledby="guia-titulo">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="eyebrow-ink">{copy.guiaEyebrow}</span>
            <h2 id="guia-titulo" className="mt-1 font-display text-2xl text-ink">{copy.guiaTitulo}</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink/70">{copy.guiaIntro}</p>
          </div>
          <Button type="button" variant={guiaAberto ? "ghost" : "primary"} onClick={() => { setGuiaAberto((aberto) => !aberto); if (guiaAberto) reiniciarGuia(); }}>
            {guiaAberto ? copy.fechar : copy.abrir}
          </Button>
        </div>

        {guiaAberto ? (
          <div className="mt-5 grid gap-5 border-t border-sand pt-5 md:grid-cols-3">
            <Pergunta titulo={copy.perguntaTextura}>
              {(["lisa", "cacheada", "crespa", "afro"] as TexturaCatalogo[]).map((opcao) => (
                <Opcao key={opcao} ativa={textura === opcao} onClick={() => { setTextura(opcao); setPrioridade(opcao === "lisa" ? null : "textura"); }}>
                  {copy.textura[opcao]}
                </Opcao>
              ))}
            </Pergunta>
            <Pergunta titulo={copy.perguntaPrioridade}>
              {textura === "lisa" ? <>
                <Opcao ativa={prioridade === "discricao"} onClick={() => setPrioridade("discricao")}>{copy.frente}</Opcao>
                <Opcao ativa={prioridade === "equilibrio"} onClick={() => setPrioridade("equilibrio")}>{copy.equilibrio}</Opcao>
                <Opcao ativa={prioridade === "fixacao"} onClick={() => setPrioridade("fixacao")}>{copy.fixacao}</Opcao>
              </> : textura ? <p className="text-sm text-ink/70">{copy.texturaIndicacao}</p> : <p className="text-sm text-ink/60">{copy.escolhaPrimeiro}</p>}
            </Pergunta>
            <Pergunta titulo={copy.perguntaPrimeira}>
              <Opcao ativa={primeiraPeca === true} onClick={() => setPrimeiraPeca(true)}>{copy.primeiraSim}</Opcao>
              <Opcao ativa={primeiraPeca === false} onClick={() => setPrimeiraPeca(false)}>{copy.primeiraNao}</Opcao>
              {recomendado && primeiraPeca !== null ? (
                <div className="mt-3 rounded-md bg-paper p-3">
                  <p className="font-semibold text-ink">{copy.nossaIndicacao} {recomendado.titulo}</p>
                  <p className="mt-1 text-sm text-ink/70">{recomendado.resumo}</p>
                  <Link className="mt-3 inline-flex text-sm font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4" href={localizePath(`/produtos/${recomendado.slug}`, locale)}>{copy.verPeca}</Link>
                </div>
              ) : null}
            </Pergunta>
          </div>
        ) : null}
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
