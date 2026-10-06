import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tracking/config", () => ({
  GOOGLE_TAG_ID: "G-TEST",
  META_PIXEL_ID: "123",
  MOEDA: "BRL",
  centavosParaMoeda: (centavos: number) => centavos / 100,
}));

describe("rastreamento do funil internacional", () => {
  const fbq = vi.fn();
  const gtag = vi.fn();

  beforeEach(() => {
    fbq.mockClear();
    gtag.mockClear();
    vi.stubGlobal("window", { fbq, gtag });
  });

  it("envia ViewContent e AddToCart em USD sem contaminar o funil BRL", async () => {
    const { medirAdicionarAoCarrinho, medirVerProduto } = await import("@/lib/tracking/browser");
    const item = {
      variantId: "variant-us",
      nome: "Micropele 0.08 mm",
      quantidade: 2,
      precoUnitarioCents: 12500,
      currency: "USD" as const,
    };

    medirVerProduto(item);
    medirAdicionarAoCarrinho(item);

    expect(fbq).toHaveBeenNthCalledWith(1, "track", "ViewContent", expect.objectContaining({ currency: "USD", value: 125 }));
    expect(fbq).toHaveBeenNthCalledWith(2, "track", "AddToCart", expect.objectContaining({ currency: "USD", value: 250 }));
    expect(gtag).toHaveBeenNthCalledWith(1, "event", "view_item", expect.objectContaining({ currency: "USD", value: 125 }));
    expect(gtag).toHaveBeenNthCalledWith(2, "event", "add_to_cart", expect.objectContaining({ currency: "USD", value: 250 }));
  });

  it("envia InitiateCheckout com subtotal e itens em USD", async () => {
    const { medirIniciarCheckout } = await import("@/lib/tracking/browser");
    medirIniciarCheckout({
      itens: [{ variantId: "variant-us", nome: "Micropele 0.08 mm", quantidade: 1, precoUnitarioCents: 12500 }],
      totalCents: 12500,
      currency: "USD",
    });

    expect(fbq).toHaveBeenCalledWith("track", "InitiateCheckout", expect.objectContaining({
      currency: "USD",
      value: 125,
      contents: [{ id: "variant-us", quantity: 1, item_price: 125 }],
    }));
    expect(gtag).toHaveBeenCalledWith("event", "begin_checkout", expect.objectContaining({ currency: "USD", value: 125 }));
  });
});
