import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "../stubs/fake-supabase";

const deps = vi.hoisted(() => ({ admin: vi.fn(), reopen: vi.fn(), claim: vi.fn(), email: vi.fn(), clear: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: deps.admin }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/cart/token", () => ({ limparTokenDoCookie: deps.clear }));
vi.mock("@/lib/cart/store", () => ({
  devolverCarrinhoParaAberto: deps.reopen,
  reivindicarCarrinhoParaPedido: deps.claim,
  lerCarrinhoCompleto: async () => ({ cartId: "synthetic-cart", subtotalSemDescontoCents: 10000, discountCents: 0,
    items: [{ variantId: "synthetic-variant", productName: "Synthetic item", variantLabel: null, quantity: 1, unitPriceCents: 10000, subtotalCents: 10000 }] }),
}));
vi.mock("@/lib/shipping/cotar", () => ({ cotarFrete: async () => ({ escolhida: { serviceName: "Sandbox", carrier: "Mock", priceCents: 1990, deliveryTime: 3 }, opcoes: [] }) }));
vi.mock("@/lib/notificacoes/email-operacional", () => ({ avisarPedidoPendentePorEmail: deps.email }));
vi.mock("@/lib/payments/revera", () => ({ reveraApplePayDisponivel: async () => false }));

import { criarPedidoAction } from "@/app/checkout/actions";

const input = { name: "Synthetic Checkout", email: "checkout@example.invalid", phone: "11900000000", cpf: "52998224725", cep: "01001000", street: "Rua Sintetica", number: "1", complement: null, neighborhood: "Teste", city: "Sao Paulo", state: "SP", trackingConsent: false };
let db: FakeSupabase;
beforeEach(() => {
  vi.clearAllMocks();
  db = new FakeSupabase({ orders: [{ id: "existing-order" }], customers: [{ id: "existing-customer" }], addresses: [{ id: "existing-address" }] });
  deps.admin.mockReturnValue(db);
  deps.claim.mockResolvedValue(true);
  deps.email.mockResolvedValue({ estado: "desligado" });
});

describe("national checkout partial order", () => {
  it("removes only its partial order and customer before reopening after item failure", async () => {
    db.falharProxima("order_items", "insert", { code: "42703", message: 'record "old" has no field "status"' });
    expect(await criarPedidoAction(input)).toMatchObject({ erro: expect.stringContaining("itens") });
    expect(db.tabela("orders")).toEqual([{ id: "existing-order" }]);
    expect(db.tabela("customers")).toEqual([{ id: "existing-customer" }]);
    expect(deps.reopen).toHaveBeenCalledOnce();
    expect(deps.email).not.toHaveBeenCalled();
    expect(deps.clear).not.toHaveBeenCalled();
  });

  it("keeps the cart claimed when deleting the partial order fails", async () => {
    db.falharProxima("order_items", "insert");
    db.falharProxima("orders", "delete");
    await criarPedidoAction(input);
    expect(db.tabela("orders")).toHaveLength(2);
    expect(db.tabela("customers")).toHaveLength(2);
    expect(deps.reopen).not.toHaveBeenCalled();
    expect(deps.email).not.toHaveBeenCalled();
  });

  it("keeps the cart claimed when customer cleanup fails", async () => {
    db.falharProxima("order_items", "insert");
    db.falharProxima("customers", "delete");
    await criarPedidoAction(input);
    expect(db.tabela("orders")).toEqual([{ id: "existing-order" }]);
    expect(deps.reopen).not.toHaveBeenCalled();
  });

  it("preserves totals and the successful payment redirect", async () => {
    await expect(criarPedidoAction(input)).rejects.toThrow("redirect:/checkout/pagamento?pedido=");
    expect(db.tabela("orders")[1]).toMatchObject({ subtotal_cents: 10000, shipping_cents: 1990, total_cents: 11990, tracking_consent: false });
    expect(db.tabela("order_items")).toHaveLength(1);
    expect(deps.email).toHaveBeenCalledOnce();
    expect(deps.reopen).not.toHaveBeenCalled();
  });
});
