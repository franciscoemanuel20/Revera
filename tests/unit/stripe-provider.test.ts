/**
 * O adapter da Stripe sob ataque.
 *
 * Cada bloco é uma tentativa de fazer o adapter aceitar o que não deve:
 * assinatura forjada, replay velho, corpo adulterado, moeda trocada,
 * sessão de outro pedido, chave do modo errado. O adapter certo é o que
 * recusa tudo isso — e os testes existem para que continue recusando
 * depois de qualquer refactor.
 */
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "whsec_teste_nao_e_segredo_real";
const ORDER = "99999999-9999-4999-8999-999999999999";

function assinar(corpo: string, t: number, secret = SECRET): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${corpo}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

function headersCom(assinatura: string | null) {
  return { get: (nome: string) => (nome === "stripe-signature" ? assinatura : null) };
}

function eventoSessaoPaga(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_abc",
        object: "checkout.session",
        client_reference_id: ORDER,
        payment_status: "paid",
        amount_total: 97000,
        currency: "usd",
        ...overrides,
      },
    },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

async function provider() {
  const { StripeProvider } = await import("@/lib/payments/stripe-provider");
  return new StripeProvider();
}

describe("assinatura do webhook", () => {
  it("assinatura válida dentro da tolerância passa", async () => {
    const { assinaturaConfere } = await import("@/lib/payments/stripe-provider");
    const agora = 1_800_000_000;
    expect(assinaturaConfere("corpo", assinar("corpo", agora), SECRET, agora)).toBe(true);
  });

  it("corpo adulterado depois de assinado é recusado", async () => {
    const { assinaturaConfere } = await import("@/lib/payments/stripe-provider");
    const agora = 1_800_000_000;
    const header = assinar('{"amount":100}', agora);
    expect(assinaturaConfere('{"amount":999999}', header, SECRET, agora)).toBe(false);
  });

  it("segredo errado é recusado", async () => {
    const { assinaturaConfere } = await import("@/lib/payments/stripe-provider");
    const agora = 1_800_000_000;
    expect(
      assinaturaConfere("corpo", assinar("corpo", agora, "whsec_outro"), SECRET, agora)
    ).toBe(false);
  });

  it("REPLAY: evento assinado há mais de 5 minutos é recusado", async () => {
    const { assinaturaConfere } = await import("@/lib/payments/stripe-provider");
    const agora = 1_800_000_000;
    expect(assinaturaConfere("corpo", assinar("corpo", agora - 301), SECRET, agora)).toBe(false);
    // 300s em ponto ainda passa — a tolerância é inclusiva.
    expect(assinaturaConfere("corpo", assinar("corpo", agora - 300), SECRET, agora)).toBe(true);
  });

  it("header vazio, sem t ou sem v1 é recusado", async () => {
    const { assinaturaConfere } = await import("@/lib/payments/stripe-provider");
    const agora = 1_800_000_000;
    expect(assinaturaConfere("corpo", null, SECRET, agora)).toBe(false);
    expect(assinaturaConfere("corpo", "v1=abc", SECRET, agora)).toBe(false);
    expect(assinaturaConfere("corpo", `t=${agora}`, SECRET, agora)).toBe(false);
    expect(assinaturaConfere("corpo", "lixo", SECRET, agora)).toBe(false);
  });

  it("várias v1 durante rotação de segredo: basta uma válida", async () => {
    const { assinaturaConfere } = await import("@/lib/payments/stripe-provider");
    const agora = 1_800_000_000;
    const boa = assinar("corpo", agora).split("v1=")[1];
    const header = `t=${agora},v1=deadbeef,v1=${boa}`;
    expect(assinaturaConfere("corpo", header, SECRET, agora)).toBe(true);
  });
});

