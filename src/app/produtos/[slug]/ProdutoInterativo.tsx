"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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

export interface ProdutoInterativoProps {
  name: string;
  description: string | null;
  baseThicknessMm: number | null;
  variants: VariantData[];
  colors: ColorOption[];
  // `label` não faz parte de QuantityDiscountRule (a função de cálculo não
  // precisa dele) — só a UI usa, para mostrar o texto cadastrado no admin
  // em vez de "a partir de N unidades" quando existir um.
  discountRules: Array<QuantityDiscountRule & { label: string | null }>;
}

// As duas fotos de close reais (public/media/hero) — hoje é sempre este par
// fixo, para qualquer produto, porque só existe uma sessão de fotos feita
// (ver seeds/products.json). Vira galeria de verdade (por produto, no
// banco) quando existir mais de uma sessão — até lá, hard-code aqui é mais
// honesto que inventar um campo `gallery_urls` que nada preenche ainda.
function fotosDoProduto(name: string) {
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
  variants,
  colors,
  discountRules,
}: ProdutoInterativoProps) {
  const router = useRouter();
  const { adicionarItem, abrirDrawer, pendente } = useCart();
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const fotos = useMemo(() => fotosDoProduto(name), [name]);
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

  const [corSelecionadaId, setCorSelecionadaId] = useState<string | null>(
    colors[0]?.id ?? null
  );
  const [quantidade, setQuantidade] = useState(1);

  const varianteSelecionada =
    (corSelecionadaId ? variantePorCor.get(corSelecionadaId) : undefined) ??
    varianteGenerica;

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

  const resultadoDesconto = varianteSelecionada
    ? applyQuantityDiscount(varianteSelecionada.priceCents, quantidade, discountRules)
    : null;

  useEffect(() => {
    if (jaMediuVisualizacao.current) return;
    if (!varianteSelecionada) return;
    jaMediuVisualizacao.current = true;

    medirVerProduto({
      variantId: varianteSelecionada.id,
      nome: name,
      quantidade: 1,
      precoUnitarioCents: varianteSelecionada.priceCents,
    });
  }, [varianteSelecionada, name]);

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

            {varianteSelecionada ? (
              <Price
                cents={resultadoDesconto!.unitPriceCents}
                compareAtCents={varianteSelecionada.compareAtPriceCents}
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
              max={varianteSelecionada?.stockQty}
            />

            {/* Degraus de desconto — só renderiza se existir regra
                cadastrada de verdade (discountRules vem do banco, ver
                page.tsx); nenhum valor aqui é inventado. A faixa que se
                aplica à quantidade atual ganha borda dourada + o quanto se
                economiza em destaque, para a diferença ficar óbvia sem
                precisar fazer conta. */}
            {varianteSelecionada ? (
              <DiscountLadder
                basePriceCents={varianteSelecionada.priceCents}
                currentQuantity={quantidade}
                rules={discountRules}
              />
            ) : null}

            {mensagemErro ? (
              <Toast message={mensagemErro} variant="error" onClose={() => setMensagemErro(null)} />
            ) : null}

            <div className="flex flex-col gap-2">
              {varianteSelecionada ? (
                <Button
                  size="lg"
                  disabled={pendente || varianteSelecionada.stockQty <= 0}
                  onClick={async () => {
                    setMensagemErro(null);
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
                  {varianteSelecionada.stockQty <= 0
                    ? "Fora de estoque"
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
    </main>
  );
}
