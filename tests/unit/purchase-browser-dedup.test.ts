// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase, UNICOS_REAIS } from "../stubs/fake-supabase";

const PEDIDO = "11111111-1111-4111-8111-111111111111";

describe("deduplicação navegador × CAPI", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "pixel-teste");
    vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    document.body.innerHTML = "";
  });

  it("leva o snapshot tardio da outbox pelo PurchaseTracker até o mesmo eventID do fbq", async () => {
    vi.resetModules();
    const fbq = vi.fn();
    window.fbq = fbq;
    const db = new FakeSupabase(
      {
        orders: [{ id: PEDIDO, order_number: "REV-USD", status: "paid", total_cents: 99999, currency: "BRL" }],
        payments: [{ order_id: PEDIDO, provider: "stripe", status: "approved" }],
        order_items: [{ order_id: PEDIDO, variant_id: "variante", quantity: 1, unit_price_cents: 15900 }],
        pixel_event_log: [{ event_name: "Purchase", event_id: PEDIDO, order_id: PEDIDO, sent_web: false, sent_capi: true }],
        purchase_outbox: [{ order_id: PEDIDO, currency: "USD", value_cents: 15900 }],
      },
      UNICOS_REAIS
    );

    const { consumirPurchaseParaNavegador } = await import("@/lib/tracking/purchase");
    const payload = await consumirPurchaseParaNavegador(db as never, PEDIDO);
    expect(payload).not.toBeNull();
    const { PurchaseTracker } = await import("@/app/pedido/[token]/PurchaseTracker");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(React.createElement(PurchaseTracker, { payload: payload! })));

    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq).toHaveBeenCalledWith(
      "track",
      "Purchase",
      expect.objectContaining({ currency: "USD", value: 159 }),
      { eventID: PEDIDO }
    );

    await act(async () => root.unmount());
  });
});
