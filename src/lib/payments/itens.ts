export function montarItensDoPagamento({
  itens,
  shippingCents,
  discountCents,
  idiomaPagamento,
}: {
  itens: Array<{
    product_name_snapshot: string | null;
    variant_label_snapshot: string | null;
    quantity: number | null;
    unit_price_cents: number | null;
  }>;
  shippingCents: number;
  discountCents: number;
  idiomaPagamento: "pt" | "en" | "es";
}) {
  const linhas = itens.map((item) => ({
    description: [item.product_name_snapshot, item.variant_label_snapshot]
      .filter(Boolean)
      .join(" - "),
    quantity: Number(item.quantity ?? 0),
    priceCents: Number(item.unit_price_cents ?? 0),
  }));

  let descontoRestante = Math.max(0, Math.trunc(discountCents));
  for (let indice = linhas.length - 1; indice >= 0 && descontoRestante > 0; indice -= 1) {
    const linha = linhas[indice];
    if (!linha || linha.quantity <= 0) continue;
    const totalLinha = linha.priceCents * linha.quantity;
    const abatimento = Math.min(totalLinha - linha.quantity, descontoRestante);
    if (abatimento <= 0) continue;

    const novoTotal = totalLinha - abatimento;
    const precoUnitario = Math.floor(novoTotal / linha.quantity);
    const resto = novoTotal - precoUnitario * linha.quantity;
    linha.priceCents = precoUnitario;
    descontoRestante -= abatimento;

    if (resto > 0) {
      linhas.splice(indice + 1, 0, {
        ...linha,
        quantity: 1,
        priceCents: precoUnitario + resto,
      });
      linha.quantity -= 1;
    }
  }

  if (descontoRestante > 0) {
    throw new Error("Desconto do pedido maior que as linhas de pagamento.");
  }

  return [
    ...linhas.filter((linha) => linha.quantity > 0 && linha.priceCents > 0),
    ...(shippingCents > 0
      ? [
          {
            description:
              idiomaPagamento === "en"
                ? "DHL shipping"
                : idiomaPagamento === "es"
                  ? "Envio DHL"
                  : "Frete",
            quantity: 1,
            priceCents: shippingCents,
          },
        ]
      : []),
  ];
}
