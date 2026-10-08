import { describe, expect, it, vi } from "vitest";
import { registrarEventoPagamento } from "@/lib/payments/journey";

describe("payment journey", () => {
  it("considera chave duplicada idempotente e não altera pagamentos", async () => {
    const insert = vi.fn(async () => ({ error: { code: "23505" } }));
    const client = { from: vi.fn((table: string) => { expect(table).toBe("payment_journey_events"); return { insert }; }) };
    expect(await registrarEventoPagamento(client, { orderId: "order", eventType: "checkout_returned_unpaid", source: "server", eventKey: "same" })).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
