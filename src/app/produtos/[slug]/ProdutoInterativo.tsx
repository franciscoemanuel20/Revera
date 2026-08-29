"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ColorSelector, type ColorOption } from "@/components/ui/ColorSelector";
import { DiscountLadder } from "@/components/ui/DiscountLadder";
import { Price } from "@/components/ui/Price";
import { QuantitySelector } from "@/components/ui/QuantitySelector";
import { Reveal } from "@/components/ui/Reveal";
import { Toast } from "@/components/ui/Toast";
import { TrustBar } from "@/components/ui/TrustBar";
import { medirAdicionarAoCarrinho, medirVerProduto } from "@/lib/tracking/browser";
import { useCart } from "@/components/cart/CartProvider";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { applyQuantityDiscount, type QuantityDiscountRule } from "@/lib/pricing/discount";

interface VariantData {
  id: string;
  colorId: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  sku: string;
  stockQty: number;
}

export interface FotoProduto {
  src: string;
  alt: string;
}

export interface ProdutoInterativoProps {
  name: string;
  description: string | null;
  baseThicknessMm: number | null;
  /**
   * Fotos vindas de `product_media` (ordenadas por is_primary, sort_order).
   * Vazio para produto que ainda não tem foto cadastrada — aí cai no par
   * genérico de `/media/hero`, ver `fotosDoProduto()`.
   */
  fotos: FotoProduto[];
  variants: VariantData[];
  colors: ColorOption[];
  // `label` não faz parte de QuantityDiscountRule (a função de cálculo não
  // precisa dele) — só a UI usa, para mostrar o texto cadastrado no admin
  // em vez de "a partir de N unidades" quando existir um.
  discountRules: Array<QuantityDiscountRule & { label: string | null }>;
  /**
   * Os outros produtos ativos — cacheado, crespo, afro. Não são variantes
   * desta peça: são produtos próprios, com preço próprio. Ver page.tsx.
   */
  outrasTexturas?: Array<{
    slug: string;
    name: string;
    priceCents: number | null;
    imageUrl: string | null;
  }>;
}

// Galeria do produto. Desde 27/08/2026 as fotos vêm de `product_media`, uma
// por produto — antes disso era um par FIXO de `/media/hero` para qualquer
// produto, o que faria a Afro aparecer com a foto da Micropele assim que
// existisse mais de um produto publicado.
//
// O par de `/media/hero` continua como fallback para o produto que ainda não
// tem foto cadastrada (hoje as duas Micropele): mostrar o close genérico da
// marca é melhor que uma área vazia, e some sozinho quando alguém cadastrar
// a foto de verdade pelo admin.
function fotosDoProduto(name: string, doBanco: FotoProduto[]): FotoProduto[] {
  if (doBanco.length > 0) return doBanco;
  return [
    { src: "/media/hero/produto-close-1.jpeg", alt: `Close da base ${name}` },
    { src: "/media/hero/produto-close-2.jpeg", alt: `Detalhe da linha frontal — ${name}` },
  ];
}

