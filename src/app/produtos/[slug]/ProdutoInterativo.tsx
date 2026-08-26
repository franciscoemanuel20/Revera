"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ColorSelector, type ColorOption } from "@/components/ui/ColorSelector";
import { Price } from "@/components/ui/Price";
import { QuantitySelector } from "@/components/ui/QuantitySelector";
import { TrustBar } from "@/components/ui/TrustBar";
import { applyQuantityDiscount, type QuantityDiscountRule } from "@/lib/pricing/discount";
import { formatarBRL } from "@/lib/format/money";

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

// Ilha de interatividade da página de produto — a página em si (page.tsx) é
// server component (busca no Supabase); aqui só vive o estado de UI
// (cor/quantidade selecionada), mesmo padrão do ProductForm do admin.
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

  const resultadoDesconto = varianteSelecionada
    ? applyQuantityDiscount(varianteSelecionada.priceCents, quantidade, discountRules)
    : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-sand">
            <Image
              src="/media/hero/produto-close-1.jpeg"
              alt={`Close da base ${name}`}
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              className="object-cover"
              priority
            />
          </div>
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-sand">
            <Image
              src="/media/hero/produto-close-2.jpeg"
              alt={`Detalhe da linha frontal — ${name}`}
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
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

          <QuantitySelector value={quantidade} onChange={setQuantidade} />

          {discountRules.length > 0 && varianteSelecionada ? (
            <ul className="flex flex-col gap-1 text-sm text-ink/70">
              {discountRules.map((regra) => (
                <li key={regra.minQty}>
                  {regra.label ? `${regra.label}: ` : `A partir de ${regra.minQty} unidades: `}
                  {formatarBRL(
                    applyQuantityDiscount(
                      varianteSelecionada.priceCents,
                      regra.minQty,
                      discountRules
                    ).unitPriceCents
                  )}{" "}
                  cada
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button size="lg" disabled title="Em breve">
              Comprar agora — Em breve
            </Button>
            <p className="text-xs text-ink/50">
              A compra pelo site ainda não está disponível — esta é a página
              de apresentação do produto.
            </p>
          </div>

          <TrustBar />
        </div>
      </div>
    </main>
  );
}
