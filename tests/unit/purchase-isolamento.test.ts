import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { podeEnviarConversao, PROVIDERS_SIMULADOS } from "@/lib/tracking/permissao";
import {
  consumirPurchaseParaNavegador,
  registrarPurchasePendente,
} from "@/lib/tracking/purchase";
import { FakeSupabase, UNICOS_REAIS } from "../stubs/fake-supabase";

/**
 * P0-3 — separação absoluta entre teste e produção no Purchase.
 *
 * Risco financeiro protegido: uma compra simulada virando conversão na conta
 * de anúncios real. O prejuízo não é o evento em si — é a Meta passar a
 * otimizar as campanhas em cima de vendas que nunca existiram, gastando
 * orçamento para buscar mais gente parecida com quem não comprou.
 *
 * Os oito cenários exigidos estão nomeados abaixo, um a um.
 */

const ORIGINAL = { ...process.env };
const PEDIDO = "11111111-1111-4111-8111-111111111111";

function ambiente(vars: Record<string, string | undefined>) {
  for (const k of [
    "NODE_ENV",
    "VERCEL_ENV",
    "TRACKING_ALLOW_DEV_SEND",
    "META_TEST_EVENT_CODE",
  ]) {
    delete (process.env as Record<string, string | undefined>)[k];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) (process.env as Record<string, string>)[k] = v;
  }
}

/** Banco com um pedido pago pelo provedor informado. */
function bancoComPedidoPago(provider: string, status = "paid") {
  return new FakeSupabase(
    {
      orders: [
        {
          id: PEDIDO,
          order_number: "REV-TESTE01",
          status,
          total_cents: 160000,
        },
      ],
      payments: [
        { order_id: PEDIDO, provider, status: "approved", amount_cents: 160000 },
      ],
      order_items: [
        { order_id: PEDIDO, variant_id: "var-1", quantity: 1, unit_price_cents: 160000 },
      ],
      pixel_event_log: [
        {
          event_name: "Purchase",
          event_id: PEDIDO,
          order_id: PEDIDO,
          sent_web: false,
          sent_capi: false,
          sent_ga4: false,
        },
      ],
    },
    UNICOS_REAIS
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cliente = (f: FakeSupabase) => f as any;

beforeEach(() => ambiente({ VERCEL_ENV: "production" }));
afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL)) delete (process.env as Record<string, string | undefined>)[k];
  }
  Object.assign(process.env, ORIGINAL);
});

describe("CENÁRIO 1 — mock não envia Purchase real", () => {
  it("a permissão recusa provedor simulado, mesmo em produção", () => {
    ambiente({ VERCEL_ENV: "production" });
    const d = podeEnviarConversao({ providerPagamento: "mock" });
    expect(d.pode).toBe(false);
    expect(d.motivo).toMatch(/simulado/);
  });

  it("o navegador também não recebe payload de compra simulada", async () => {
    ambiente({ VERCEL_ENV: "production" });
    const db = bancoComPedidoPago("mock");
    expect(await consumirPurchaseParaNavegador(cliente(db), PEDIDO)).toBeNull();
  });

  it("recusar não gasta o direito ao evento — sent_web continua false", async () => {
    ambiente({ VERCEL_ENV: "production" });
    const db = bancoComPedidoPago("mock");
    await consumirPurchaseParaNavegador(cliente(db), PEDIDO);
    expect(db.tabela("pixel_event_log")[0]?.sent_web).toBe(false);
  });

  it("todo provedor da lista de simulados é recusado", () => {
    for (const p of PROVIDERS_SIMULADOS) {
      expect(podeEnviarConversao({ providerPagamento: p }).pode).toBe(false);
    }
  });
});

describe("CENÁRIO 2 — pagamento recusado não envia", () => {
  it("sem pagamento aprovado, não há payload", async () => {
    const db = new FakeSupabase(
      {
        orders: [{ id: PEDIDO, order_number: "REV-X", status: "new", total_cents: 160000 }],
        payments: [{ order_id: PEDIDO, provider: "infinitepay", status: "failed" }],
        pixel_event_log: [
          { event_name: "Purchase", event_id: PEDIDO, sent_web: false },
        ],
      },
      UNICOS_REAIS
    );
    expect(await consumirPurchaseParaNavegador(cliente(db), PEDIDO)).toBeNull();
  });
});

describe("CENÁRIO 3 — pagamento pendente não envia", () => {
  it("pedido ainda em 'new' não gera Purchase", async () => {
    const db = bancoComPedidoPago("infinitepay", "new");
    expect(await consumirPurchaseParaNavegador(cliente(db), PEDIDO)).toBeNull();
  });

  it("pedido cancelado não gera Purchase", async () => {
    const db = bancoComPedidoPago("infinitepay", "canceled");
    expect(await consumirPurchaseParaNavegador(cliente(db), PEDIDO)).toBeNull();
  });
});

describe("CENÁRIO 4 — acesso direto à página de obrigado não envia", () => {
  it("pedido que existe mas nunca foi pago não dá payload nenhum", async () => {
    const db = new FakeSupabase(
      {
        orders: [{ id: PEDIDO, order_number: "REV-X", status: "new", total_cents: 160000 }],
        payments: [],
        pixel_event_log: [],
      },
      UNICOS_REAIS
    );
    expect(await consumirPurchaseParaNavegador(cliente(db), PEDIDO)).toBeNull();
  });

  it("pedido inexistente não quebra e não envia", async () => {
    const db = new FakeSupabase({ orders: [], payments: [] }, UNICOS_REAIS);
    expect(await consumirPurchaseParaNavegador(cliente(db), "nao-existe")).toBeNull();
  });
});

