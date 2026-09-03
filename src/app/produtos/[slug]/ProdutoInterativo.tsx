"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /**
   * Variante que esta foto retrata, quando ela retrata uma. Nulo para foto
   * genérica do produto (é o caso de todas hoje). Ver page.tsx.
   */
  variantId?: string | null;
  /**
   * Foto de CATÁLOGO DA COR (`colors.photo_url`, /media/cores/*.jpg), não
   * foto do produto. Muda duas coisas na tela: o enquadramento (as fotos da
   * cartela são deitadas, 4:3, e as do produto são em pé, 3:4) e a legenda,
   * que precisa dizer que aquilo é referência de COR — a peça fotografada
   * pode não ser este modelo. Ver `fotoDaCor()`.
   */
  ehFotoDeCor?: boolean;
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
  /**
   * A FOTO GRANDE É GUARDADA PELO `src`, NÃO PELO ÍNDICE (03/09/2026).
   *
   * A galeria deixou de ser uma lista fixa: a foto da cor escolhida entra e
   * sai dela conforme o cliente clica na cartela (ver `galeria` abaixo).
   * Guardando índice, trocar de cor deslocaria a lista e a foto grande
   * mudaria sozinha para a peça errada. O `src` não desloca.
   */
  const [fotoAtivaSrc, setFotoAtivaSrc] = useState<string | null>(null);

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
  /**
   * Cor única não é escolha: já vem marcada (29/08/2026).
   *
   * Fora da Micropele 0,08, a peça só sai na 1B. Obrigar um clique numa
   * cartela de uma bolinha só é atrito sem proteção nenhuma — a trava existe
   * para quem tem várias cores e pode comprar a errada sem perceber.
   */
  const [corSelecionadaId, setCorSelecionadaId] = useState<string | null>(
    colors.length === 1 ? colors[0]!.id : null
  );

  const corSelecionada = colors.find((c) => c.id === corSelecionadaId) ?? null;

  /**
   * A PEÇA NA COR ESCOLHIDA, NA FOTO GRANDE (Francisco, 03/09/2026).
   *
   * Pedido dele: "quando selecionar a prótese embaixo, trocar a imagem em
   * cima, para o cliente conseguir visualizar a cor". Numa prótese capilar a
   * cor É o pedido — escolher olhando uma bolinha de 44px é escolher no
   * escuro, e a foto de cima ficava a mesma nas quinze cores da Micropele
   * 0,08.
   *
   * De onde a foto sai, NESTA ordem:
   *
   *   1. foto do PRODUTO amarrada à variante daquela cor
   *      (`product_media.variant_id`). É a melhor que existe: é ESTA peça,
   *      nesta cor. Hoje (03/09/2026) nenhuma linha do banco tem variant_id
   *      preenchido — o gancho já estava no schema e nunca havia sido lido.
   *      Quando alguém fotografar peça por peça, entra por aqui sozinho.
   *   2. a foto de catálogo da cor (`colors.photo_url`, /media/cores/*.jpg):
   *      a mesma que a página /cores mostra, a peça de verdade com o código
   *      escrito no canto. O que ela NÃO garante é ser este modelo — daí a
   *      legenda dizer "referência da cartela" em vez de fingir que é a
   *      Afro. As quinze cores têm essa foto; conferido no banco em 03/09.
   *
   * Sem nenhuma das duas, a foto grande não muda. Melhor não trocar nada do
   * que mostrar uma peça e chamá-la de outra.
   */
  const fotoDaCor = useCallback(
    (corId: string | null): FotoProduto | null => {
      if (!corId) return null;
      const cor = colors.find((c) => c.id === corId);
      if (!cor) return null;

      const variante = variantePorCor.get(corId);
      const doProduto = variante
        ? fotos.find((f) => f.variantId === variante.id)
        : undefined;
      if (doProduto) return doProduto;

      /**
       * A foto da cartela só entra onde existe cor A ESCOLHER.
       *
       * Fora da Micropele 0,08 a peça sai só na 1B — não há comparação a
       * fazer, e a foto da cartela mostra uma peça LISA. Na página da Afro
       * ela apareceria como "a cor da Afro" e diria uma coisa falsa sobre a
       * textura. A foto do próprio produto já mostra a Afro na 1B.
       *
       * Isto vale só para a foto de catálogo: foto do produto amarrada à
       * variante (o `if` acima) é esta peça nesta cor e passa sempre, com
       * uma cor ou com quinze.
       */
      if (colors.length < 2) return null;
      if (!cor.photoUrl) return null;
      return {
        src: cor.photoUrl,
        alt: `Cor ${cor.name} — foto de referência da cartela Reverá`,
        ehFotoDeCor: true,
      };
    },
    [colors, variantePorCor, fotos]
  );

  const fotoDaCorEscolhida = useMemo(
    () => fotoDaCor(corSelecionadaId),
    [fotoDaCor, corSelecionadaId]
  );

  /**
   * A foto da cor entra NO FIM da tira de miniaturas, nunca no começo: as
   * fotos do produto são as mesmas em toda visita, e vê-las pularem de lugar
   * a cada clique na cartela custaria mais do que o detalhe vale.
   */
  const galeria = useMemo(() => {
    if (!fotoDaCorEscolhida) return fotos;
    if (fotos.some((f) => f.src === fotoDaCorEscolhida.src)) return fotos;
    return [...fotos, fotoDaCorEscolhida];
  }, [fotos, fotoDaCorEscolhida]);

  // noUncheckedIndexedAccess (tsconfig) trata galeria[i] como possivelmente
  // undefined — daí o `!`, que aqui é verdade: `fotosDoProduto()` nunca
  // devolve lista vazia (tem o par genérico de /media/hero como piso).
  const fotoAtiva = galeria.find((f) => f.src === fotoAtivaSrc) ?? galeria[0]!;

  /**
   * Escolher a cor troca a foto grande. Sem foto para aquela cor, só a cor
   * muda — a imagem fica onde estava, de propósito.
   */
  function escolherCor(corId: string) {
    setCorSelecionadaId(corId);
    const foto = fotoDaCor(corId);
    if (foto) setFotoAtivaSrc(foto.src);
  }
  const [quantidade, setQuantidade] = useState(1);
  /**
   * CONFIRMAÇÃO DISCRETA, NO LUGAR DO DRAWER (29/08/2026).
   *
   * Antes, adicionar abria a sacola por cima da página: a pessoa que queria
   * levar três peças tinha que fechar o painel a cada item. Agora a página
   * fica onde está e só avisa. `chave` existe para o aviso reaparecer quando
   * a mesma pessoa adiciona de novo — sem ela, o segundo clique não mostra
   * nada porque a mensagem já era a mesma.
   */
  const [confirmacao, setConfirmacao] = useState<{ texto: string; chave: number } | null>(null);

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

  // O aviso some sozinho depois de 4s — tempo de ler sem virar entulho na
  // tela de quem está escolhendo a próxima peça.
  useEffect(() => {
    if (!confirmacao) return;
    const t = setTimeout(() => setConfirmacao(null), 4000);
    return () => clearTimeout(t);
  }, [confirmacao]);

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
        {/* `sm:sticky` — a galeria acompanha a rolagem enquanto o cliente
            passa pelas cores, quantidade e degraus de desconto. No celular
            fica no fluxo normal: grudar a imagem lá comeria metade da tela
            de quem já está decidindo. */}
        {/* `min-w-0`: item de grade nasce com `min-width: auto`, ou seja,
            não encolhe abaixo do próprio conteúdo — a tira de miniaturas
            (352px com cinco) esticava esta coluna para 352px dentro de uma
            grade de 327px, e a foto grande crescia junto. O overflow-x da
            tira sozinho não resolve; quem precisa poder encolher é a coluna. */}
        <div className="min-w-0 sm:sticky" style={{ top: HEADER_HEIGHT_PX + 24 }}>
        <Reveal className="flex flex-col gap-3">
          {/* O ENQUADRAMENTO SEGUE A FOTO — MAS SÓ A PARTIR DO `sm` (03/09/2026).
              
              As fotos do produto são em pé (3:4); as da cartela de cores são
              deitadas (4:3, é como a página /cores já as mostra). Cortar a
              foto da cor num quadro em pé comeria as laterais da peça e o
              código escrito no canto — justamente o que o cliente abriu para
              ver.

              Por que a proporção só muda no `sm` para cima: dali em diante a
              galeria e o painel de compra são COLUNAS IRMÃS (sm:grid-cols-2),
              e encolher a coluna da esquerda não mexe um pixel na cartela, do
              outro lado. No celular é uma coluna só, a cartela fica ABAIXO da
              foto — trocar a altura do quadro subiria a cartela ~190px no
              instante seguinte ao toque, tirando do lugar a bolinha que o
              dedo acabou de tocar. Então no celular o quadro fica parado e a
              foto da cor entra inteira dentro dele (object-contain), com as
              faixas em `bg-sand`. Vale a folga: a alternativa é a página
              pular na mão de quem está escolhendo. */}
          <div
            className={`group relative w-full overflow-hidden rounded-lg bg-sand aspect-[3/4] ${
              fotoAtiva.ehFotoDeCor ? "sm:aspect-[4/3]" : ""
            }`}
          >
            <Image
              src={fotoAtiva.src}
              alt={fotoAtiva.alt}
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              className={`transition-transform duration-500 ease-out group-hover:scale-[1.03] ${
                fotoAtiva.ehFotoDeCor ? "object-contain sm:object-cover" : "object-cover"
              }`}
              priority
            />
          </div>
          {/* A legenda só aparece na foto da cartela, e diz o que ela é: a
              peça fotografada mostra a COR, não necessariamente este modelo.
              Some sozinha quando existir foto do produto por variante. */}
          {fotoAtiva.ehFotoDeCor && corSelecionada ? (
            <p className="text-sm text-ink/60">
              Cor {corSelecionada.name} — foto de referência da cartela.
            </p>
          ) : null}
          {/* A TIRA ROLA NA HORIZONTAL (03/09/2026).
              
              Cinco miniaturas de 64px com folga de 8px dão 352px — mais que
              os 328px úteis de um celular de 375px. Sem isto a tira empurra a
              coluna para 352px, e a FOTO GRANDE cresce junto (medido: 436px
              de altura viram 469px, a cartela desce 65px no instante do
              toque). O estouro não nasceu com a foto da cor: qualquer produto
              com cinco fotos cadastradas já o provocava. */}
          {galeria.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto">
              {galeria.map((foto, i) => (
                <button
                  key={foto.src}
                  type="button"
                  aria-label={
                    foto.ehFotoDeCor && corSelecionada
                      ? `Ver a cor ${corSelecionada.name}`
                      : `Ver foto ${i + 1} de ${galeria.length}`
                  }
                  aria-pressed={fotoAtiva.src === foto.src}
                  onClick={() => {
                    setFotoAtivaSrc(foto.src);
                    /**
                     * Foto de uma cor específica também ESCOLHE a cor
                     * (29/08/2026). Se a pessoa clica na foto da peça na cor
                     * 5, ela está dizendo "quero essa" — e o pedido tem que
                     * sair com a cor 5, não com a que estava marcada antes.
                     * Só age quando a foto tem variante; foto genérica
                     * continua sendo só troca de imagem.
                     */
                    const corDaFoto = foto.variantId
                      ? variants.find((v) => v.id === foto.variantId)?.colorId
                      : null;
                    if (corDaFoto) setCorSelecionadaId(corDaFoto);
                  }}
                  className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                    fotoAtiva.src === foto.src ? "border-gold" : "border-sand"
                  }`}
                >
                  {/* `sizes` explícito: sem ele o Next pede a foto em 3840px
                      para uma miniatura de 64px — o mesmo defeito que a
                      cartela de cores tinha. 128px cobre telas 2x. */}
                  <Image src={foto.src} alt="" fill sizes="128px" className="object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </Reveal>
        </div>

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
                onChange={escolherCor}
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
                    setConfirmacao({
                      texto: "Produto adicionado ao carrinho",
                      chave: Date.now(),
                    });
                  }}
                >
                  {varianteExibicao.stockQty <= 0
                    ? "Fora de estoque"
                    : faltaEscolherCor
                      ? "Escolha uma cor"
                      : pendente
                        ? "Adicionando…"
                        : "Adicionar ao carrinho"}
                </Button>
              ) : (
                <Button size="lg" disabled title="Em breve">
                  Adicionar ao carrinho — Em breve
                </Button>
              )}
              {confirmacao ? (
                <div
                  key={confirmacao.chave}
                  role="status"
                  aria-live="polite"
                  className="flex items-center justify-between gap-3 rounded-md bg-moss px-4 py-3 text-sm text-paper"
                >
                  <span>{confirmacao.texto}</span>
                  <button
                    type="button"
                    onClick={abrirDrawer}
                    className="shrink-0 underline underline-offset-2 opacity-90 hover:opacity-100"
                  >
                    ver sacola
                  </button>
                </div>
              ) : null}
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
