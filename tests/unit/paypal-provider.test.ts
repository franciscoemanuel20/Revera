import { beforeEach, describe, expect, it, vi } from "vitest";

const ORDER = "99999999-9999-4999-8999-999999999999";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PAYPAL_ENV", "sandbox");
  vi.stubEnv("PAYPAL_CLIENT_ID", "client_teste");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret_teste");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

async function provider() {
  const { PayPalProvider } = await import("@/lib/payments/paypal-provider");
  return new PayPalProvider();
}

describe("PayPalProvider", () => {
  it("exige checkout e webhook juntos para ativar PayPal", async () => {
    vi.stubEnv("REVERA_INTERNATIONAL_PAYMENT_PROVIDER", "paypal");
    vi.stubEnv("PAYPAL_CHECKOUT_ENABLED", "1");
    vi.stubEnv("PAYPAL_WEBHOOK_ENABLED", "0");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "webhook_teste");
    const { getReveraInternationalProviderName } = await import("@/lib/payments/revera");
    expect(() => getReveraInternationalProviderName()).toThrow(/webhook/);
    vi.stubEnv("PAYPAL_WEBHOOK_ENABLED", "1");
    expect(getReveraInternationalProviderName()).toBe("paypal");
  });
  it("recusa webhook sem assinatura antes de consultar a API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const p = await provider();
    expect(await p.verificarWebhook("{}", new Headers())).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["SUCCESS", "FAILURE"])("valida assinatura PayPal: %s", async (status) => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "webhook_teste");
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/oauth2/token")) {
        return Response.json({ access_token: "access", expires_in: 3600 });
      }
      expect(url).toContain("/v1/notifications/verify-webhook-signature");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        webhook_id: "webhook_teste",
        webhook_event: { id: "evt" },
      });
      return Response.json({ verification_status: status });
    });
    vi.stubGlobal("fetch", fetchMock);
    const headers = new Headers({
      "paypal-transmission-id": "transmission",
      "paypal-transmission-time": "time",
      "paypal-transmission-sig": "sig",
      "paypal-cert-url": "https://api-m.sandbox.paypal.com/cert",
      "paypal-auth-algo": "SHA256withRSA",
    });
    expect(await (await provider()).verificarWebhook('{"id":"evt"}', headers)).toBe(status === "SUCCESS");
  });
  it("não reporta gateway internacional configurado sem credenciais PayPal", async () => {
    vi.stubEnv("REVERA_INTERNATIONAL_PAYMENT_PROVIDER", "paypal");
    vi.stubEnv("PAYPAL_CLIENT_ID", "");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "");
    const { reveraInternationalPaymentAvailable } = await import("@/lib/payments/revera");
    expect(reveraInternationalPaymentAvailable()).toBe(false);
  });

  it("recusa BRL no caminho internacional", async () => {
    const p = await provider();
    await expect(
      p.createCharge({
        orderId: ORDER,
        orderNumber: "REV-X",
        amountCents: 1000,
        currency: "BRL",
        redirectUrl: "https://revera.test/pedido/t",
        webhookUrl: "https://revera.test/api/webhooks/pagamento/s",
        items: [{ description: "a", quantity: 1, priceCents: 1000 }],
      })
    ).rejects.toThrow(/BRL/);
  });

  it.each(["approve", "payer-action"])("cria order com custom_id e link seguro %s", async (rel) => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "access", expires_in: 3600 }), {
          status: 200,
        });
      }
      expect(url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.intent).toBe("CAPTURE");
      expect(body.purchase_units[0].custom_id).toBe(ORDER);
      expect(body.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "970.00" });
      expect(body.payment_source.paypal.experience_context.return_url).toContain("/pedido/t");
      return new Response(
        JSON.stringify({
          id: "PAYPAL-ORDER-1",
          status: "CREATED",
          links: [{ rel, href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1" }],
        }),
        { status: 201 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = await provider();
    await expect(
      p.createCharge({
        orderId: ORDER,
        orderNumber: "REV-X",
        amountCents: 97000,
        currency: "USD",
        redirectUrl: "https://revera.test/pedido/t",
        webhookUrl: "https://revera.test/api/webhooks/pagamento/s",
        expiresAt: new Date(Date.now() + 6 * 60 * 60_000 + 20_000),
        items: [{ description: "Micropele", quantity: 1, priceCents: 97000 }],
      })
    ).resolves.toEqual({
      providerPaymentId: "PAYPAL-ORDER-1",
      checkoutUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1",
    });
  });

  it("aceita prazo total da cotação de 6 h 20 min para a ordem de 3 h do PayPal", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "access", expires_in: 3600 });
      return new Response(JSON.stringify({ id: "PAYPAL-ORDER-1", status: "CREATED", links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1" }] }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const p = await provider();
    await expect(p.createCharge({
      orderId: ORDER,
      orderNumber: "REV-X",
      amountCents: 1000,
      currency: "USD",
      redirectUrl: "https://revera.test/pedido/t",
      webhookUrl: "https://revera.test/api/webhooks/pagamento/s",
      expiresAt: new Date(Date.now() + 6 * 60 * 60_000 + 20_000),
      items: [{ description: "Produto", quantity: 1, priceCents: 1000 }],
    })).resolves.toMatchObject({ providerPaymentId: "PAYPAL-ORDER-1" });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("recusa iniciar PayPal sem as 3 h e o teto de criação dentro da cotação", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const p = await provider();
    await expect(p.createCharge({
      orderId: ORDER,
      orderNumber: "REV-X",
      amountCents: 1000,
      currency: "USD",
      redirectUrl: "https://revera.test/pedido/t",
      webhookUrl: "https://revera.test/api/webhooks/pagamento/s",
      expiresAt: new Date(Date.now() + 3 * 60 * 60_000 + 10_000),
      items: [{ description: "Produto", quantity: 1, priceCents: 1000 }],
    })).rejects.toThrow(/cotação/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa ordem sem expiresAt antes de qualquer chamada ao PayPal", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const p = await provider();
    await expect(p.createCharge({
      orderId: ORDER,
      orderNumber: "REV-X",
      amountCents: 1000,
      currency: "USD",
      redirectUrl: "https://revera.test/pedido/t",
      webhookUrl: "https://revera.test/api/webhooks/pagamento/s",
      expiresAt: undefined,
      items: [{ description: "Produto", quantity: 1, priceCents: 1000 }],
    })).rejects.toThrow(/ausente ou inválida/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("captura order aprovada e confirma valor/moeda", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "access", expires_in: 3600 }), {
          status: 200,
        });
      }
      if (url.endsWith("/v2/checkout/orders/PAYPAL-ORDER-1")) {
        return new Response(
          JSON.stringify({
            id: "PAYPAL-ORDER-1",
            status: "APPROVED",
            purchase_units: [{ custom_id: ORDER }],
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/v2/checkout/orders/PAYPAL-ORDER-1/capture")) {
        return new Response(
          JSON.stringify({
            id: "PAYPAL-ORDER-1",
            status: "COMPLETED",
            purchase_units: [
              {
                custom_id: ORDER,
                payments: {
                  captures: [
                    {
                      id: "CAPTURE-1",
                      status: "COMPLETED",
                      amount: { currency_code: "USD", value: "970.00" },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 201 }
        );
      }
      throw new Error(`URL inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = await provider();
    await expect(
      p.confirmPayment({
        orderId: ORDER,
        transactionId: "PAYPAL-ORDER-1",
        invoiceSlug: null,
        eventId: "evt",
      })
    ).resolves.toMatchObject({
      paid: true,
      paidAmountCents: 97000,
      currency: "USD",
      method: "paypal",
    });
  });

  it("reconhece capture concluído mesmo quando o webhook só traz related_ids.order_id", async () => {
    const p = await provider();
    const hint = p.parseWebhookHint(
      JSON.stringify({
        id: "WH-CAPTURE-1",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAPTURE-1",
          status: "COMPLETED",
          supplementary_data: {
            related_ids: { order_id: "PAYPAL-ORDER-1" },
          },
          amount: { currency_code: "USD", value: "970.00" },
        },
      })
    );

    expect(hint).toEqual({
      orderId: "",
      transactionId: "PAYPAL-ORDER-1",
      invoiceSlug: "CAPTURE-1",
      eventId: "WH-CAPTURE-1",
      kind: "pagamento",
    });
  });
});
