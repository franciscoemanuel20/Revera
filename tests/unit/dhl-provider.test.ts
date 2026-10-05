import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShippingUnavailable } from "@/lib/shipping/provider";
import { cotarDhlOperacional, montarRequestDhlOperacional } from "@/lib/shipping/dhl/admin-quote";
import {
  baseDhl,
  exigirAmbienteDhlParaTransacao,
  interpretarDhlRates,
  MyDhlProvider,
  modoDhl,
  montarPayloadDhlRating,
} from "@/lib/shipping/dhl/mydhl-provider";

const ORIGINAL = { ...process.env };

function ambiente(vars: Record<string, string | undefined>) {
  for (const k of [
    "DHL_AMBIENTE",
    "DHL_ENV",
    "DHL_SANDBOX",
    "DHL_API_BASE_URL",
    "DHL_PRODUCTION_APPROVED",
    "DHL_MYDHL_API_KEY",
    "DHL_MYDHL_API_SECRET",
    "NODE_ENV",
    "VERCEL_ENV",
  ]) {
    delete (process.env as Record<string, string | undefined>)[k];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) (process.env as Record<string, string>)[k] = v;
  }
}

beforeEach(() => ambiente({}));
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL)) delete (process.env as Record<string, string | undefined>)[k];
  }
  Object.assign(process.env, ORIGINAL);
});

