import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "pixel_teste");
  vi.stubEnv("META_CAPI_TOKEN", "token_teste");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const pedido = {
  eventId: "pedido_teste", eventTimeSegundos: 1700000000,
  valorCents: 10000, orderNumber: "teste", sourceUrl: "https://www.reveraprotesecapilar.com/obrigado",
  contents: [{ id: "produto", quantity: 1, item_price: 100 }], numItems: 1, pessoa: {},
};

describe("confirmação de entrega CAPI", () => {
  it.each([{}, { events_received: 0 }, { events_received: "1" }, { error: {} }])(
    "não confirma HTTP 200 sem aceitação válida: %j", async (body) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body)));
      const { enviarPurchaseMeta } = await import("@/lib/tracking/meta-capi");
      expect((await enviarPurchaseMeta(pedido)).sucesso).toBe(false);
    });
  it("confirma evento aceito, mantém identificador e envia token no corpo", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ events_received: 1 })));
    const { enviarPurchaseMeta } = await import("@/lib/tracking/meta-capi");
    expect((await enviarPurchaseMeta(pedido)).sucesso).toBe(true);
    const [url, options] = fetch.mock.calls[0]!;
    expect(String(url)).not.toContain("token_teste");
    const body = JSON.parse(String(options?.body));
    expect(body.access_token).toBe("token_teste");
    expect(body.data[0].event_id).toBe(pedido.eventId);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it("falha de rede permite recuperação em vez de marcar entrega", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("rede indisponível"));
    const { enviarPurchaseMeta } = await import("@/lib/tracking/meta-capi");
    expect((await enviarPurchaseMeta(pedido)).sucesso).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("recupera falhas transitórias conservando o mesmo evento", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValueOnce(new Response("indisponível", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ events_received: 1 })));
    const { enviarPurchaseMeta } = await import("@/lib/tracking/meta-capi");
    expect((await enviarPurchaseMeta(pedido)).sucesso).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(new Set(fetch.mock.calls.map((c) => String(c[1]?.body))).size).toBe(1);
  });
  it("não repete erro permanente do provedor", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: {} }), { status: 400 }));
    const { enviarPurchaseMeta } = await import("@/lib/tracking/meta-capi");
    expect((await enviarPurchaseMeta(pedido)).sucesso).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
