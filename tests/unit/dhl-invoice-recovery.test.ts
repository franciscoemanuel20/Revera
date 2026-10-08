import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

describe("reconciliação SQL de remessa DHL legada", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/00000000000036_invoice_mode_por_remessa.sql"),
    "utf8"
  );

  it("permite fixar modo API pela requisição imutável antes de recuperar o PDF", () => {
    expect(migration).toContain("if pediu_invoice then\n      modo := 'api'");
    expect(migration).toContain("'source_evidence', case when documento is null then 'request_snapshot.requestInvoice'");
  });

  it("preserva os demais campos do snapshot do exportador", () => {
    expect(migration).toContain("coalesce(remessa.metadata->'exporter_snapshot', '{}'::jsonb) ||");
    expect(migration).not.toContain("jsonb_build_object('exporter_snapshot', jsonb_build_object('invoice_mode', modo))");
  });

  it("impede administrador de forjar documentos retornados pela API DHL", () => {
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain("new.metadata->'documents' is distinct from old.metadata->'documents'");
    expect(migration).toContain("raise exception 'Documentos retornados pela DHL são imutáveis'");
    expect(migration).toContain("old.status = 'creating'");
    expect(migration).toContain("new.metadata->'request_snapshot' is distinct from old.metadata->'request_snapshot'");
    expect(migration).toContain("raise exception 'Snapshot da requisição DHL é imutável'");
    expect(migration).toContain("old.metadata->>'communication' = 'prepared_not_sent'");
    expect(migration).toContain("old.metadata->'request_snapshot' is null");
    expect(migration).toContain("coalesce(auth.role(), '') = 'service_role'\n         and new.status = 'creating'");
    expect(migration).toContain("new.status in ('label_created', 'creation_unknown')");
    expect(migration).toContain("Resultado da criação DHL só pode ser persistido pelo serviço autenticado");
  });
});

describe("persistência autenticada da tentativa DHL", () => {
  const action = readFileSync(
    resolve(process.cwd(), "src/app/admin/(protected)/pedidos/gerar-envio-dhl.ts"),
    "utf8"
  );

  it("usa service role no snapshot, no início da chamada e na resposta incerta", () => {
    expect(action).toContain('dhlPersistence.from("shipments").update({\n    metadata: { message_reference: orderId, request_snapshot: snapshot, communication: "prepared_not_sent" }');
    expect(action).toContain('dhlPersistence.from("shipments").update({\n    metadata: { message_reference: orderId, request_snapshot: snapshot, communication: "request_in_flight" }');
    expect(action).toContain('dhlPersistence.from("shipments").update({ status: "creation_unknown"');
  });

  it("rollback remove a trava incompatível com o aplicativo anterior", () => {
    const rollback = readFileSync(
      resolve(process.cwd(), "supabase/rollback/00000000000036_invoice_mode_por_remessa.sql"),
      "utf8"
    );
    expect(rollback).toContain("drop trigger if exists export_freeze_shipment_invoice_mode_trigger on shipments");
    expect(rollback).toContain("drop function if exists export_freeze_shipment_invoice_mode()");
  });
});
