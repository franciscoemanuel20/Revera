// Degraus de desconto por quantidade — extraído de ProdutoInterativo.tsx
// (26/08/2026) para o carrinho (src/app/carrinho) também mostrar "quanto eu
// economizo comprando mais" por item, sem duplicar a mesma conta em dois
// lugares (ver docstring do projeto sobre reusar componentes, não recriar).
// Sempre chama applyQuantityDiscount — nunca recalcula preço na mão — para
// nunca divergir da função que decide o preço de verdade
// (src/lib/pricing/discount.ts). É o mecanismo comercial central do
// projeto: por isso vive num componente só, chamado dos dois lugares que
// precisam dele, em vez de reescrito.
import { applyQuantityDiscount, type QuantityDiscountRule } from "@/lib/pricing/discount";
import { formatarBRL } from "@/lib/format/money";

export interface DiscountLadderProps {
  basePriceCents: number;
  currentQuantity: number;
  rules: Array<QuantityDiscountRule & { label: string | null }>;
  className?: string;
}

export function DiscountLadder({ basePriceCents, currentQuantity, rules, className = "" }: DiscountLadderProps) {
  if (rules.length === 0) return null;

  const resultadoAtual = applyQuantityDiscount(basePriceCents, currentQuantity, rules);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span className="eyebrow-ink">Comprando mais, o preço cai</span>
      <div className="grid gap-2 sm:grid-cols-3">
        {rules.map((regra) => {
          const resultadoFaixa = applyQuantityDiscount(basePriceCents, regra.minQty, rules);
          // discountCents já vem calculado pela mesma função pura que
          // decide o preço — não recalcula na mão aqui, para nunca
          // divergir dela.
          const economiaCents = resultadoFaixa.discountCents;
          const faixaAtiva = resultadoAtual.appliedRule?.minQty === regra.minQty;

          return (
            <div
              key={regra.minQty}
              className={`rounded-lg border p-3 text-sm transition-colors ${
                faixaAtiva ? "border-gold bg-gold/5" : "border-sand"
              }`}
            >
              <p className="font-semibold text-ink">
                {regra.label ?? `A partir de ${regra.minQty} unidades`}
              </p>
              <p className="text-ink/70">{formatarBRL(resultadoFaixa.unitPriceCents)} cada</p>
              {economiaCents > 0 ? (
                <p className="mt-1 text-xs font-semibold text-gold-deep">
                  Economize {formatarBRL(economiaCents)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
