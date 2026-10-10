import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ fail: false, calls: [] as string[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/audit", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("@/lib/fiscal/focus-fresh-authorization", () => ({
  exigirFocusAutorizadaRecente: async () => {
    state.calls.push("consult");
    return state.fail ? { error: "Focus indisponível" } : { ok: true };
  },
}));
vi.mock("@/lib/internacional/processo-exportacao-server", () => ({
  carregarProcessosExportacao: async (_client: unknown, ids: string[]) => new Map([[ids[0], {
    entrada: { internacional: true, legacyManualNfe: false },
    avaliacao: { podeDespachar: true, bloqueiosDespacho: [] },
  }]]),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  from: () => {
    let updating = false;
    const q = {
      select() { return q; }, eq() { return q; }, is() { return q; },
      update() { updating = true; state.calls.push("update"); return q; },
      async maybeSingle() { return { data: updating ? { id: "order" } : {
        id: "order", payment_status: "paid", shipping_status: "shipped", canceled_at: null,
      }, error: null }; },
    };
    return q;
  },
}) }));
import { marcarEnvioAction } from "@/app/admin/(protected)/pedidos/actions";
describe("registro de entrega internacional", () => {
  beforeEach(() => { state.fail = false; state.calls = []; });
  const input = { orderId: "11111111-1111-4111-8111-111111111111", novoEnvio: "delivered" as const };
  it("renova a autorização antes de registrar entrega dias depois do despacho", async () => {
    expect(await marcarEnvioAction(input)).toEqual({ ok: true });
    expect(state.calls).toEqual(["consult", "update"]);
  });
  it("não grava entrega se a consulta atual falhar", async () => {
    state.fail = true;
    expect(await marcarEnvioAction(input)).toHaveProperty("error");
    expect(state.calls).toEqual(["consult"]);
  });
});
