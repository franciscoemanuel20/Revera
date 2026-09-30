/**
 * O Purchase carrega a hora do PAGAMENTO, não a do envio (30/09/2026).
 *
 * Antes, `event_time` era `Date.now()`: um reenvio dias depois (Meta fora do
 * ar, reprocessamento) jogava a venda para o dia errado. O teste reenvia o
 * mesmo pedido seis dias depois e exige o MESMO event_time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "../stubs/fake-supabase";

const enviarPurchaseMeta = vi.fn(async (_: { eventTimeSegundos: number }) => ({ sucesso: false }));

vi.mock("@/lib/tracking/meta-capi", () => ({ enviarPurchaseMeta }));
vi.mock("@/lib/tracking/ga4", () => ({ enviarPurchaseGa4: async () => ({ sucesso: true }) }));
vi.mock("@/lib/tracking/permissao", () => ({
  podeEnviarConversao: () => ({ pode: true, comoTeste: false }),
}));

const PEDIDO = "55555555-5555-4555-8555-555555555555";
const PAGO_EM = "2026-09-28T23:58:30.000Z";

function banco() {
  return new FakeSupabase({
    orders: [
      {
        id: PEDIDO, order_number: 1001, status: "paid", total_cents: 65000, shipping_cents: 0,
        customer_id: null, address_id: null, fbp: null, fbc: null, fbclid: null,
        ga_client_id: null, client_ip: null, user_agent: null, tracking_consent: true,
        created_at: "2026-09-28T23:40:00.000Z",
      },
    ],
    order_items: [],
    pixel_event_log: [
      { event_name: "Purchase", event_id: PEDIDO, order_id: PEDIDO, sent_capi: false, sent_ga4: false, created_at: PAGO_EM },
    ],
    conversion_logs: [],
  });
}

describe("event_time do Purchase", () => {
  beforeEach(() => enviarPurchaseMeta.mockClear());
  afterEach(() => vi.useRealTimers());

  it("usa a hora em que o pedido virou pago", async () => {
    const { despacharPurchase } = await import("@/lib/tracking/despachar");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T00:00:05Z")); // já é outro dia
    await despacharPurchase(banco() as never, PEDIDO, "infinitepay");
    expect(enviarPurchaseMeta).toHaveBeenCalledTimes(1);
    expect(enviarPurchaseMeta.mock.calls[0]![0].eventTimeSegundos).toBe(Date.parse(PAGO_EM) / 1000);
  });

  it("reenvio tardio (6 dias depois) não muda o event_time", async () => {
    const { despacharPurchase } = await import("@/lib/tracking/despachar");
    const fake = banco();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T00:00:05Z"));
    await despacharPurchase(fake as never, PEDIDO, "infinitepay"); // Meta falhou: sent_capi segue false
    vi.setSystemTime(new Date("2026-10-05T14:00:00Z"));
    await despacharPurchase(fake as never, PEDIDO, "infinitepay");
    expect(enviarPurchaseMeta).toHaveBeenCalledTimes(2);
    const [a, b] = enviarPurchaseMeta.mock.calls.map((c) => c[0].eventTimeSegundos);
    expect(b).toBe(a);
    expect(new Date(b! * 1000).toISOString()).toBe(PAGO_EM);
  });

  it("sem data registrada cai no agora, em segundos", async () => {
    const { horaDoPagamentoSegundos } = await import("@/lib/tracking/despachar");
    expect(horaDoPagamentoSegundos(null, 1_790_000_000_999)).toBe(1_790_000_000);
    expect(horaDoPagamentoSegundos("lixo", 1_790_000_000_999)).toBe(1_790_000_000);
    expect(horaDoPagamentoSegundos(PAGO_EM)).toBe(Date.parse(PAGO_EM) / 1000);
  });
});
