import { afterEach, describe, expect, it, vi } from "vitest";
import { planejadaPadrao } from "@/lib/shipping/dhl/admin-quote";

afterEach(() => vi.useRealTimers());

describe("data padrão de coleta DHL na origem brasileira", () => {
  it.each([
    ["2026-10-09T00:30:00Z", "2026-10-09"],
    ["2026-10-09T03:30:00Z", "2026-10-12"],
    ["2026-10-10T15:00:00Z", "2026-10-12"],
    ["2026-10-11T15:00:00Z", "2026-10-12"],
    ["2026-11-01T01:00:00Z", "2026-11-02"],
    ["2027-01-01T01:00:00Z", "2027-01-01"],
  ])("%s usa o próximo dia de semana em São Paulo: %s", (agora, data) => {
    // Regressão: após 21h, servidor UTC enviava sábado no lugar de sexta.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(agora));
    expect(planejadaPadrao()).toBe(`${data}T10:00:00GMT-03:00`);
  });
});
