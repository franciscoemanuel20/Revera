import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const CHAVE = "service-role-key-fixture-never-a-real-secret";

describe("token de confirmação da cotação", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("assina snapshot e rejeita adulteração", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", CHAVE);
    const { emitirConfirmacaoCotacao, validarConfirmacaoCotacao } = await import("@/lib/internacional/cotacao-confirmacao");
    const token = emitirConfirmacaoCotacao({
      cartId: "cart-id", carrinhoHash: "a".repeat(64), enderecoHash: "b".repeat(64),
      moeda: "USD", subtotalCentavos: 10000, freteCentavos: 5000, totalCentavos: 15000,
      codigoServico: "8", nomeServico: "Express Worldwide", prazoDias: 4,
      dataEntrega: "2026-10-09", termosVersao: "intl-v1",
    });

    expect(validarConfirmacaoCotacao(token)?.cartId).toBe("cart-id");
    const [corpo, assinatura] = token.split(".");
    const assinaturaAlterada = `${assinatura?.[0] === "a" ? "b" : "a"}${assinatura?.slice(1) ?? ""}`;
    expect(validarConfirmacaoCotacao(`${corpo}.${assinaturaAlterada}`)).toBeNull();
  });

  it("rejeita tokens expirados e tokens de emissão futura", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", CHAVE);
    const { emitirConfirmacaoCotacao, validarConfirmacaoCotacao } = await import("@/lib/internacional/cotacao-confirmacao");
    const dados = {
      cartId: "cart-id", carrinhoHash: "a".repeat(64), enderecoHash: "b".repeat(64), moeda: "USD",
      subtotalCentavos: 10000, freteCentavos: 5000, totalCentavos: 15000, codigoServico: "8",
      nomeServico: "Express Worldwide", prazoDias: 4, dataEntrega: null, termosVersao: "intl-v1",
    };
    const expirado = emitirConfirmacaoCotacao(dados);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(validarConfirmacaoCotacao(expirado)).toBeNull();

    const agora = Date.now();
    const corpoFuturo = Buffer.from(JSON.stringify({
      ...dados, versao: 1, emitidoEm: agora + 60_000, expiraEm: agora + 10 * 60_000,
    })).toString("base64url");
    const assinaturaFutura = createHmac("sha256", CHAVE).update(corpoFuturo).digest("base64url");
    expect(validarConfirmacaoCotacao(`${corpoFuturo}.${assinaturaFutura}`)).toBeNull();
  });
});
