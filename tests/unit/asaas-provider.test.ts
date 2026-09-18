import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsaasProvider } from "@/lib/payments/asaas-provider";
import { AmbiguousChargeError } from "@/lib/payments/provider";

const ORDER = "11111111-1111-4111-8111-111111111111";

const CHARGE_BASE = {
  orderId: ORDER,
  orderNumber: "REV-ASAAS",
  amountCents: 67139,
  currency: "BRL",
  customerName: "Cliente Teste Com Nome Comprido Demais Para o Asaas",
  customerEmail: "cliente@example.com",
  customerPhone: "(12) 98140-9901",
  customerDocument: "111.444.777-35",
  customerAddress: {
    street: "Rua Teste",
    number: "123",
    complement: "Sala 4",
    neighborhood: "Centro",
    city: "São Paulo",
    state: "SP",
    postalCode: "01001-000",
  },
  redirectUrl: "https://revera.test/pedido/token",
  webhookUrl: "https://revera.test/api/webhooks/pagamento/segredo",
  items: [
    { description: "Micropele 0,08mm 20x25 — Cor 1B 80%", quantity: 1, priceCents: 65000 },
    { description: "Frete", quantity: 1, priceCents: 2139 },
  ],
};

const WEBHOOKS_OK = {
  data: [
    {
      id: "wh_1",
      url: CHARGE_BASE.webhookUrl,
      enabled: true,
      interrupted: false,
      events: ["CHECKOUT_PAID", "CHECKOUT_CANCELED", "CHECKOUT_EXPIRED"],
    },
  ],
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("ASAAS_API_KEY", "asaas_teste");
  vi.stubEnv("ASAAS_WEBHOOK_AUTH_TOKEN", "token-certo-com-mais-de-32-caracteres");
  vi.stubEnv("ASAAS_API_BASE", "https://api-sandbox.asaas.com/v3");
  vi.stubEnv("ASAAS_CHECKOUT_BASE", "https://sandbox.asaas.com/checkoutSession/show");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AsaasProvider.createCharge", () => {
  it("recusa override de API/checkout em produção", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubGlobal("fetch", vi.fn());

    await expect(new AsaasProvider().createCharge(CHARGE_BASE)).rejects.toThrow(
      /ASAAS_API_BASE não é permitida em produção/
    );
  });

  it("cria checkout BRL com Pix/cartão e monta link hospedado", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/webhooks")
        ? new Response(JSON.stringify(WEBHOOKS_OK), { status: 200 })
        : new Response(JSON.stringify({ id: "chk_123" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await new AsaasProvider().createCharge(CHARGE_BASE);

    expect(r).toEqual({
      providerPaymentId: "chk_123",
      checkoutUrl: "https://sandbox.asaas.com/checkoutSession/show?id=chk_123",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-sandbox.asaas.com/v3/checkouts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ access_token: "asaas_teste" }),
      })
    );
    const chamadas = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(chamadas[1]![1].body as string);
    expect(body.billingTypes).toEqual(["PIX", "CREDIT_CARD"]);
    expect(body.chargeTypes).toEqual(["DETACHED"]);
    expect(body.minutesToExpire).toBe(60);
    expect(body.externalReference).toBe(ORDER);
    expect(body.customerData).toEqual(
      expect.objectContaining({
        name: "Cliente Teste Com Nome Comprid",
        cpfCnpj: "11144477735",
        phone: "12981409901",
        address: "Rua Teste",
        addressNumber: "123",
        complement: "Sala 4",
        province: "Centro",
        postalCode: "01001000",
      })
    );
    expect(body.items).toEqual([
      expect.objectContaining({
        externalReference: `${ORDER}:1`,
        name: "Micropele 0,08mm 20x25 — Cor 1",
        description: "Micropele 0,08mm 20x25 — Cor 1B 80%",
        quantity: 1,
        value: 650,
      }),
      expect.objectContaining({
        externalReference: `${ORDER}:2`,
        name: "Frete",
        description: "Frete",
        quantity: 1,
        value: 21.39,
      }),
    ]);
    expect(body.callback.successUrl).toBe(CHARGE_BASE.redirectUrl);
  });

  it("limita a expiração configurada ao intervalo aceito pelo Asaas", async () => {
    vi.stubEnv("ASAAS_CHECKOUT_EXPIRA_MINUTOS", "9999");
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/webhooks")
        ? new Response(JSON.stringify(WEBHOOKS_OK), { status: 200 })
        : new Response(JSON.stringify({ id: "chk_123" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await new AsaasProvider().createCharge(CHARGE_BASE);

    const chamadas = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(chamadas[1]![1].body as string);
    expect(body.minutesToExpire).toBe(1440);
  });

  it("aplica desconto reduzindo linhas positivas do checkout", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/webhooks")
        ? new Response(JSON.stringify(WEBHOOKS_OK), { status: 200 })
        : new Response(JSON.stringify({ id: "chk_123" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await new AsaasProvider().createCharge({
      ...CHARGE_BASE,
      amountCents: 66139,
    });

    const chamadas = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(chamadas[1]![1].body as string);
    expect(body.items).toEqual([
      expect.objectContaining({ externalReference: `${ORDER}:1`, value: 650 }),
      expect.objectContaining({ externalReference: `${ORDER}:2`, value: 11.39 }),
    ]);
    expect(body.items.every((item: { value: number }) => item.value > 0)).toBe(true);
  });

  it("reativa webhook interrompido antes de criar checkout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "wh_interrompido",
                name: "Revera - Checkout produção",
                url: CHARGE_BASE.webhookUrl,
                email: "ops@revera.test",
                enabled: true,
                interrupted: true,
                events: ["CHECKOUT_PAID", "CHECKOUT_CANCELED", "CHECKOUT_EXPIRED"],
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "chk_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new AsaasProvider().createCharge(CHARGE_BASE);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api-sandbox.asaas.com/v3/webhooks/wh_interrompido",
      expect.objectContaining({ method: "PUT" })
    );
    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      url: CHARGE_BASE.webhookUrl,
      enabled: true,
      interrupted: false,
      authToken: "token-certo-com-mais-de-32-caracteres",
      events: ["CHECKOUT_PAID", "CHECKOUT_CANCELED", "CHECKOUT_EXPIRED"],
    });
  });

  it("cria o webhook esperado quando ele não existe", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "wh_novo" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "chk_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new AsaasProvider().createCharge(CHARGE_BASE);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api-sandbox.asaas.com/v3/webhooks",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      name: "Revera - Checkout produção",
      url: CHARGE_BASE.webhookUrl,
      enabled: true,
      interrupted: false,
      authToken: "token-certo-com-mais-de-32-caracteres",
      events: ["CHECKOUT_PAID", "CHECKOUT_CANCELED", "CHECKOUT_EXPIRED"],
    });
  });

  it("recusa criar checkout se não conseguir recuperar o webhook do ambiente", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response("erro", { status: 400 }))
    );

    await expect(new AsaasProvider().createCharge(CHARGE_BASE)).rejects.toThrow(/Webhook do Asaas/);
  });

  it("recusa moeda diferente de BRL antes de chamar rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new AsaasProvider().createCharge({ ...CHARGE_BASE, currency: "USD" })
    ).rejects.toThrow(/só processa BRL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falha de rede é ambígua", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(WEBHOOKS_OK), { status: 200 }))
        .mockRejectedValueOnce(new TypeError("fetch failed"))
    );

    await expect(new AsaasProvider().createCharge(CHARGE_BASE)).rejects.toBeInstanceOf(
      AmbiguousChargeError
    );
  });

  it("5xx ao criar checkout é ambíguo", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(WEBHOOKS_OK), { status: 200 }))
        .mockResolvedValueOnce(new Response("erro", { status: 502 }))
    );

    await expect(new AsaasProvider().createCharge(CHARGE_BASE)).rejects.toBeInstanceOf(
      AmbiguousChargeError
    );
  });

  it("4xx ao criar checkout é erro certo", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(WEBHOOKS_OK), { status: 200 }))
        .mockResolvedValueOnce(new Response("erro", { status: 400 }))
    );

    const erro = await new AsaasProvider().createCharge(CHARGE_BASE).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(Error);
    expect(erro).not.toBeInstanceOf(AmbiguousChargeError);
  });
});