describe("ambiente DHL", () => {
  it("usa sandbox explicitamente e nunca assume produção por ausência", () => {
    expect(() => modoDhl()).toThrow(/DHL_AMBIENTE/);
    ambiente({ DHL_AMBIENTE: "sandbox" });
    expect(modoDhl()).toBe("sandbox");
    expect(baseDhl()).toBe("https://express.api.dhl.com/mydhlapi/test");
  });

  it("produção exige aprovação operacional mesmo no ambiente de produção", () => {
    ambiente({ DHL_AMBIENTE: "producao", NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(() => exigirAmbienteDhlParaTransacao("criar envio")).toThrow(
      /DHL_PRODUCTION_APPROVED/
    );
    ambiente({
      DHL_AMBIENTE: "producao",
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      DHL_PRODUCTION_APPROVED: "1",
    });
    expect(() => exigirAmbienteDhlParaTransacao("criar envio")).not.toThrow();
  });

  it("não ecoa valor inválido porque pode ser segredo colado no lugar errado", () => {
    ambiente({ DHL_AMBIENTE: "abcSEGREDO123" });
    try {
      modoDhl();
      throw new Error("deveria lançar");
    } catch (e) {
      expect(e).toBeInstanceOf(ShippingUnavailable);
      expect((e as Error).message).not.toContain("abcSEGREDO123");
      expect((e as Error).message).toContain("13 caracteres");
    }
  });
});

describe("payload DHL rating", () => {
  it("mantém a fronteira internacional em kg/cm e não toca no contrato nacional", () => {
    ambiente({ DHL_AMBIENTE: "sandbox" });
    const payload = montarPayloadDhlRating({
      origin: {
        countryCode: "BR",
        postalCode: "12216530",
        cityName: "Sao Jose dos Campos",
        provinceCode: "SP",
      },
      destination: {
        countryCode: "US",
        postalCode: "10001",
        cityName: "New York",
        provinceCode: "NY",
      },
      packageInfo: { weightGrams: 300, lengthCm: 30, widthCm: 20, heightCm: 5 },
      declaredValueCents: 160000,
      currency: "USD",
      plannedShippingDate: "2026-10-01T10:00:00GMT-03:00",
      accountNumber: "123456789",
    });

    expect(payload).toMatchObject({
      unitOfMeasurement: "metric",
      isCustomsDeclarable: true,
      accounts: [{ typeCode: "shipper", number: "123456789" }],
      packages: [{ weight: 0.3, dimensions: { length: 30, width: 20, height: 5 } }],
      monetaryAmount: [{ typeCode: "declaredValue", value: 1600, currency: "USD" }],
    });
  });
});

describe("cotação operacional DHL", () => {
  it("monta request internacional a partir de input admin, sem contrato nacional", () => {
    const request = montarRequestDhlOperacional({
      country: "us",
      postalCode: "10001",
      cityName: "New York",
      provinceCode: "NY",
      addressLine1: "Test street",
      currency: "USD",
      declaredValueCents: 160000,
      weightGrams: 300,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 5,
      plannedShippingDate: "2026-10-01T10:00:00GMT-03:00",
    });
    expect(request.origin).toMatchObject({ countryCode: "BR", postalCode: "12216530" });
    expect(request.destination).toMatchObject({
      countryCode: "US",
      postalCode: "10001",
      cityName: "New York",
      provinceCode: "NY",
    });
    expect(request.packageInfo).toEqual({
      weightGrams: 300,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 5,
    });
  });

  it("falha fechado antes da rede quando faltam credenciais", async () => {
    ambiente({ DHL_AMBIENTE: "sandbox" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      cotarDhlOperacional({
        country: "US",
        postalCode: "10001",
        cityName: "New York",
        provinceCode: "NY",
        currency: "USD",
        declaredValueCents: 160000,
        weightGrams: 300,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 5,
      })
    ).rejects.toThrow(/Credenciais DHL ausentes/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("não consulta rates de produção antes da aprovação explícita", async () => {
    ambiente({
      DHL_AMBIENTE: "producao",
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      DHL_MYDHL_API_KEY: "key_fixture",
      DHL_MYDHL_API_SECRET: "secret_fixture",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new MyDhlProvider().quote(
        montarRequestDhlOperacional({
          country: "US",
          postalCode: "10001",
          cityName: "New York",
          provinceCode: "NY",
          currency: "USD",
          declaredValueCents: 160000,
          weightGrams: 300,
          lengthCm: 30,
          widthCm: 20,
          heightCm: 5,
        })
      )
    ).rejects.toThrow(/DHL_PRODUCTION_APPROVED/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consulta rates em sandbox e devolve opções sem salvar cotação manual", async () => {
    ambiente({
      DHL_AMBIENTE: "sandbox",
      DHL_MYDHL_API_KEY: "key_fixture",
      DHL_MYDHL_API_SECRET: "secret_fixture",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            products: [
              {
                productCode: "P",
                productName: "EXPRESS WORLDWIDE",
                totalPrice: [{ price: 72.5, currency: "USD" }],
              },
            ],
          }),
          { status: 200 }
        )
      )
    );

    const resultado = await cotarDhlOperacional({
      country: "US",
      postalCode: "10001",
      cityName: "New York",
      provinceCode: "NY",
      currency: "USD",
      declaredValueCents: 160000,
      weightGrams: 300,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 5,
      plannedShippingDate: "2026-10-01T10:00:00GMT-03:00",
    });
    expect(resultado.quotes[0]).toMatchObject({ productCode: "P", priceCents: 7250 });
  });
});

describe("resposta DHL rating", () => {
  it("extrai produtos cotáveis sem depender de chamada real", () => {
    const quotes = interpretarDhlRates(
      {
        products: [
          {
            productCode: "P",
            productName: "EXPRESS WORLDWIDE",
            totalPrice: { price: 72.5, currency: "USD" },
            deliveryCapabilities: {
              estimatedDeliveryDateAndTime: "2026-10-04T18:00:00GMT-04:00",
            },
          },
          { productCode: "sem-preco", productName: "Ignorado" },
        ],
      },
      "2026-10-01T10:00:00GMT-03:00"
    );
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      productCode: "P",
      productName: "EXPRESS WORLDWIDE",
      currency: "USD",
      priceCents: 7250,
      etaDays: 4,
    });
  });

  it("aceita totalPrice como array, formato comum da MyDHL API", () => {
    const quotes = interpretarDhlRates(
      {
        products: [
          {
            productCode: "P",
            productName: "EXPRESS WORLDWIDE",
            totalPrice: [{ price: 72.5, currency: "USD" }],
          },
        ],
      },
      "2026-10-01T10:00:00GMT-03:00"
    );
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ currency: "USD", priceCents: 7250 });
  });

  it("escolhe a moeda pedida entre os totais BILLC, PULCL e BASEC", () => {
    const quotes = interpretarDhlRates(
      { products: [{ productCode: "8", productName: "EXPRESS EASY", totalPrice: [
        { currencyType: "BILLC", priceCurrency: "USD", price: 66 },
        { currencyType: "PULCL", priceCurrency: "BRL", price: 341.94 },
        { currencyType: "BASEC", priceCurrency: "EUR", price: 58.13 },
      ] }] },
      "2026-10-01T10:00:00GMT-03:00",
      "EUR"
    );
    expect(quotes[0]).toMatchObject({ currency: "EUR", priceCents: 5813 });
  });
});
