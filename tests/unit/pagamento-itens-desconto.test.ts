import { describe, expect, it } from "vitest";
import { montarItensDoPagamento } from "@/lib/payments/itens";

function total(linhas: Array<{ quantity: number; priceCents: number }>) {
  return linhas.reduce((soma, linha) => soma + linha.quantity * linha.priceCents, 0);
}

describe("montarItensDoPagamento", () => {
  it("rateia desconto para as linhas somarem o total cobrado no gateway", () => {
    const linhas = montarItensDoPagamento({
      itens: [
        {
          product_name_snapshot: "Micropele",
          variant_label_snapshot: "Cor 1B",
          quantity: 3,
          unit_price_cents: 65000,
        },
      ],
      shippingCents: 3500,
      discountCents: 30000,
      idiomaPagamento: "pt",
    });

    expect(total(linhas)).toBe(168500);
    expect(linhas.at(-1)).toMatchObject({
      description: "Frete",
      quantity: 1,
      priceCents: 3500,
    });
  });

  it("preserva centavos quando o desconto nao divide igualmente pela quantidade", () => {
    const linhas = montarItensDoPagamento({
      itens: [
        {
          product_name_snapshot: "Micropele",
          variant_label_snapshot: "Cor 2",
          quantity: 3,
          unit_price_cents: 10000,
        },
      ],
      shippingCents: 0,
      discountCents: 5000,
      idiomaPagamento: "pt",
    });

    expect(total(linhas)).toBe(25000);
    expect(linhas.every((linha) => linha.priceCents > 0)).toBe(true);
  });

  it("recusa desconto maior que o valor dos produtos", () => {
    expect(() =>
      montarItensDoPagamento({
        itens: [
          {
            product_name_snapshot: "Micropele",
            variant_label_snapshot: null,
            quantity: 1,
            unit_price_cents: 1000,
          },
        ],
        shippingCents: 0,
        discountCents: 1000,
        idiomaPagamento: "pt",
      })
    ).toThrow(/Desconto/);
  });
});
