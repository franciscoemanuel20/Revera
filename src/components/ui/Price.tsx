// Formata centavos em BRL — único lugar que faz essa conta na UI, para não
// espalhar `.toFixed(2)` divergente pela loja. Não decide preço nenhum,
// só formata o que já veio calculado (ver src/lib/pricing/discount.ts).
function formatarBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export interface PriceProps {
  cents: number;
  compareAtCents?: number | null;
}

export function Price({ cents, compareAtCents }: PriceProps) {
  const temDesconto = compareAtCents != null && compareAtCents > cents;

  return (
    <span className="inline-flex items-baseline gap-2">
      {temDesconto ? (
        <span className="text-sm text-ink/50 line-through">
          {formatarBRL(compareAtCents!)}
        </span>
      ) : null}
      <span className="font-display text-lg font-semibold text-ink">
        {formatarBRL(cents)}
      </span>
    </span>
  );
}
