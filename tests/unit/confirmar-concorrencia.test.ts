import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "../stubs/fake-supabase";

const fixture = vi.hoisted(() => ({ client: null as any, confirmar: vi.fn(), providerPorMoeda: vi.fn(), registrar: vi.fn(), despachar: vi.fn(), avisar: vi.fn(), cliente: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => fixture.client }));
vi.mock("@/lib/payments/revera", () => ({
  getReveraProviderByName: () => ({ name: "stripe", confirmPayment: fixture.confirmar }),
  getReveraProviderForCurrency: fixture.providerPorMoeda,
}));
vi.mock("@/lib/tracking/purchase", () => ({ registrarPurchasePendente: fixture.registrar }));
vi.mock("@/lib/tracking/despachar", () => ({ despacharPurchase: fixture.despachar }));
vi.mock("@/lib/notificacoes/venda-paga", () => ({ avisarVendaPaga: fixture.avisar }));
vi.mock("@/lib/notificacoes/confirmacao-cliente", () => ({ enviarConfirmacaoAoCliente: fixture.cliente }));
import { confirmarPagamento } from "@/lib/payments/confirmar";

function banco(status = "pending") {
  return new FakeSupabase({
    orders: [{ id: "order", status: "new", payment_status: "pending", currency: "USD", total_cents: 3400 }],
    payments: [{ id: "reservation", order_id: "order", provider: "stripe", provider_payment_id: "cs_test_exact", status, amount_cents: 3400 }],
  });
}
const prova = { paid: true, paidAmountCents: 3400, currency: "USD", method: "card", raw: { id: "cs_test_exact" } };
beforeEach(() => {
  vi.clearAllMocks();
  fixture.confirmar.mockResolvedValue(prova);
  fixture.providerPorMoeda.mockReturnValue({ name: "stripe", confirmPayment: fixture.confirmar });
});

describe("concorrência entre webhook e retorno Stripe", () => {
  it("mantém a sessão persistida quando o webhook aprovou a linha antes de marcar o pedido", async () => {
    const fake = banco("approved");
    fixture.client = fake;
    expect(await confirmarPagamento("order")).toEqual({ estado: "pago", jaEstavaPago: false });
    expect(fixture.confirmar).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "cs_test_exact" }));
    expect(fixture.providerPorMoeda).not.toHaveBeenCalled();
    expect(fake.tabela("payments")).toHaveLength(1);
  });

  it("duas consultas simultâneas da mesma sessão gravam uma aprovação e um conjunto de efeitos", async () => {
    const fake = banco();
    fixture.client = fake;
    let liberar!: () => void;
    const barreira = new Promise<void>(resolve => { liberar = resolve; });
    let chamadas = 0;
    fixture.confirmar.mockImplementation(async () => {
      if (++chamadas === 2) liberar();
      await barreira;
      return prova;
    });
    const resultados = await Promise.all([
      confirmarPagamento("order", { transactionId: "cs_test_exact", eventId: "evt_test" }),
      confirmarPagamento("order"),
    ]);
    expect(resultados.filter(r => r.estado === "pago" && !r.jaEstavaPago)).toHaveLength(1);
    expect(fake.tabela("payments")).toHaveLength(1);
    expect(fake.tabela("payments")[0]).toMatchObject({ status: "approved", provider_payment_id: "cs_test_exact" });
    expect(fixture.registrar).toHaveBeenCalledTimes(1);
    expect(fixture.despachar).toHaveBeenCalledTimes(1);
    expect(fixture.avisar).toHaveBeenCalledTimes(1);
    expect(fixture.cliente).toHaveBeenCalledTimes(1);
  });

  it("erro ambíguo ao atualizar a prova não cria outra linha nem confirma o pedido", async () => {
    const fake = banco();
    fake.falharProxima("payments", "update");
    fixture.client = fake;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await confirmarPagamento("order", { transactionId: "cs_test_exact" })).toMatchObject({ estado: "indisponivel" });
    expect(fake.tabela("payments")).toHaveLength(1);
    expect(fake.tabela("orders")[0]).toMatchObject({ payment_status: "pending" });
    expect(fixture.avisar).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