// Ilha de interatividade da página de produto — a página em si (page.tsx) é
// server component (busca no Supabase); aqui só vive o estado de UI
// (cor/quantidade/imagem selecionada), mesmo padrão do ProductForm do admin.
//
// Variante x cor: hoje (25/08/2026) a Micropele tem uma única variante
// "genérica" (color_id null, ver seeds/products.json) — nenhuma cor tem
// preço próprio ainda. Por isso a busca abaixo é por color_id quando
// existir variante específica daquela cor, e cai para a variante sem cor
// (genérica) caso contrário: a UI já suporta o dia em que existirem
// variantes por cor, sem precisar reescrever nada.
export function ProdutoInterativo({
  name,
  description,
  baseThicknessMm,
  fotos: fotosDoBanco,
  variants,
  colors,
  discountRules,
  outrasTexturas = [],
}: ProdutoInterativoProps) {
  const router = useRouter();
  const { adicionarItem, abrirDrawer, pendente } = useCart();
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const fotos = useMemo(
    () => fotosDoProduto(name, fotosDoBanco),
    [name, fotosDoBanco]
  );
  const [fotoAtivaIndex, setFotoAtivaIndex] = useState(0);
  // noUncheckedIndexedAccess (tsconfig) trata fotos[i] como possivelmente
  // undefined — cai para a primeira foto se o índice guardado no estado
  // sair da faixa por algum motivo (não deveria, mas o tipo não sabe disso).
  const fotoAtiva = fotos[fotoAtivaIndex] ?? fotos[0]!;

  const variantePorCor = useMemo(() => {
    const mapa = new Map<string, VariantData>();
    for (const v of variants) {
      if (v.colorId) mapa.set(v.colorId, v);
    }
    return mapa;
  }, [variants]);

  const varianteGenerica = variants.find((v) => v.colorId == null) ?? null;

  /**
   * NADA pré-selecionado (29/08/2026).
   *
   * Antes começava em `colors[0]`, a cor 1B. Quem não reparasse na cartela
   * comprava 1B sem ter escolhido — numa prótese capilar, a cor É o pedido.
   * Agora a compra fica travada até a pessoa escolher, e o botão diz o que
   * falta em vez de ficar cinza sem explicação.
   */
  const [corSelecionadaId, setCorSelecionadaId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState(1);

  const varianteSelecionada =
    (corSelecionadaId ? variantePorCor.get(corSelecionadaId) : undefined) ??
    varianteGenerica;

  /**
   * A variante usada só para MOSTRAR preço e degraus antes de a cor ser
   * escolhida. Não é a que vai para o carrinho — quem decide isso é
   * `podeComprar` logo abaixo.
   */
  const varianteExibicao = varianteSelecionada ?? variants[0] ?? null;

  /** Produto com cartela exige cor explícita; produto sem cartela, não. */
  const faltaEscolherCor = colors.length > 0 && !corSelecionadaId;
  const podeComprar = Boolean(varianteSelecionada) && !faltaEscolherCor;

  /**
   * ViewContent — uma vez por visita à página do produto (P1, 27/08/2026).
   *
   * As funções `medirVerProduto` e `medirAdicionarAoCarrinho` existiam
   * completas em src/lib/tracking/browser.ts desde a primeira entrega de
   * rastreamento e NUNCA eram chamadas — a auditoria de 26/08 encontrou o
   * funil com um buraco no meio: PageView e InitiateCheckout saíam, os dois
   * passos entre eles não. Sem AddToCart não existe público de remarketing de
   * carrinho, que costuma ser o que mais converte.
   *
   * O ref existe porque o React roda efeitos duas vezes em desenvolvimento
   * (StrictMode) e porque trocar de cor ou de quantidade re-renderiza — nada
   * disso é uma nova visualização de produto.
   */
  const jaMediuVisualizacao = useRef(false);

  const resultadoDesconto = varianteExibicao
    ? applyQuantityDiscount(varianteExibicao.priceCents, quantidade, discountRules)
    : null;

  useEffect(() => {
    if (jaMediuVisualizacao.current) return;
    if (!varianteExibicao) return;
    jaMediuVisualizacao.current = true;

    medirVerProduto({
      variantId: varianteExibicao.id,
      nome: name,
      quantidade: 1,
      precoUnitarioCents: varianteExibicao.priceCents,
    });
  }, [varianteExibicao, name]);

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <div className="grid gap-8 sm:grid-cols-2 lg:items-start">
        {/* Galeria — miniatura clicável troca a foto principal; hover na
            foto principal dá o leve zoom (scale 1.03) pedido para fotos de
            produto/cor, dentro de container overflow-hidden (nunca anima
            width/height, só transform). */}
        <Reveal className="flex flex-col gap-3">
          <div className="group relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-sand">
            <Image
              src={fotoAtiva.src}
              alt={fotoAtiva.alt}
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
              priority
            />
          </div>
          {fotos.length > 1 ? (
            <div className="flex gap-2">
              {fotos.map((foto, i) => (
                <button
                  key={foto.src}
                  type="button"
                  aria-label={`Ver foto ${i + 1} de ${fotos.length}`}
                  aria-pressed={fotoAtivaIndex === i}
                  onClick={() => setFotoAtivaIndex(i)}
                  className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                    fotoAtivaIndex === i ? "border-gold" : "border-sand"
                  }`}
                >
                  <Image src={foto.src} alt="" fill className="object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </Reveal>

        {/* Painel de compra — sticky no desktop (lg:sticky), logo abaixo do
            header fixo (top = altura do header + respiro). No mobile segue
            no fluxo normal, como já era antes desta entrega. O elemento
            sticky é ESTE div de fora; o Reveal fica por dentro só cuidando
            do fade — sticky aninhado em dois níveis se comporta de forma
            imprevisível entre navegadores. */}
        <div className="lg:sticky lg:self-start" style={{ top: HEADER_HEIGHT_PX + 24 }}>
          <Reveal delayMs={100} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="eyebrow-ink">Reverá</span>
              <h1 className="font-display text-3xl text-ink">{name}</h1>
              {description ? <p className="text-ink/80">{description}</p> : null}
              {baseThicknessMm != null ? (
                <p className="text-sm text-ink/60">
                  Espessura da base: {baseThicknessMm.toLocaleString("pt-BR")}mm
                </p>
              ) : null}
            </div>

            {varianteExibicao ? (
              <Price
                cents={resultadoDesconto!.unitPriceCents}
                compareAtCents={varianteExibicao.compareAtPriceCents}
              />
            ) : (
              <p className="text-ink/60">
                Preço em definição — em breve disponível para compra.
              </p>
            )}

            {colors.length > 0 ? (
              <ColorSelector
                colors={colors}
                selectedId={corSelecionadaId}
                onChange={setCorSelecionadaId}
                onNeedHelp={() => router.push("/cores#ajuda")}
              />
            ) : null}

            <QuantitySelector
              value={quantidade}
              onChange={setQuantidade}
              max={varianteExibicao?.stockQty}
            />

            {/* Degraus de desconto — só renderiza se existir regra
                cadastrada de verdade (discountRules vem do banco, ver
                page.tsx); nenhum valor aqui é inventado. A faixa que se
                aplica à quantidade atual ganha borda dourada + o quanto se
                economiza em destaque, para a diferença ficar óbvia sem
                precisar fazer conta. */}
            {varianteExibicao ? (
              <DiscountLadder
                basePriceCents={varianteExibicao.priceCents}
                currentQuantity={quantidade}
                rules={discountRules}
              />
            ) : null}

            {mensagemErro ? (
              <Toast message={mensagemErro} variant="error" onClose={() => setMensagemErro(null)} />
            ) : null}

            <div className="flex flex-col gap-2">
              {varianteExibicao ? (
                <Button
                  size="lg"
                  disabled={pendente || !podeComprar || varianteExibicao.stockQty <= 0}
                  onClick={async () => {
                    setMensagemErro(null);
                    if (!varianteSelecionada || faltaEscolherCor) {
                      setMensagemErro("Escolha a cor da prótese antes de continuar.");
                      return;
                    }
                    const { erro } = await adicionarItem(varianteSelecionada.id, quantidade);
                    if (erro) {
                      setMensagemErro(erro);
                      return;
                    }
                    // AddToCart só DEPOIS de o servidor confirmar (P1,
                    // 27/08/2026). Medir no clique contaria estoque esgotado e
                    // erro de rede como intenção de compra, e o público de
                    // remarketing nasceria com gente que nunca conseguiu
                    // colocar nada na sacola.
                    medirAdicionarAoCarrinho({
                      variantId: varianteSelecionada.id,
                      nome: name,
                      quantidade,
                      precoUnitarioCents: resultadoDesconto?.unitPriceCents ?? varianteSelecionada.priceCents,
                    });
                    abrirDrawer();
                  }}
                >
                  {varianteExibicao.stockQty <= 0
                    ? "Fora de estoque"
                    : faltaEscolherCor
                      ? "Escolha uma cor"
                      : pendente
                        ? "Adicionando…"
                        : "Comprar agora"}
                </Button>
              ) : (
                <Button size="lg" disabled title="Em breve">
                  Comprar agora — Em breve
                </Button>
              )}
              <p className="text-xs text-ink/50">
                Frete calculado na próxima etapa, pelo CEP de entrega.
              </p>
            </div>

            <TrustBar />
          </Reveal>
        </div>
      </div>

      {/* OUTRAS TEXTURAS — cacheado, crespo e afro são produtos próprios, com
          preço próprio, e até 29/08/2026 não eram linkados de lugar nenhum.
          Quem chega aqui procurando cacheado precisa conseguir chegar lá. */}
      {outrasTexturas.length > 0 ? (
        <section className="flex flex-col gap-4 border-t border-sand pt-8">
          <div className="flex flex-col gap-1">
            <span className="eyebrow-ink">Outras texturas</span>
            <p className="text-sm text-ink/60">
              Cacheada, crespa e afro são peças próprias, com trama e preço
              próprios — não é a mesma peça em outro acabamento.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {outrasTexturas.map((outro) => (
              <li key={outro.slug}>
                <Link
                  href={`/produtos/${outro.slug}`}
                  className="group flex items-center gap-3 rounded-lg border border-sand p-3 transition-shadow duration-300 hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-sand">
                    {outro.imageUrl ? (
                      <Image
                        src={outro.imageUrl}
                        alt={outro.name}
                        fill
                        sizes="112px"
                        className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
                      />
                    ) : null}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-ink">{outro.name}</span>
                    {outro.priceCents != null ? (
                      <span className="text-sm text-ink/60">
                        {(outro.priceCents / 100).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
