import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  local: "authorized", remote: "authorized", updates: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>, calls: 0,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/fiscal/focus-nfe", () => ({
  FocusNfeProvider: class {
    async consult() {
      state.calls++;
      if (state.remote === "timeout") throw new Error("timeout");
      return { status: state.remote, accessKey: "1".repeat(44),
        safeResponse: { status: state.remote === "cancelled" ? "cancelado" : "autorizado" } };
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({
  from(table: string) {
    return {
      select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: table === "order_focus_nfe" ? {
        id: "focus-1", order_id: "order-1", reference: "REF1", environment: "homologacao",
        status: state.local, access_key: "1".repeat(44),
      } : null, error: null }; },
      update(payload: Record<string, unknown>) {
        state.updates.push(payload);
        return { eq() { return this; }, select() { return this; },
          async maybeSingle() { return { data: { id: "focus-1" }, error: null }; } };
      },
      async insert(payload: Record<string, unknown>) { state.events.push(payload); return { error: null }; },
    };
  },
}) }));
import { exigirFocusAutorizadaRecente } from "@/lib/fiscal/focus-fresh-authorization";

describe("consulta Focus antes de remessa/despacho", () => {
  beforeEach(() => { state.local = "authorized"; state.remote = "authorized";
    state.updates = []; state.events = []; state.calls = 0; });
  it("falha fechado em timeout", async () => {
    state.remote = "timeout";
    expect(await exigirFocusAutorizadaRecente("order-1")).toHaveProperty("error");
    expect(state.updates).toEqual([{ consulted_at: null }]);
  });
  it("grava cancelamento externo e bloqueia ação física", async () => {
    state.remote = "cancelled";
    expect(await exigirFocusAutorizadaRecente("order-1")).toHaveProperty("error");
    expect(state.updates[1]).toMatchObject({ status: "cancelled" });
    expect(state.events[0]).toMatchObject({ event: "cancelled_detected" });
  });
  it("só libera após consulta autorizada e salva horário recente", async () => {
    expect(await exigirFocusAutorizadaRecente("order-1")).toEqual({ ok: true });
    expect(state.calls).toBe(1);
    expect(state.updates[0]).toEqual({ consulted_at: null });
    expect(state.updates[1]).toHaveProperty("consulted_at");
  });
});
