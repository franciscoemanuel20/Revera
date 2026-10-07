/**
 * E-mail de confirmação ao cliente (07/10/2026): idioma pelo país, CDC só
 * para entrega no Brasil, Muster alemão, e UM e-mail por pedido.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "../stubs/fake-supabase";

const PEDIDO = "66666666-6666-4666-8666-666666666666";
const enviar = vi.fn();

vi.mock("@/lib/notificacoes/email-operacional", () => ({
  enviarEmail: (...a: unknown[]) => enviar(...a),
  remetente: () => "Revera <avisos@avisos.exemplo.com>",
}));

const base = {
  orderNumber: "REV-T1",
  accessToken: "tok",
  currency: "EUR",
  subtotalCents: 14650,
  discountCents: 0,
  shippingCents: 8631,
  totalCents: 23281,
  nome: "Ivan Pineda Mota",
  itens: [{ product_name_snapshot: "Micropele 0,08mm", variant_label_snapshot: "1b", quantity: 1, subtotal_cents: 14650 }],
  endereco: ["Ivan Pineda Mota", "Hauptstraße 1", "85521 Ottobrunn"],
  base: "https://loja.test",
};

beforeEach(() => {
  vi.resetModules();
  enviar.mockReset().mockResolvedValue({ estado: "enviado", id: "x" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("montarConfirmacao", () => {
  it("Alemanha: alemão, Muster-Widerrufsbelehrung e formulário, sem CDC", async () => {
    const { montarConfirmacao } = await import("@/lib/notificacoes/confirmacao-cliente");
    const m = montarConfirmacao({ ...base, pais: "DE" });
    expect(m.idioma).toBe("de");
    expect(m.assunto).toContain("REV-T1");
    expect(m.texto).toContain("Hallo Ivan,");
    expect(m.texto).toContain("je nachdem, welches der frühere Zeitpunkt ist");
    expect(m.texto).toContain("– Ende der Widerrufsbelehrung –");
    expect(m.texto).toContain("MUSTER-WIDERRUFSFORMULAR");
    expect(m.texto).toContain("https://loja.test/pedido/tok");
    expect(m.texto).not.toContain("Código de Defesa do Consumidor");
  });

  it("Brasil: português com os 7 dias do CDC", async () => {
    const { montarConfirmacao } = await import("@/lib/notificacoes/confirmacao-cliente");
    const m = montarConfirmacao({ ...base, currency: "BRL", pais: "BR" });
    expect(m.idioma).toBe("pt");
    expect(m.texto).toContain("art. 49 do Código de Defesa do Consumidor");
    expect(m.texto).toContain("MODELO DE FORMULÁRIO DE DESISTÊNCIA");
  });

  it("país não-Brasil em português não recebe a regra do CDC", async () => {
    const { montarConfirmacao } = await import("@/lib/notificacoes/confirmacao-cliente");
    const m = montarConfirmacao({ ...base, pais: "PT" });
    expect(m.texto).not.toContain("Código de Defesa do Consumidor");
  });
});

describe("enviarConfirmacaoAoCliente", () => {
  function banco(email: string | null = "ivan@example.com") {
    return new FakeSupabase(
      {
        orders: [{ id: PEDIDO, order_number: "REV-T1", access_token: "tok", currency: "EUR", subtotal_cents: 14650, discount_cents: 0, shipping_cents: 8631, total_cents: 23281, customer_id: "c1", address_id: "a1" }],
        customers: [{ id: "c1", full_name: "Ivan Pineda Mota", email, phone: "+49" }],
        addresses: [{ id: "a1", country: "DE", recipient_name: "Ivan Pineda Mota", company: null, cep: null, street: null, number: null, complement: null, neighborhood: null, city: "Ottobrunn", state: null, line1: "Hauptstraße 1", line2: null, postal_code: "85521", region: null }],
        order_items: [{ order_id: PEDIDO, product_name_snapshot: "Micropele 0,08mm", variant_label_snapshot: "1b", quantity: 1, subtotal_cents: 14650 }],
        order_notifications: [],
      },
      [{ tabela: "order_notifications", colunas: ["order_id", "kind"] }]
    );
  }

  it("envia uma vez só, com resposta para o e-mail da empresa", async () => {
    const fake = banco();
    const { enviarConfirmacaoAoCliente } = await import("@/lib/notificacoes/confirmacao-cliente");
    await enviarConfirmacaoAoCliente(fake as never, PEDIDO);
    await enviarConfirmacaoAoCliente(fake as never, PEDIDO);
    expect(enviar).toHaveBeenCalledTimes(1);
    const msg = enviar.mock.calls[0]?.[0] as { para: string[]; de: string; responderPara: string; assunto: string };
    expect(msg.para).toEqual(["ivan@example.com"]);
    expect(msg.de).toBe("Reverá <avisos@avisos.exemplo.com>");
    expect(msg.responderPara).toContain("@");
    expect(msg.assunto).toContain("Bestellung REV-T1");
    expect(fake.tabela("order_notifications")[0]).toMatchObject({ kind: "confirmacao_cliente", channel: "email" });
    expect(fake.tabela("order_notifications")[0]?.sent_at).toBeTruthy();
  });

  it("sem e-mail do cliente não reserva nem envia", async () => {
    const fake = banco(null);
    const { enviarConfirmacaoAoCliente } = await import("@/lib/notificacoes/confirmacao-cliente");
    await enviarConfirmacaoAoCliente(fake as never, PEDIDO);
    expect(enviar).not.toHaveBeenCalled();
    expect(fake.tabela("order_notifications")).toHaveLength(0);
  });

  it("falha no envio não lança e deixa a reserva sem sent_at", async () => {
    enviar.mockResolvedValue({ estado: "erro", motivo: "Resend fora" });
    const fake = banco();
    const { enviarConfirmacaoAoCliente } = await import("@/lib/notificacoes/confirmacao-cliente");
    await expect(enviarConfirmacaoAoCliente(fake as never, PEDIDO)).resolves.toBeUndefined();
    expect(fake.tabela("order_notifications")[0]?.sent_at ?? null).toBeNull();
  });
});