describe("parseWebhookHint — semântica dos eventos", () => {
  it("sessão paga vira kind=pagamento com o pedido e a sessão", async () => {
    const p = await provider();
    const corpo = eventoSessaoPaga();
    const hint = p.parseWebhookHint(corpo, headersCom(assinar(corpo, Math.floor(Date.now() / 1000))));
    expect(hint).toMatchObject({
      orderId: ORDER,
      transactionId: "cs_test_abc",
      eventId: "evt_1",
      kind: "pagamento",
    });
  });

  it("assinatura inválida devolve null — o corpo nem é lido", async () => {
    const p = await provider();
    const corpo = eventoSessaoPaga();
    expect(p.parseWebhookHint(corpo, headersCom("t=1,v1=forjada"))).toBeNull();
    expect(p.parseWebhookHint(corpo, headersCom(null))).toBeNull();
    expect(p.parseWebhookHint(corpo)).toBeNull();
  });

  it("completed com payment_status=unpaid (pagamento assíncrono) vira ignorar", async () => {
    const p = await provider();
    const corpo = eventoSessaoPaga({ payment_status: "unpaid" });
    const hint = p.parseWebhookHint(corpo, headersCom(assinar(corpo, Math.floor(Date.now() / 1000))));
    expect(hint?.kind).toBe("ignorar");
  });

  it("charge.refunded vira kind=reembolso pela metadata do PaymentIntent", async () => {
    const p = await provider();
    const corpo = JSON.stringify({
      id: "evt_refund",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_1",
          payment_intent: "pi_1",
          metadata: { order_id: ORDER },
        },
      },
    });
    const hint = p.parseWebhookHint(corpo, headersCom(assinar(corpo, Math.floor(Date.now() / 1000))));
    expect(hint).toMatchObject({ orderId: ORDER, kind: "reembolso", transactionId: "pi_1" });
  });

  it("evento desconhecido assinado vira ignorar, nunca pagamento", async () => {
    const p = await provider();
    const corpo = JSON.stringify({ id: "evt_x", type: "payment_intent.created", data: { object: {} } });
    const hint = p.parseWebhookHint(corpo, headersCom(assinar(corpo, Math.floor(Date.now() / 1000))));
    expect(hint?.kind).toBe("ignorar");
  });

  it("sem STRIPE_WEBHOOK_SECRET, tudo devolve null (fail-closed)", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const p = await provider();
    const corpo = eventoSessaoPaga();
    expect(p.parseWebhookHint(corpo, headersCom(assinar(corpo, Math.floor(Date.now() / 1000))))).toBeNull();
  });
});

describe("createCharge — o que nunca sai daqui", () => {
  it("BRL é recusado: cartão brasileiro não pertence à Stripe desta loja", async () => {
    const p = await provider();
    await expect(
      p.createCharge({
        orderId: ORDER,
        orderNumber: "REV-X",
        amountCents: 1000,
        currency: "BRL",
        redirectUrl: "https://x/pedido/t",
        webhookUrl: "https://x/wh",
        items: [{ description: "a", quantity: 1, priceCents: 1000 }],
      })
    ).rejects.toThrow(/BRL/);
  });

  it("linhas que não somam o total abortam a cobrança", async () => {
    const p = await provider();
    await expect(
      p.createCharge({
        orderId: ORDER,
        orderNumber: "REV-X",
        amountCents: 97000,
        currency: "USD",
        redirectUrl: "https://x/pedido/t",
        webhookUrl: "https://x/wh",
        items: [{ description: "a", quantity: 1, priceCents: 90000 }],
      })
    ).rejects.toThrow(/somam/);
  });

  it("monta a sessão com referência do pedido, moeda minúscula e retorno com cs", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "cs_test_ok", url: "https://checkout.stripe.com/x" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = await provider();
    const r = await p.createCharge({
      orderId: ORDER,
      orderNumber: "REV-X",
      amountCents: 97000,
      currency: "USD",
      redirectUrl: "https://x/pedido/t",
      webhookUrl: "https://x/wh",
      items: [
        { description: "Micropele", quantity: 1, priceCents: 85000 },
        { description: "Frete internacional (DHL)", quantity: 1, priceCents: 12000 },
      ],
    });
    expect(r).toEqual({ providerPaymentId: "cs_test_ok", checkoutUrl: "https://checkout.stripe.com/x" });

    const chamadas = fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>;
    const body = String(chamadas[0]?.[1]?.body ?? "");
    expect(body).toContain(`client_reference_id=${ORDER}`);
    expect(body).toContain("currency%5D=usd");
    expect(body).toContain("cs%3D%7BCHECKOUT_SESSION_ID%7D");
    expect(body).toContain(encodeURIComponent("payment_intent_data[metadata][order_id]"));
  });
});

