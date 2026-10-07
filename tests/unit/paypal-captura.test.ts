/**
 * reavaliarCapturaPayPal (06/10/2026): o que acontece com o pedido quando o
 * PayPal segura, recusa, reembolsa ou estorna. O estado vem do PayPal (stub);
 * o teste guarda que cada estado leva à ação certa — e que NENHUM deles marca
 * pedido como pago por fora de confirmarPagamento().
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "../stubs/fake-supabase";

const PEDIDO = "55555555-5555-4555-8555-555555555555";
const ORDEM = "PAYPAL-ORDER-9";

let fake: FakeSupabase;
let estado: unknown;
const confirmar = vi.fn();
const reembolsar = vi.fn();
const email = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => fake }));
vi.mock("@/lib/payments/confirmar", () => ({
  confirmarPagamento: (...a: unknown[]) => confirmar(...a),
  registrarReembolso: (...a: unknown[]) => reembolsar(...a),
}));
vi.mock("@/lib/notificacoes/email-operacional", () => ({
  enviarEmailOperacional: (...a: unknown[]) => email(...a),
}));
vi.mock("@/lib/payments/paypal-provider", () => ({
  PayPalProvider: class {
    async estadoCaptura(ordem: string, pedido: string, _opcoes?: unknown) {
      expect(ordem).toBe(ORDEM);
      expect(pedido).toBe(PEDIDO);
      if (estado instanceof Error) throw estado;
      return estado;
    }
  },
}));

function banco(paymentStatus = "pending", pagamentoStatus = "pending") {
  fake = new FakeSupabase({
    orders: [{ id: PEDIDO, order_number: "REV-T", payment_status: paymentStatus, canceled_at: null, currency: "EUR", total_cents: 23281 }],
    payments: [{ id: "pay-1", order_id: PEDIDO, provider: "paypal", status: pagamentoStatus, provider_payment_id: ORDEM, created_at: "2026-10-06T00:00:00Z" }],
  });
}

async function reavaliar(eventoGateway: string | null = null) {
  const { reavaliarCapturaPayPal } = await import("@/lib/payments/paypal-captura");
  return reavaliarCapturaPayPal(PEDIDO, { eventId: "WH-1", paypalOrderId: ORDEM, eventoGateway });
}

beforeEach(() => {
  vi.resetModules();
  confirmar.mockReset().mockResolvedValue({ estado: "pago", jaEstavaPago: false });
  reembolsar.mockReset().mockResolvedValue("reembolsado");
  email.mockReset().mockResolvedValue({ estado: "enviado" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("reavaliarCapturaPayPal", () => {
  it("captura concluída confirma pelo caminho de sempre", async () => {
    banco();
    estado = { estado: "concluida" };
    await expect(reavaliar()).resolves.toEqual({ estado: "confirmado", pago: true });
    expect(confirmar).toHaveBeenCalledWith(PEDIDO, expect.objectContaining({ transactionId: ORDEM }));
  });

  it("captura retida avisa a equipe com o motivo e não mexe no pedido", async () => {
    banco();
    estado = { estado: "pendente", motivo: "RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION" };
    await expect(reavaliar()).resolves.toMatchObject({ estado: "retido" });
    expect(confirmar).not.toHaveBeenCalled();
    expect(email).toHaveBeenCalledTimes(1);
    const msg = email.mock.calls[0]?.[0] as { texto: string; idempotencyKey: string };
    expect(msg.texto).toContain("aceite manual de moeda");
    expect(msg.idempotencyKey).toBe(`revera-paypal-retido:${PEDIDO}`);
    expect(fake.tabela("orders")[0]?.payment_status).toBe("pending");
  });

  it("captura recusada libera a reserva (failed) e avisa", async () => {
    banco();
    estado = { estado: "recusada", motivo: null };
    await expect(reavaliar()).resolves.toEqual({ estado: "recusado" });
    expect(fake.tabela("payments")[0]?.status).toBe("failed");
    expect(email).toHaveBeenCalledTimes(1);
  });

  it("recusa não rebaixa um pagamento já aprovado", async () => {
    banco("pending", "approved");
    estado = { estado: "recusada", motivo: null };
    await reavaliar();
    expect(fake.tabela("payments")[0]?.status).toBe("approved");
  });

  it("estorno/chargeback registra o reembolso e manda não despachar", async () => {
    banco("paid", "approved");
    estado = { estado: "estornada", motivo: "REVERSED" };
    await expect(reavaliar()).resolves.toEqual({ estado: "reembolsado" });
    expect(reembolsar).toHaveBeenCalledWith(PEDIDO, expect.objectContaining({ provider: "paypal", transactionId: ORDEM }));
    expect((email.mock.calls[0]?.[0] as { texto: string }).texto).toContain("NÃO DESPACHAR");
  });

  it("reembolso parcial só avisa, não estorna o pedido", async () => {
    banco("paid", "approved");
    estado = { estado: "parcialmente_reembolsada" };
    await expect(reavaliar()).resolves.toEqual({ estado: "parcial" });
    expect(reembolsar).not.toHaveBeenCalled();
  });

  it("PayPal fora do ar devolve indisponível (o webhook é reenviado)", async () => {
    banco();
    estado = new Error("timeout");
    await expect(reavaliar()).resolves.toMatchObject({ estado: "indisponivel" });
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("pedido sem ordem PayPal não consulta nada", async () => {
    fake = new FakeSupabase({
      orders: [{ id: PEDIDO, order_number: "REV-T", payment_status: "pending", canceled_at: null, currency: "EUR", total_cents: 1 }],
      payments: [],
    });
    estado = { estado: "concluida" };
    await expect(reavaliar()).resolves.toEqual({ estado: "sem_paypal" });
  });

  it("aviso de chargeback com captura ainda concluída: alerta a equipe, não mexe no pedido", async () => {
    banco("paid", "approved");
    estado = { estado: "concluida" };
    await expect(reavaliar("PAYMENT.CAPTURE.REVERSED")).resolves.toMatchObject({ estado: "nada_a_fazer" });
    expect(reembolsar).not.toHaveBeenCalled();
    expect(email).toHaveBeenCalledTimes(1);
    expect((email.mock.calls[0]?.[0] as { texto: string }).texto).toContain("ANTES de despachar");
  });

  it("recusa de uma ordem num pedido já pago não muda nada nem avisa", async () => {
    banco("paid", "pending");
    estado = { estado: "recusada", motivo: null };
    await expect(reavaliar()).resolves.toMatchObject({ estado: "nada_a_fazer" });
    expect(fake.tabela("payments")[0]?.status).toBe("pending");
    expect(email).not.toHaveBeenCalled();
  });

  it("status desconhecido só avisa", async () => {
    banco("paid", "approved");
    estado = { estado: "desconhecida", status: "NOVO_STATUS" };
    await expect(reavaliar()).resolves.toMatchObject({ estado: "nada_a_fazer" });
    expect(reembolsar).not.toHaveBeenCalled();
    expect(email).toHaveBeenCalledTimes(1);
  });
});
