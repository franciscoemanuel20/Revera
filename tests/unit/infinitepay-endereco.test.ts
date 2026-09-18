/**
 * O endereço do checkout vai para a InfinitePay (18/09/2026).
 *
 * Sem o campo `address`, a tela da InfinitePay pedia o CEP de novo a quem já
 * tinha preenchido tudo no site. Endereço incompleto NÃO vai: a tela aberta
 * com endereço pela metade é pior do que a tela pedindo o CEP.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfinitePayProvider } from "@/lib/payments/infinitepay-provider";

const CHARGE = {
  orderId: "99999999-9999-4999-8999-999999999999",
  orderNumber: "REV-X",
  amountCents: 7000,
  currency: "BRL",
  redirectUrl: "https://x/pedido/t",
  webhookUrl: "https://x/wh",
  items: [{ description: "Cola", quantity: 1, priceCents: 7000 }],
};

const ENDERECO = {
  street: " Avenida Paulista ",
  number: "1000",
  complement: "",
  neighborhood: "Bela Vista",
  city: "São Paulo",
  state: "SP",
  postalCode: "01310-100",
};

let corpo: Record<string, unknown> | null = null;

beforeEach(() => {
  corpo = null;
  vi.stubEnv("INFINITEPAY_HANDLE", "handle-teste");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      corpo = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ url: "https://checkout.infinitepay.io/x" }), { status: 200 });
    })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InfinitePayProvider.createCharge — endereço", () => {
  it("manda o endereço completo no formato da documentação, CEP só com dígitos", async () => {
    await new InfinitePayProvider().createCharge({ ...CHARGE, customerAddress: ENDERECO });
    expect(corpo?.address).toEqual({
      cep: "01310100",
      street: "Avenida Paulista",
      neighborhood: "Bela Vista",
      number: "1000",
    });
  });

  it("inclui o complemento quando existe", async () => {
    await new InfinitePayProvider().createCharge({
      ...CHARGE,
      customerAddress: { ...ENDERECO, complement: "Apto 12" },
    });
    expect((corpo?.address as Record<string, string>).complement).toBe("Apto 12");
  });

  it.each([
    ["sem endereço", undefined],
    ["CEP curto", { ...ENDERECO, postalCode: "0131010" }],
    ["sem número", { ...ENDERECO, number: " " }],
    ["sem rua", { ...ENDERECO, street: null }],
    ["sem bairro", { ...ENDERECO, neighborhood: "" }],
  ])("%s: não manda address", async (_nome, endereco) => {
    await new InfinitePayProvider().createCharge({ ...CHARGE, customerAddress: endereco });
    expect(corpo).not.toBeNull();
    expect(corpo).not.toHaveProperty("address");
  });
});