describe("CENÁRIO 5 — refresh não duplica", () => {
  it("dez aberturas da página de obrigado produzem UM payload", async () => {
    const db = bancoComPedidoPago("infinitepay");
    const resultados = [];
    for (let i = 0; i < 10; i++) {
      resultados.push(await consumirPurchaseParaNavegador(cliente(db), PEDIDO));
    }
    expect(resultados.filter(Boolean)).toHaveLength(1);
    expect(resultados[0]).not.toBeNull();
    expect(db.tabela("pixel_event_log")[0]?.sent_web).toBe(true);
  });
});

describe("CENÁRIO 6 — webhook duplicado não duplica", () => {
  it("registrar a pendência cinco vezes cria UMA linha", async () => {
    const db = new FakeSupabase({ pixel_event_log: [] }, UNICOS_REAIS);
    for (let i = 0; i < 5; i++) {
      await registrarPurchasePendente(cliente(db), PEDIDO);
    }
    expect(db.tabela("pixel_event_log")).toHaveLength(1);
  });

  it("o unique do banco é o que garante — não um if", async () => {
    const db = new FakeSupabase({ pixel_event_log: [] }, UNICOS_REAIS);
    const r1 = await cliente(db)
      .from("pixel_event_log")
      .insert({ event_name: "Purchase", event_id: PEDIDO });
    const r2 = await cliente(db)
      .from("pixel_event_log")
      .insert({ event_name: "Purchase", event_id: PEDIDO });
    expect(r1.error).toBeNull();
    expect(r2.error?.code).toBe("23505");
  });
});

describe("CENÁRIO 7 — pagamento confirmado gera exatamente um Purchase", () => {
  it("o payload sai uma vez, com valor e moeda corretos", async () => {
    const db = bancoComPedidoPago("infinitepay");
    const p = await consumirPurchaseParaNavegador(cliente(db), PEDIDO);
    expect(p).not.toBeNull();
    expect(p?.valueCents).toBe(160000);
    expect(p?.currency).toBe("BRL");
    expect(p?.eventId).toBe(PEDIDO);
    expect(p?.numItems).toBe(1);
    // event_id = orders.id é o que deduplica navegador × CAPI na Meta.
    expect(p?.eventId).toBe(p?.orderId);
    expect(await consumirPurchaseParaNavegador(cliente(db), PEDIDO)).toBeNull();
  });
});

describe("CENÁRIO 8 — ambiente de teste não contamina produção", () => {
  it("desenvolvimento com pagamento REAL ainda assim não envia", () => {
    ambiente({ NODE_ENV: "development" });
    const d = podeEnviarConversao({ providerPagamento: "infinitepay" });
    expect(d.pode).toBe(false);
    expect(d.motivo).toMatch(/fora de produção/);
  });

  it("preview da Vercel não envia", () => {
    ambiente({ VERCEL_ENV: "preview" });
    expect(podeEnviarConversao({ providerPagamento: "infinitepay" }).pode).toBe(false);
  });

  it("o navegador em desenvolvimento não recebe payload nem com pagamento real", async () => {
    ambiente({ NODE_ENV: "development" });
    const db = bancoComPedidoPago("infinitepay");
    expect(await consumirPurchaseParaNavegador(cliente(db), PEDIDO)).toBeNull();
  });

  it("liberar dev SEM código de teste continua bloqueado", () => {
    ambiente({ NODE_ENV: "development", TRACKING_ALLOW_DEV_SEND: "1" });
    const d = podeEnviarConversao({ providerPagamento: "infinitepay" });
    expect(d.pode).toBe(false);
    expect(d.motivo).toMatch(/META_TEST_EVENT_CODE/);
  });

  it("com código de teste, envia MARCADO COMO TESTE — nunca como venda", () => {
    ambiente({
      NODE_ENV: "development",
      TRACKING_ALLOW_DEV_SEND: "1",
      META_TEST_EVENT_CODE: "TEST12345",
    });
    const d = podeEnviarConversao({ providerPagamento: "infinitepay" });
    expect(d.pode).toBe(true);
    expect(d.comoTeste).toBe(true);
  });

  it("nem com código de teste um pagamento MOCK passa", () => {
    ambiente({
      NODE_ENV: "development",
      TRACKING_ALLOW_DEV_SEND: "1",
      META_TEST_EVENT_CODE: "TEST12345",
    });
    expect(podeEnviarConversao({ providerPagamento: "mock" }).pode).toBe(false);
  });

  it("produção com pagamento real envia como venda de verdade", () => {
    ambiente({ VERCEL_ENV: "production" });
    const d = podeEnviarConversao({ providerPagamento: "infinitepay" });
    expect(d.pode).toBe(true);
    expect(d.comoTeste).toBe(false);
  });

  it("provedor desconhecido é recusado (fail-closed)", () => {
    ambiente({ VERCEL_ENV: "production" });
    expect(podeEnviarConversao({ providerPagamento: null }).pode).toBe(false);
    expect(podeEnviarConversao({ providerPagamento: "" }).pode).toBe(false);
  });
});
