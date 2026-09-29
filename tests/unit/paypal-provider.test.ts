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

  it("cria order com custom_id do pedido e link de aprovação seguro", async () => {
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
          links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1" }],
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
        items: [{ description: "Micropele", quantity: 1, priceCents: 97000 }],
      })
    ).resolves.toEqual({
      providerPaymentId: "PAYPAL-ORDER-1",
      checkoutUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1",
    });
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
