import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  local: "authorized", remote: "authorized", updates: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>, calls: 0, nonce: "",
  heldResolve: null as null | ((value: { status: string; accessKey: string; safeResponse: { status: string } }) => void),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/fiscal/focus-nfe", () => ({
  FocusNfeProvider: class {
    async consult() {
      state.calls++;
      const mode = state.remote;
      if (mode === "timeout") throw new Error("timeout");
      if (mode === "hold") return new Promise(resolve => { state.heldResolve = resolve; });
      return { status: mode, accessKey: "1".repeat(44),
        safeResponse: { status: mode === "cancelled" ? "cancelado" : "autorizado" } };
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
        const filters: Array<[string, unknown]> = [];
        const apply = () => {
          if (filters.some(([key, value]) => key === "consultation_nonce" && value !== state.nonce))
            return { data: null, error: null };
          state.updates.push(payload);
          if (typeof payload.consultation_nonce === "string") state.nonce = payload.consultation_nonce;
          return { data: { id: "focus-1" }, error: null };
        };
        const query = {
          eq(key: string, value: unknown) { filters.push([key, value]); return query; },
          select() { return query; },
          async maybeSingle() { return apply(); },
          then(resolve: (result: ReturnType<typeof apply>) => void) { resolve(apply()); },
        };
        return query;
      },
      async insert(payload: Record<string, unknown>) { state.events.push(payload); return { error: null }; },
    };
  },
}) }));
import { exigirFocusAutorizadaRecente } from "@/lib/fiscal/focus-fresh-authorization";

describe("consulta Focus antes de remessa/despacho", () => {
  beforeEach(() => { state.local = "authorized"; state.remote = "authorized";
    state.updates = []; state.events = []; state.calls = 0; state.nonce = ""; state.heldResolve = null; });
  it("falha fechado em timeout", async () => {
    state.remote = "timeout";
    expect(await exigirFocusAutorizadaRecente("order-1")).toHaveProperty("error");
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ consulted_at: null, consultation_nonce: expect.any(String) });
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
    expect(state.updates[0]).toMatchObject({ consulted_at: null, consultation_nonce: expect.any(String) });
    expect(state.updates[1]).toHaveProperty("consulted_at");
  });
  it("resposta antiga não restaura autorização depois de consulta concorrente falhar", async () => {
    state.remote = "hold";
    const antiga = exigirFocusAutorizadaRecente("order-1");
    for (let n = 0; n < 10 && !state.heldResolve; n++) await Promise.resolve();
    expect(state.heldResolve).not.toBeNull();
    state.remote = "timeout";
    expect(await exigirFocusAutorizadaRecente("order-1")).toHaveProperty("error");
    state.heldResolve?.({ status: "authorized", accessKey: "1".repeat(44), safeResponse: { status: "autorizado" } });
    expect(await antiga).toHaveProperty("error");
    expect(state.updates.at(-1)?.consulted_at).toBeNull();
  });
});