describe("AsaasProvider.parseWebhookHint", () => {
  beforeEach(() => {
    vi.stubEnv("ASAAS_WEBHOOK_AUTH_TOKEN", "token-certo-com-mais-de-32-caracteres");
  });

  it("extrai pedido do CHECKOUT_PAID", () => {
    const hint = new AsaasProvider().parseWebhookHint(
      JSON.stringify({
        id: "evt_1",
        event: "CHECKOUT_PAID",
        checkout: { id: "chk_123", externalReference: ORDER },
        payment: { id: "pay_123" },
      }),
      new Headers({ "asaas-access-token": "token-certo-com-mais-de-32-caracteres" })
    );

    expect(hint).toEqual({
      orderId: ORDER,
      transactionId: "chk_123",
      invoiceSlug: "pay_123",
      eventId: "evt_1",
      kind: "pagamento",
    });
  });

  it("eventos de cancelamento/expiração liberam a sessão pendente para nova tentativa", () => {
    const hint = new AsaasProvider().parseWebhookHint(
      JSON.stringify({
        event: "CHECKOUT_EXPIRED",
        checkout: { id: "chk_123", externalReference: ORDER },
      }),
      new Headers({ "asaas-access-token": "token-certo-com-mais-de-32-caracteres" })
    );

    expect(hint?.kind).toBe("checkout_expirado");
    expect(hint?.eventId).toBe("CHECKOUT_EXPIRED:chk_123");
  });

  it("ignora eventos Asaas não finais para não liberar checkout ainda pagável", () => {
    const hint = new AsaasProvider().parseWebhookHint(
      JSON.stringify({
        event: "PAYMENT_CREATED",
        checkout: { id: "chk_123", externalReference: ORDER },
        payment: { id: "pay_123" },
      }),
      new Headers({ "asaas-access-token": "token-certo-com-mais-de-32-caracteres" })
    );

    expect(hint).toMatchObject({
      orderId: ORDER,
      transactionId: "chk_123",
      invoiceSlug: "pay_123",
      kind: "ignorar",
    });
  });

  it("recusa webhook com token Asaas divergente", () => {
    const hint = new AsaasProvider().parseWebhookHint(
      JSON.stringify({
        id: "evt_1",
        event: "CHECKOUT_PAID",
        checkout: { id: "chk_123", externalReference: ORDER },
      }),
      new Headers({ "asaas-access-token": "token-errado" })
    );

    expect(hint).toBeNull();
  });

  it("recusa webhook quando o token esperado não está configurado", () => {
    vi.stubEnv("ASAAS_WEBHOOK_AUTH_TOKEN", "");

    const hint = new AsaasProvider().parseWebhookHint(
      JSON.stringify({
        id: "evt_1",
        event: "CHECKOUT_PAID",
        checkout: { id: "chk_123", externalReference: ORDER },
      }),
      new Headers({ "asaas-access-token": "qualquer-token" })
    );

    expect(hint).toBeNull();
  });
});

