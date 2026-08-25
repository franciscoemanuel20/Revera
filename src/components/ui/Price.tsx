// Formatação de centavos em BRL mora em src/lib/format/money.ts (o admin,
// fase 2, também precisa dela) — aqui só consome. Não decide preço nenhum,
// só formata o que já veio calculado (ver src/lib/pricing/discount.ts).
import { formatarBRL } from "@/lib/format/money";

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
