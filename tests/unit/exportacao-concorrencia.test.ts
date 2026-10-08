import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ audit: 0 }));
const pedido = "11111111-1111-4111-8111-111111111111";
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/admin/audit", () => ({ registrarAuditoria: async () => { state.audit++; } }));
vi.mock("@/lib/internacional/processo-exportacao-server", () => ({ carregarProcessosExportacao: async () => new Map() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: pedido } } }) },
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/private" }, error: null }) }) },
  from: (table: string) => {
    let isUpdate = false;
    return { select() { return this; }, eq() { return this; }, update() { isUpdate = true; return this; },
      maybeSingle: async () => ({ data: table === "admin_users" ? { id: pedido } : isUpdate ? null :
        { storage_path: `${pedido}/nfe/doc.pdf`, reference: "1".repeat(44), status: "pending" }, error: null }) };
  },
}) }));
import { conferirDocumentoExportacaoAction } from "@/app/admin/(protected)/pedidos/exportacao-actions";

describe("conferência otimista de documento", () => {
  it("outra aba que concluiu primeiro impede sucesso e auditoria falsa", async () => {
    state.audit = 0;
    const r = await conferirDocumentoExportacaoAction({ orderId: pedido, kind: "nfe", aprovado: true });
    expect(r).toHaveProperty("error");
    expect(state.audit).toBe(0);
  });
});
