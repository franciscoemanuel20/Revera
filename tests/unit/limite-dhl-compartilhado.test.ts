import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc: state.rpc }) }));

describe("limite DHL compartilhado", () => {
  beforeEach(() => {
    state.rpc.mockReset().mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0 }],
      error: null,
    });
  });

  it("consome limites atômicos por IP e carrinho sem enviar identificadores em claro", async () => {
    const { consumirLimiteDhlCompartilhado } = await import("@/lib/http/limite-dhl-compartilhado");
    const resultado = await consumirLimiteDhlCompartilhado(
      new Headers({ "x-vercel-forwarded-for": "203.0.113.42" }),
      "cart-private-id"
    );

    expect(resultado.permitido).toBe(true);
    expect(state.rpc).toHaveBeenCalledTimes(4);
    for (const [, args] of state.rpc.mock.calls) {
      expect(args.p_client_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(args)).not.toContain("203.0.113.42");
      expect(JSON.stringify(args)).not.toContain("cart-private-id");
    }
  });

  it("nega quando qualquer limite compartilhado foi atingido", async () => {
    state.rpc.mockImplementation(async (_name: string, args: { p_scope: string }) => ({
      data: [{ allowed: args.p_scope !== "dhl-cart-minute", retry_after_seconds: args.p_scope === "dhl-cart-minute" ? 23 : 0 }],
      error: null,
    }));
    const { consumirLimiteDhlCompartilhado } = await import("@/lib/http/limite-dhl-compartilhado");

    await expect(consumirLimiteDhlCompartilhado(new Headers({ "x-vercel-forwarded-for": "203.0.113.42" }), "cart-1"))
      .resolves.toEqual({ permitido: false, retryAfterSeconds: 23 });
  });

  it("falha fechado se o RPC compartilhado estiver indisponível", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "42883" } });
    const { consumirLimiteDhlCompartilhado } = await import("@/lib/http/limite-dhl-compartilhado");

    await expect(consumirLimiteDhlCompartilhado(new Headers(), "cart-1"))
      .resolves.toEqual({ permitido: false, retryAfterSeconds: 60, indisponivel: true });
  });
});
