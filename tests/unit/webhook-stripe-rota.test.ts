/**
 * A rota do webhook da Stripe sob ataque — o teste que o dinheiro exige.
 *
 * Dez reenvios do mesmo evento têm que terminar em UM pagamento
 * confirmado, UMA mudança de estado, UM evento interno e ZERO duplicação.
 * Valor adulterado, moeda trocada, pedido alheio, assinatura forjada e
 * reembolso fora de ordem não podem mover nada. A idempotência é do BANCO
 * (unique em payment_events + update condicional em orders) — o Fake
 * emula exatamente essas travas, então remover qualquer uma delas do
 * código quebra este arquivo.
 */
import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase, UNICOS_REAIS } from "../stubs/fake-supabase";

const SECRET_STRIPE = "whsec_teste_rota";
const SECRET_CAMINHO = "segredo-do-caminho";
const ORDER = "77777777-7777-4777-8777-777777777777";
const TOTAL = 97000;

let fake: FakeSupabase;

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => fake,
}));

// Só o DESPACHO de rede do Purchase é dublê — o registro do direito ao
// evento (pixel_event_log) e o aviso de venda usam o código real contra o
// fake, porque a idempotência DELES também está em teste aqui.
const despachar = vi.fn();
vi.mock("@/lib/tracking/despachar", () => ({
  despacharPurchase: (...a: unknown[]) => despachar(...a),
}));

function pedidoAtual() {
  const linha = fake.tabela("orders")[0];
  if (!linha) throw new Error("fixture de pedido sumiu");
  return linha;
}

function caminho(): string {
  return createHash("sha256").update(SECRET_CAMINHO).digest("hex");
}

function assinar(corpo: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", SECRET_STRIPE).update(`${t}.${corpo}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

function requisicao(corpo: string, opts: { assinatura?: string | null } = {}): Request {
  const headers = new Headers();
  const assinatura = opts.assinatura === undefined ? assinar(corpo) : opts.assinatura;
  if (assinatura) headers.set("stripe-signature", assinatura);
  return new Request("http://local/api/webhooks/stripe/x", {
    method: "POST",
    headers,
    body: corpo,
  });
}

function eventoPagamento(eventId = "evt_pago_1", sessao: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_e2e",
        client_reference_id: ORDER,
        payment_status: "paid",
        amount_total: TOTAL,
        currency: "usd",
        ...sessao,
      },
    },
  });
}

function eventoReembolso(eventId = "evt_refund_1") {
  return JSON.stringify({
    id: eventId,
    type: "charge.refunded",
    data: { object: { id: "ch_1", payment_intent: "pi_1", metadata: { order_id: ORDER } } },
  });
}

/** O que a "Stripe" responde quando confirmPayment pergunta pela sessão. */
function stripeResponde(sessao: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "cs_test_e2e",
          client_reference_id: ORDER,
          payment_status: "paid",
          amount_total: TOTAL,
          currency: "usd",
          ...sessao,
        }),
        { status: 200 }
      )
    )
  );
}

async function rota() {
  const { POST } = await import("@/app/api/webhooks/stripe/[segredo]/route");
  return (corpo: string, opts: { assinatura?: string | null; segredo?: string } = {}) =>
    POST(requisicao(corpo, opts), {
      params: Promise.resolve({ segredo: opts.segredo ?? caminho() }),
    });
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  despachar.mockClear();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET_STRIPE);
  vi.stubEnv("PAYMENT_WEBHOOK_SECRET", SECRET_CAMINHO);
  vi.spyOn(console, "error").mockImplementation(() => {});
  fake = new FakeSupabase(
    {
      orders: [
        {
          id: ORDER,
          order_number: "REV-E2E",
          status: "new",
          payment_status: "pending",
          shipping_status: "not_ready",
          total_cents: TOTAL,
          currency: "USD",
        },
      ],
      payments: [],
      payment_events: [],
      pixel_event_log: [],
      order_notifications: [],
      audit_logs: [],
    },
    [...UNICOS_REAIS, { tabela: "order_notifications", colunas: ["order_id", "kind"] }]
  );
});

describe("o caminho feliz, uma vez", () => {
  it("evento assinado confirma o pedido: paid + awaiting_label + trilha completa", async () => {
    stripeResponde({});
    const post = await rota();

    const resposta = await post(eventoPagamento());
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, pago: true });

    const pedido = pedidoAtual();
    expect(pedido.payment_status).toBe("paid");
    expect(pedido.shipping_status).toBe("awaiting_label");
    expect(fake.tabela("payments").filter((p) => p.status === "approved")).toHaveLength(1);
    expect(fake.tabela("payment_events")).toHaveLength(1);
    expect(fake.tabela("payment_events")[0]?.processed_at).toBeTruthy();
    expect(despachar).toHaveBeenCalledTimes(1);
  });
});