describe("AsaasProvider.confirmPayment", () => {
  it("confirma como pago apenas status financeiro recebido/confirmado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "pay_123",
            status: "RECEIVED",
            value: 671.39,
            netValue: 650.12,
            billingType: "PIX",
            externalReference: ORDER,
            checkoutSession: "chk_123",
          }),
          { status: 200 }
        )
      )
    );

    const r = await new AsaasProvider().confirmPayment({
      orderId: ORDER,
      transactionId: "chk_123",
      invoiceSlug: "pay_123",
      eventId: "evt_1",
    });

    expect(r).toMatchObject({
      paid: true,
      paidAmountCents: 67139,
      currency: "BRL",
      method: "pix",
    });
  });

  it("não aceita payment id pago se ele pertence a outro pedido ou checkout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "pay_123",
            status: "RECEIVED",
            value: 671.39,
            billingType: "PIX",
            externalReference: "99999999-9999-4999-8999-999999999999",
            checkoutSession: "chk_outra",
          }),
          { status: 200 }
        )
      )
    );

    const r = await new AsaasProvider().confirmPayment({
      orderId: ORDER,
      transactionId: "chk_123",
      invoiceSlug: "pay_123",
      eventId: "evt_1",
    });

    expect(r.paid).toBe(false);
    expect(r.raw).toMatchObject({ recusado: "referencia_divergente" });
  });

  it("consulta por checkoutSession quando webhook não trouxe payment id", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "pay_123",
              status: "PENDING",
              value: 671.39,
              externalReference: ORDER,
              checkoutSession: "chk_123",
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await new AsaasProvider().confirmPayment({
      orderId: ORDER,
      transactionId: "chk_123",
      invoiceSlug: null,
      eventId: "evt_1",
    });

    const chamadas = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(chamadas[0]![0]).toContain("/payments?checkoutSession=chk_123");
    expect(r.paid).toBe(false);
    expect(r.paidAmountCents).toBe(67139);
  });

  it("confirma pagamento de checkout Asaas mesmo quando o payment não propaga externalReference", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "pay_pix",
              status: "RECEIVED",
              value: 667.79,
              netValue: 666.8,
              billingType: "PIX",
              externalReference: null,
              checkoutSession: "chk_123",
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await new AsaasProvider().confirmPayment({
      orderId: ORDER,
      transactionId: "chk_123",
      invoiceSlug: null,
      eventId: "evt_1",
    });

    const chamadas = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(chamadas[0]![0]).toContain("/payments?checkoutSession=chk_123");
    expect(chamadas[0]![0]).not.toContain("externalReference=");
    expect(r).toMatchObject({
      paid: true,
      paidAmountCents: 66779,
      currency: "BRL",
      method: "pix",
    });
  });

  it("não aprova pagamento listado se ele não pertence ao pedido/checkout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "pay_outro",
                status: "RECEIVED",
                value: 999,
                externalReference: "99999999-9999-4999-8999-999999999999",
                checkoutSession: "chk_outra",
              },
            ],
          }),
          { status: 200 }
        )
      )
    );

    const r = await new AsaasProvider().confirmPayment({
      orderId: ORDER,
      transactionId: "chk_123",
      invoiceSlug: null,
      eventId: "evt_1",
    });

    expect(r.paid).toBe(false);
    expect(r.raw).toMatchObject({ encontrado: false });
  });
});

describe("AsaasProvider.confirmCheckoutExpired", () => {
  it("confirma expiração só quando checkout pertence ao pedido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "chk_123",
            externalReference: ORDER,
            status: "EXPIRED",
          }),
          { status: 200 }
        )
      )
    );

    await expect(
      new AsaasProvider().confirmCheckoutExpired({
        orderId: ORDER,
        transactionId: "chk_123",
        invoiceSlug: null,
        eventId: "evt_1",
      })
    ).resolves.toBe(true);
  });

  it("não confirma expiração de checkout de outro pedido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "chk_123",
            externalReference: "99999999-9999-4999-8999-999999999999",
            status: "EXPIRED",
          }),
          { status: 200 }
        )
      )
    );

    await expect(
      new AsaasProvider().confirmCheckoutExpired({
        orderId: ORDER,
        transactionId: "chk_123",
        invoiceSlug: null,
        eventId: "evt_1",
      })
    ).resolves.toBe(false);
  });
});