describe("confirmPayment — a verificação que vale", () => {
  it("sessão paga do PRÓPRIO pedido confirma, com moeda em maiúscula", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "cs_test_abc",
            client_reference_id: ORDER,
            payment_status: "paid",
            amount_total: 97000,
            currency: "usd",
          }),
          { status: 200 }
        )
      )
    );
    const p = await provider();
    const r = await p.confirmPayment({
      orderId: ORDER,
      transactionId: "cs_test_abc",
      invoiceSlug: null,
      eventId: "evt_1",
    });
    expect(r.paid).toBe(true);
    expect(r.paidAmountCents).toBe(97000);
    expect(r.currency).toBe("USD");
  });

  it("SESSÃO DE OUTRO PEDIDO não confirma nada — id vazado não vira dinheiro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "cs_test_abc",
            client_reference_id: "outro-pedido",
            payment_status: "paid",
            amount_total: 97000,
            currency: "usd",
          }),
          { status: 200 }
        )
      )
    );
    const p = await provider();
    const r = await p.confirmPayment({
      orderId: ORDER,
      transactionId: "cs_test_abc",
      invoiceSlug: null,
      eventId: "evt_1",
    });
    expect(r.paid).toBe(false);
  });

  it("sessão não paga devolve paid=false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "cs_test_abc",
            client_reference_id: ORDER,
            payment_status: "unpaid",
            amount_total: 97000,
            currency: "usd",
          }),
          { status: 200 }
        )
      )
    );
    const p = await provider();
    const r = await p.confirmPayment({
      orderId: ORDER,
      transactionId: "cs_test_abc",
      invoiceSlug: null,
      eventId: "evt_1",
    });
    expect(r.paid).toBe(false);
  });

  it("sem id de sessão, busca por metadata e exige status succeeded + order_id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: "pi_errado", status: "succeeded", amount_received: 1, currency: "usd", metadata: { order_id: "outro" } },
              { id: "pi_certo", status: "succeeded", amount_received: 97000, currency: "usd", metadata: { order_id: ORDER } },
            ],
          }),
          { status: 200 }
        )
      )
    );
    const p = await provider();
    const r = await p.confirmPayment({ orderId: ORDER, transactionId: null, invoiceSlug: null, eventId: "e" });
    expect(r.paid).toBe(true);
    expect(r.paidAmountCents).toBe(97000);
  });

  it("gateway fora do ar LANÇA (vira 'indisponivel' em quem chama), nunca 'não pago'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    const p = await provider();
    await expect(
      p.confirmPayment({ orderId: ORDER, transactionId: "cs_x", invoiceSlug: null, eventId: "e" })
    ).rejects.toThrow();
  });
});

describe("guarda de chave por ambiente", () => {
  it("chave live fora de produção é recusada", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
    vi.stubGlobal("fetch", vi.fn());
    const p = await provider();
    await expect(
      p.confirmPayment({ orderId: ORDER, transactionId: "cs_x", invoiceSlug: null, eventId: "e" })
    ).rejects.toThrow(/live/);
  });

  // A chave PUBLICÁVEL contém "_live_" e passava na guarda antiga como se
  // fosse secreta. Ela é pública de propósito e não abre checkout: a falha
  // só aparecia como 401 com o cliente já dentro do pagamento.
  it("chave publicável pk_live_ é recusada, não confundida com secreta", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "pk_live_abc123");
    vi.stubGlobal("fetch", vi.fn());
    const p = await provider();
    await expect(
      p.confirmPayment({ orderId: ORDER, transactionId: "cs_x", invoiceSlug: null, eventId: "e" })
    ).rejects.toThrow(/não é uma chave secreta/);
  });

  it("chave restrita rk_test_ é aceita fora de produção", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_abc123");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "cs_1", client_reference_id: ORDER, payment_status: "paid", amount_total: 1, currency: "usd" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = await provider();
    await p.confirmPayment({ orderId: ORDER, transactionId: "cs_1", invoiceSlug: null, eventId: "e" });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("STRIPE_API_BASE é obedecida fora de produção (o dublê de staging)", async () => {
    vi.stubEnv("STRIPE_API_BASE", "http://localhost:4242");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "cs_1", client_reference_id: ORDER, payment_status: "paid", amount_total: 1, currency: "usd" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = await provider();
    await p.confirmPayment({ orderId: ORDER, transactionId: "cs_1", invoiceSlug: null, eventId: "e" });
    const chamadas = fetchMock.mock.calls as unknown as Array<[string]>;
    expect(String(chamadas[0]?.[0])).toMatch(/^http:\/\/localhost:4242\//);
  });
});
