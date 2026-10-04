import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/ambiente", () => ({
  ehProducao: () => true,
  descricaoDoAmbiente: () => "production",
}));

describe("GA4 server Purchase", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.resetModules();
  });

  it("não chama o Google depois da janela retroativa de 72 horas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T10:00:01Z"));
    vi.stubEnv("NEXT_PUBLIC_GA4_MEASUREMENT_ID", "G-TESTE");
    vi.stubEnv("GA4_API_SECRET", "segredo-de-teste");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { enviarPurchaseGa4 } = await import("@/lib/tracking/ga4");

    const resultado = await enviarPurchaseGa4({
      eventId: "pedido-teste",
      eventTimeSegundos: Math.floor(new Date("2026-10-01T10:00:00Z").getTime() / 1000),
      currency: "BRL",
      clientId: "123.456",
      valorCents: 10000,
      freteCents: 1000,
      orderNumber: "REV-TESTE",
      contents: [{ id: "variante", quantity: 1, item_price: 90 }],
    });

    expect(resultado).toEqual(expect.objectContaining({
      sucesso: false,
      motivoPulado: expect.stringContaining("janela de 72 horas"),
    }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