describe("o mesmo evento, dez vezes", () => {
  it("1 pagamento, 1 transição, 1 evento, 1 notificação — 9 'repetido'", async () => {
    stripeResponde({});
    const post = await rota();

    const respostas = [];
    for (let i = 0; i < 10; i += 1) {
      respostas.push(await (await post(eventoPagamento("evt_repetido"))).json());
    }

    expect(respostas[0]).toMatchObject({ ok: true, pago: true });
    expect(respostas.slice(1).every((r) => r.repetido === true)).toBe(true);

    expect(fake.tabela("payment_events")).toHaveLength(1);
    expect(fake.tabela("payments").filter((p) => p.status === "approved")).toHaveLength(1);
    expect(fake.tabela("pixel_event_log")).toHaveLength(1);
    expect(fake.tabela("order_notifications")).toHaveLength(1);
    expect(despachar).toHaveBeenCalledTimes(1);
  });

  it("evento NOVO sobre pedido já pago também não redispara nada", async () => {
    stripeResponde({});
    const post = await rota();

    await post(eventoPagamento("evt_a"));
    // A coluna gerada `status` viraria 'paid' no banco real; o fake não a
    // deriva, então simula o que o Postgres teria feito.
    pedidoAtual().status = "paid";
    const segunda = await (await post(eventoPagamento("evt_b"))).json();

    expect(segunda).toMatchObject({ ok: true, pago: true });
    expect(fake.tabela("payments").filter((p) => p.status === "approved")).toHaveLength(1);
    expect(despachar).toHaveBeenCalledTimes(1);
  });
});

describe("adulterações — nenhuma move o pedido", () => {
  it("valor pago menor que o total não confirma", async () => {
    stripeResponde({ amount_total: 100 });
    const post = await rota();
    const r = await (await post(eventoPagamento())).json();
    expect(r.pago).toBe(false);
    expect(pedidoAtual().payment_status).toBe("pending");
  });

  it("moeda trocada não confirma (97000 EUR não paga pedido em USD)", async () => {
    stripeResponde({ currency: "eur" });
    const post = await rota();
    const r = await (await post(eventoPagamento())).json();
    expect(r.pago).toBe(false);
    expect(pedidoAtual().payment_status).toBe("pending");
  });

  it("sessão paga de OUTRO pedido não confirma este", async () => {
    stripeResponde({ client_reference_id: "pedido-alheio" });
    const post = await rota();
    const r = await (await post(eventoPagamento())).json();
    expect(r.pago).toBe(false);
    expect(pedidoAtual().payment_status).toBe("pending");
  });

  it("pedido inexistente responde sem confirmar nem quebrar", async () => {
    stripeResponde({});
    const post = await rota();
    const corpo = JSON.stringify({
      id: "evt_fantasma",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_x",
          client_reference_id: "00000000-0000-4000-8000-000000000000",
          payment_status: "paid",
        },
      },
    });
    const resposta = await post(corpo);
    expect(resposta.status).toBe(200);
    expect((await resposta.json()).pago).toBe(false);
  });

  it("assinatura forjada: 400 e NENHUMA linha escrita", async () => {
    const post = await rota();
    const resposta = await post(eventoPagamento(), { assinatura: "t=1,v1=forjada" });
    expect(resposta.status).toBe(400);
    expect(fake.tabela("payment_events")).toHaveLength(0);
    expect(pedidoAtual().payment_status).toBe("pending");
  });

  it("segredo do caminho errado: 404 sem processar", async () => {
    const post = await rota();
    const resposta = await post(eventoPagamento(), { segredo: "varredura" });
    expect(resposta.status).toBe(404);
    expect(fake.tabela("payment_events")).toHaveLength(0);
  });
});

describe("fora de ordem e reembolso", () => {
  it("reembolso ANTES do pagamento não move um pedido pending", async () => {
    const post = await rota();
    const r = await (await post(eventoReembolso())).json();
    expect(r).toMatchObject({ ok: true, reembolso: "ignorado" });
    expect(pedidoAtual().payment_status).toBe("pending");
  });

  it("pagamento e DEPOIS reembolso: paid → refunded, uma vez só", async () => {
    stripeResponde({});
    const post = await rota();

    await post(eventoPagamento());
    const r1 = await (await post(eventoReembolso("evt_r1"))).json();
    const r2 = await (await post(eventoReembolso("evt_r2"))).json();

    expect(r1.reembolso).toBe("reembolsado");
    // Segundo aviso de reembolso: o pedido já não está 'paid' — ignorado.
    expect(r2.reembolso).toBe("ignorado");
    expect(pedidoAtual().payment_status).toBe("refunded");
    expect(fake.tabela("payments").filter((p) => p.status === "refunded")).toHaveLength(1);
  });

  it("evento 'ignorar' (expired etc.) registra e não toca o pedido", async () => {
    const post = await rota();
    const corpo = JSON.stringify({
      id: "evt_exp",
      type: "checkout.session.expired",
      data: { object: { id: "cs_x", client_reference_id: ORDER, payment_status: "unpaid" } },
    });
    const r = await (await post(corpo)).json();
    expect(r).toMatchObject({ ok: true, ignorado: true });
    expect(pedidoAtual().payment_status).toBe("pending");
    expect(fake.tabela("payment_events")).toHaveLength(1);
  });
});

describe("indisponibilidade — o evento pode voltar", () => {
  it("Stripe fora do ar: 503, evento apagado, e o REENVIO depois confirma", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const post = await rota();

    const resposta = await post(eventoPagamento("evt_retry"));
    expect(resposta.status).toBe(503);
    // Apagado para o reenvio não bater na trava de idempotência.
    expect(fake.tabela("payment_events")).toHaveLength(0);
    expect(pedidoAtual().payment_status).toBe("pending");

    stripeResponde({});
    const denovo = await (await post(eventoPagamento("evt_retry"))).json();
    expect(denovo).toMatchObject({ ok: true, pago: true });
    expect(pedidoAtual().payment_status).toBe("paid");
  });
});
