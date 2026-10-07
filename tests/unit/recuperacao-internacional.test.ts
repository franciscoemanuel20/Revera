import { describe, expect, it } from "vitest";
import { montarPreviasRecuperacaoInternacional, type PedidoRecuperacaoInternacional } from "@/lib/notificacoes/recuperacao-internacional";

function pedido(overrides: Partial<PedidoRecuperacaoInternacional> = {}): PedidoRecuperacaoInternacional {
  return { id: "1", orderNumber: "REV-1", createdAt: "2026-10-07T10:00:00Z", currency: "USD", totalCents: 10000, paymentStatus: "pending", country: "US", customer: { name: "Ana Silva", email: "ANA@example.com", phone: "+1 202" }, ...overrides };
}

describe("prévia de recuperação internacional", () => {
  it("deduplica por pessoa, mantém o pedido mais recente e localiza", () => {
    const previas = montarPreviasRecuperacaoInternacional([
      pedido({ id: "old", createdAt: "2026-10-06T10:00:00Z" }),
      pedido({ id: "new", orderNumber: "REV-NEW", createdAt: "2026-10-07T11:00:00Z" }),
      pedido({ id: "de", country: "DE", customer: { name: "Karl", email: "karl@example.com", phone: null } }),
    ]);
    expect(previas.map((p) => p.id)).toEqual(["new", "de"]);
    expect(previas[0]?.mensagem).toContain("No new charge");
    expect(previas[1]?.idioma).toBe("de");
  });

  it("nunca inclui identidade que tenha qualquer pedido pago", () => {
    expect(montarPreviasRecuperacaoInternacional([
      pedido({ id: "pending" }),
      pedido({ id: "paid", paymentStatus: "paid", createdAt: "2026-10-01T10:00:00Z" }),
    ])).toEqual([]);
  });

  it("usa pagamento recente para suprimir abandono antigo sem recuperar checkout recente", () => {
    const limite = "2026-10-07T11:00:00Z";
    expect(montarPreviasRecuperacaoInternacional([
      pedido({ id: "abandonado", createdAt: "2026-10-07T10:00:00Z" }),
      pedido({ id: "pago-recente", paymentStatus: "paid", createdAt: "2026-10-07T11:30:00Z" }),
      pedido({
        id: "pendente-recente-outra-pessoa",
        createdAt: "2026-10-07T11:30:00Z",
        customer: { name: "Bia", email: "bia@example.com", phone: null },
      }),
    ], { abandonadoAntesDe: limite })).toEqual([]);
  });
});
