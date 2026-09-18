import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase, UNICOS_REAIS } from "../stubs/fake-supabase";

const SECRET_CAMINHO = "segredo-do-caminho";
const TOKEN_ASAAS = "token-asaas-com-mais-de-32-caracteres";
const SECRET_STRIPE = "whsec_teste_rota_generica";
const ORDER = "77777777-7777-4777-8777-777777777777";

let fake: FakeSupabase;

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => fake,
}));

const despachar = vi.fn();
vi.mock("@/lib/tracking/despachar", () => ({
  despacharPurchase: (...a: unknown[]) => despachar(...a),
}));

function caminho(): string {
  return createHash("sha256").update(SECRET_CAMINHO).digest("hex");
}

function assinarStripe(corpo: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", SECRET_STRIPE).update(`${t}.${corpo}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

function requisicao(corpo: string): Request {
  return new Request("http://local/api/webhooks/pagamento/x", {
    method: "POST",
    headers: { "asaas-access-token": TOKEN_ASAAS },
    body: corpo,
  });
}

function requisicaoStripe(corpo: string): Request {
  return new Request("http://local/api/webhooks/pagamento/x", {
    method: "POST",
    headers: { "stripe-signature": assinarStripe(corpo) },
    body: corpo,
  });
}

async function rota() {
  const { POST } = await import("@/app/api/webhooks/pagamento/[segredo]/route");
  return (corpo: string) =>
    POST(requisicao(corpo), {
      params: Promise.resolve({ segredo: caminho() }),
    });
}

async function rotaStripeNaGenerica() {
  const { POST } = await import("@/app/api/webhooks/pagamento/[segredo]/route");
  return (corpo: string) =>
    POST(requisicaoStripe(corpo), {
      params: Promise.resolve({ segredo: caminho() }),
    });
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  despachar.mockClear();
  vi.stubEnv("PAYMENT_PROVIDER", "asaas");
  vi.stubEnv("PAYMENT_WEBHOOK_SECRET", SECRET_CAMINHO);
  vi.stubEnv("ASAAS_API_KEY", "asaas_teste");
  vi.stubEnv("ASAAS_WEBHOOK_AUTH_TOKEN", TOKEN_ASAAS);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET_STRIPE);
  vi.stubEnv("INFINITEPAY_HANDLE", "revera");
  vi.spyOn(console, "error").mockImplementation(() => {});
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
  fake = new FakeSupabase(
    {
      orders: [
        {
          id: ORDER,
          status: "new",
          payment_status: "pending",
          shipping_status: "not_ready",
          total_cents: 67139,
          currency: "BRL",
        },
      ],
      payments: [
        {
          id: "pay_local",
          order_id: ORDER,
          provider: "asaas",
          provider_payment_id: "chk_123",
          status: "pending",
          amount_cents: 67139,
          raw_response: { checkout_url: "https://asaas.com/checkoutSession/show?id=chk_123" },
        },
      ],
      payment_events: [],
      pixel_event_log: [],
      order_notifications: [],
      audit_logs: [],
    },
    UNICOS_REAIS
  );
});

