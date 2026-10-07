import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ failedWrites: 1, writes: 0, document: null as null | { source: string; storage_path: string; status: string } }));
const orderId = "11111111-1111-4111-8111-111111111111";
const shipmentId = "22222222-2222-4222-8222-222222222222";
const invoicePath = `${orderId}/dhl/${shipmentId}/invoice.pdf`;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/admin/audit", () => ({ registrarAuditoria: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  from(table: string) {
    return {
      select() { return this; }, eq() { return this; },
      async maybeSingle() {
        if (table === "orders") return { data: { id: orderId, order_number: "REV-1", shipments: [{
          id: shipmentId, provider: "dhl", status: "label_created", tracking_code: "1234567890",
          metadata: { request_snapshot: { exporter_snapshot: { invoice_mode: "api" } },
            documents: [{ typeCode: "invoice", storagePath: invoicePath }] },
        }] }, error: null };
        return { data: state.document, error: null };
      },
      async insert() {
        state.writes++;
        if (state.failedWrites > 0) { state.failedWrites--; return { error: { code: "timeout" } }; }
        state.document = { source: "dhl", storage_path: invoicePath, status: "pending" };
        return { error: null };
      },
      update() {
        return {
          eq() { return this; }, select() { return this; },
          async maybeSingle() {
            if (state.document?.status !== "rejected") return { data: null, error: null };
            state.document.status = "pending";
            return { data: { order_id: orderId }, error: null };
          },
        };
      },
    };
  },
}) }));

import { recuperarInvoiceDhlAction } from "@/app/admin/(protected)/pedidos/gerar-envio-dhl";

describe("recuperação da invoice após guia DHL final", () => {
  beforeEach(() => { state.failedWrites = 1; state.writes = 0; state.document = null; });

  it("permite repetir uma gravação falha sem criar outra remessa nem substituir documento conferido", async () => {
    expect(await recuperarInvoiceDhlAction({ orderId })).toHaveProperty("error");
    expect(state.document).toBeNull();
    expect(await recuperarInvoiceDhlAction({ orderId })).toHaveProperty("ok", true);
    expect(state.document).toEqual({ source: "dhl", storage_path: invoicePath, status: "pending" });
    state.document!.status = "verified";
    expect(await recuperarInvoiceDhlAction({ orderId })).toHaveProperty("ok", true);
    expect(state.writes).toBe(2);
    expect(state.document!.status).toBe("verified");
  });
  it("recoloca invoice DHL rejeitada em conferência sem gerar segunda remessa", async () => {
    state.failedWrites = 0;
    expect(await recuperarInvoiceDhlAction({ orderId })).toHaveProperty("ok", true);
    state.document!.status = "rejected";
    expect(await recuperarInvoiceDhlAction({ orderId })).toHaveProperty("ok", true);
    expect(state.document!.status).toBe("pending");
    expect(state.writes).toBe(1);
  });
});
