import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_teste");
  vi.stubEnv("REVERA_APPLE_PAY_ENABLED", "1");
});

describe("opções de pagamento da Reverá", () => {
  it("mantém Apple Pay/Google Pay escondido sem flag explícita", async () => {
    vi.stubEnv("REVERA_APPLE_PAY_ENABLED", "");
    const { reveraApplePayDisponivel } = await import("@/lib/payments/revera");
    expect(await reveraApplePayDisponivel()).toBe(false);
  });

  it("mostra Stripe wallet/card quando Stripe está saudável, mesmo com PayPal WIP no internacional", async () => {
    vi.stubEnv("REVERA_INTERNATIONAL_PAYMENT_PROVIDER", "paypal");
    vi.stubEnv("PAYPAL_CLIENT_ID", "");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ charges_enabled: true, capabilities: { card_payments: "active" } }),
          { status: 200 }
        )
      )
    );

    const { reveraApplePayDisponivel } = await import("@/lib/payments/revera");
    expect(await reveraApplePayDisponivel()).toBe(true);
  });

  it("esconde Stripe wallet/card quando a Stripe não está saudável", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ charges_enabled: false, capabilities: { card_payments: "inactive" } }),
          { status: 200 }
        )
      )
    );

    const { reveraApplePayDisponivel } = await import("@/lib/payments/revera");
    expect(await reveraApplePayDisponivel()).toBe(false);
  });
});
