import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ chamadas: 0, falhar: true }));
vi.mock("@/lib/payments/paypal-provider", () => ({
  PayPalProvider: class {
    async adicionarRastreio() {
      state.chamadas++;
      return state.falhar ? { ok: false, motivo: "temporário" } : { ok: true };
    }
  },
}));

import { deveRepararStatusAposGuia, enviarRastreioDhlAoPaypal, guiaDhlFinal } from "@/lib/shipping/dhl/paypal-tracking";

const pagamentos = [{ provider: "paypal", status: "approved", provider_payment_id: "CAPTURE-1" }];

describe("recuperação do rastreio DHL no PayPal", () => {
  beforeEach(() => { state.chamadas = 0; state.falhar = true; });

  it("permite repetir a mesma guia depois de uma falha transitória", async () => {
    expect(await enviarRastreioDhlAoPaypal(pagamentos, "pedido-1", "1234567890"))
      .toEqual({ falhou: "temporário" });
    state.falhar = false;
    expect(await enviarRastreioDhlAoPaypal(pagamentos, "pedido-1", "1234567890"))
      .toBe("enviado");
    expect(state.chamadas).toBe(2);
  });

  it("não chama o PayPal quando o pedido foi pago por outro gateway", async () => {
    expect(await enviarRastreioDhlAoPaypal([], "pedido-1", "1234567890")).toBe("sem_paypal");
    expect(state.chamadas).toBe(0);
  });

  it("só aceita uma guia final, válida e pertencente à DHL", () => {
    expect(guiaDhlFinal({ provider: "dhl", status: "label_created", tracking_code: "12345-67890" })).toBe("1234567890");
    expect(guiaDhlFinal({ provider: "correios", status: "label_created", tracking_code: "1234567890" })).toBeNull();
    expect(guiaDhlFinal({ provider: "dhl", status: "creation_unknown", tracking_code: "1234567890" })).toBeNull();
    expect(guiaDhlFinal({ provider: "dhl", status: "registrado_manual", tracking_code: "inválida" })).toBeNull();
  });

  it("reconcilia todos os estados parciais depois que a guia final já foi salva", () => {
    expect(deveRepararStatusAposGuia("label_processing")).toBe(true);
    expect(deveRepararStatusAposGuia("awaiting_label")).toBe(true);
    expect(deveRepararStatusAposGuia("shipping_error")).toBe(true);
    expect(deveRepararStatusAposGuia("label_created")).toBe(false);
    expect(deveRepararStatusAposGuia("shipped")).toBe(false);
  });
});