describe("webhook nacional Asaas", () => {
  it("checkout expirado fecha a reserva pendente sem marcar pedido como pago", async () => {
    const post = await rota();
    const corpo = JSON.stringify({
      event: "CHECKOUT_EXPIRED",
      checkout: { id: "chk_123", externalReference: ORDER },
    });

    const resposta = await post(corpo);

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, checkout_expirado: true });
    expect(fake.tabela("orders")[0]?.payment_status).toBe("pending");
    expect(fake.tabela("payments")[0]?.status).toBe("failed");
    expect(fake.tabela("payment_events")[0]?.processed_at).toBeTruthy();
    expect(despachar).not.toHaveBeenCalled();
  });

  it("checkout expirado também libera reserva pendente que ficou sem id do gateway", async () => {
    fake.tabela("payments")[0]!.provider_payment_id = null;

    const post = await rota();
    const corpo = JSON.stringify({
      event: "CHECKOUT_EXPIRED",
      checkout: { id: "chk_123", externalReference: ORDER },
    });

    const resposta = await post(corpo);

    expect(resposta.status).toBe(200);
    expect(fake.tabela("payments")[0]).toMatchObject({
      provider_payment_id: "chk_123",
      status: "failed",
    });
    expect(fake.tabela("payment_events")[0]?.processed_at).toBeTruthy();
    expect(despachar).not.toHaveBeenCalled();
  });

  it("não libera reserva quando o gateway não confirma a expiração", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "chk_123",
            externalReference: ORDER,
            status: "ACTIVE",
          }),
          { status: 200 }
        )
      )
    );

    const post = await rota();
    const corpo = JSON.stringify({
      event: "CHECKOUT_EXPIRED",
      checkout: { id: "chk_123", externalReference: ORDER },
    });

    const resposta = await post(corpo);

    expect(resposta.status).toBe(400);
    expect(fake.tabela("orders")[0]?.payment_status).toBe("pending");
    expect(fake.tabela("payments")[0]?.status).toBe("pending");
    expect(fake.tabela("payment_events")).toHaveLength(0);
    expect(despachar).not.toHaveBeenCalled();
  });

  it("ignora evento não final sem transformar reserva ativa em failed", async () => {
    const post = await rota();
    const corpo = JSON.stringify({
      event: "PAYMENT_CREATED",
      checkout: { id: "chk_123", externalReference: ORDER },
      payment: { id: "pay_123" },
    });

    const resposta = await post(corpo);

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, ignorado: true });
    expect(fake.tabela("orders")[0]?.payment_status).toBe("pending");
    expect(fake.tabela("payments")[0]).toMatchObject({
      provider_payment_id: "chk_123",
      status: "pending",
    });
    expect(fake.tabela("payment_events")[0]?.processed_at).toBeTruthy();
    expect(despachar).not.toHaveBeenCalled();
  });

  it("encaminha webhook Stripe assinado mesmo quando o provider nacional é Asaas", async () => {
    fake.tabela("orders")[0]!.currency = "BRL";
    fake.tabela("payments")[0] = {
      id: "pay_stripe",
      order_id: ORDER,
      provider: "stripe",
      provider_payment_id: "cs_test_apple",
      status: "pending",
      amount_cents: 67139,
      raw_response: { checkout_url: "https://checkout.stripe.com/c/pay/apple" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "cs_test_apple",
            client_reference_id: ORDER,
            payment_status: "paid",
            amount_total: 67139,
            currency: "brl",
          }),
          { status: 200 }
        )
      )
    );

    const post = await rotaStripeNaGenerica();
    const corpo = JSON.stringify({
      id: "evt_stripe_apple_pay",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_apple",
          client_reference_id: ORDER,
          payment_status: "paid",
          amount_total: 67139,
          currency: "brl",
        },
      },
    });

    const resposta = await post(corpo);

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, pago: true });
    expect(fake.tabela("orders")[0]).toMatchObject({ payment_status: "paid" });
    expect(fake.tabela("payments")[0]).toMatchObject({ provider: "stripe", status: "approved" });
    expect(fake.tabela("payment_events")[0]).toMatchObject({ provider: "stripe" });
  });

  it("responde 503 para Stripe reenviar quando a confirmação temporariamente falha", async () => {
    fake.tabela("payments")[0] = {
      id: "pay_stripe",
      order_id: ORDER,
      provider: "stripe",
      provider_payment_id: "cs_test_apple",
      status: "pending",
      amount_cents: 67139,
      raw_response: { checkout_url: "https://checkout.stripe.com/c/pay/apple" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "temporario" }), { status: 503 }))
    );

    const post = await rotaStripeNaGenerica();
    const corpo = JSON.stringify({
      id: "evt_stripe_apple_pay_retry",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_apple",
          client_reference_id: ORDER,
          payment_status: "paid",
          amount_total: 67139,
          currency: "brl",
        },
      },
    });

    const resposta = await post(corpo);

    expect(resposta.status).toBe(503);
    expect(fake.tabela("payment_events")).toHaveLength(0);
    expect(fake.tabela("orders")[0]).toMatchObject({ payment_status: "pending" });
  });

  it("registra reembolso Stripe assinado na rota genérica", async () => {
    fake.tabela("orders")[0]!.payment_status = "paid";

    const post = await rotaStripeNaGenerica();
    const corpo = JSON.stringify({
      id: "evt_stripe_refund",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_1",
          payment_intent: "pi_1",
          metadata: { order_id: ORDER },
        },
      },
    });

    const resposta = await post(corpo);

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, reembolso: "reembolsado" });
    expect(fake.tabela("orders")[0]).toMatchObject({ payment_status: "refunded" });
    expect(fake.tabela("payments").at(-1)).toMatchObject({
      provider: "stripe",
      provider_payment_id: "pi_1",
      status: "refunded",
    });
    expect(fake.tabela("payment_events")[0]).toMatchObject({ provider: "stripe" });
    expect(fake.tabela("payment_events")[0]?.processed_at).toBeTruthy();
  });

  it("preserva webhook InfinitePay pendente durante migração para Asaas", async () => {
    fake.tabela("payments")[0] = {
      id: "pay_infinite",
      order_id: ORDER,
      provider: "infinitepay",
      provider_payment_id: "ip_tx_1",
      status: "pending",
      amount_cents: 67139,
      raw_response: { checkout_url: "https://checkout.infinitepay.io/revera?x=1" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            paid: true,
            paid_amount: 67139,
            capture_method: "pix",
          }),
          { status: 200 }
        )
      )
    );

    const post = await rota();
    const corpo = JSON.stringify({
      order_nsu: ORDER,
      transaction_nsu: "ip_tx_1",
    });

    const resposta = await post(corpo);

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, pago: true });
    expect(fake.tabela("orders")[0]).toMatchObject({ payment_status: "paid" });
    expect(fake.tabela("payments")[0]).toMatchObject({
      provider: "infinitepay",
      status: "approved",
    });
    expect(fake.tabela("payment_events")[0]).toMatchObject({ provider: "infinitepay" });
  });
});
