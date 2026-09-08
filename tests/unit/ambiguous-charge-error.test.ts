/**
 * A distinção entre erro AMBÍGUO e erro CERTO na criação de uma cobrança
 * (achados do Codex, 08/09/2026, sobre src/app/checkout/pagamento/page.tsx).
 *
 * Uma falha de REDE (timeout, conexão perdida) ao criar o link/sessão pode
 * ter acontecido DEPOIS de o gateway já ter processado a requisição — não
 * sabemos, e por isso os dois adapters precisam lançar AmbiguousChargeError
 * nesse caso específico, nunca um Error comum. Um erro CERTO (o gateway
 * respondeu, mesmo que recusando) continua lançando Error comum: aí sabemos
 * com certeza que nada foi criado, e apagar a reserva do pedido continua
 * seguro.
 *
 * Estes testes cobrem as DUAS formas de "não sabemos": a chamada de rede em
 * si falhando, e a leitura do corpo da resposta falhando depois de um
 * status 2xx (o gateway já disse que sim, só perdemos os detalhes).
 *
 * SEM vi.resetModules() de propósito: com módulo recarregado a cada teste,
 * a classe AmbiguousChargeError importada aqui (uma vez, no topo) deixa de
 * ser a MESMA classe que o adapter lança depois do reset — instanceof falha
 * por identidade, não por comportamento. Nenhum destes testes depende de
 * estado de módulo entre um teste e outro, então o reset é desnecessário.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmbiguousChargeError } from "@/lib/payments/provider";
import { InfinitePayProvider } from "@/lib/payments/infinitepay-provider";
import { StripeProvider } from "@/lib/payments/stripe-provider";

const ORDER = "99999999-9999-4999-8999-999999999999";
const VALOR = 65000;

const CHARGE_BASE = {
  orderId: ORDER,
  orderNumber: "REV-X",
  amountCents: VALOR,
  redirectUrl: "https://x/pedido/t",
  webhookUrl: "https://x/wh",
  items: [{ description: "Micropele", quantity: 1, priceCents: VALOR }],
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InfinitePayProvider.createCharge — ambiguidade de rede", () => {
  beforeEach(() => vi.stubEnv("INFINITEPAY_HANDLE", "handle-teste"));

  it("fetch rejeitando (timeout/conexão perdida) lança AmbiguousChargeError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const p = new InfinitePayProvider();
    await expect(p.createCharge({ ...CHARGE_BASE, currency: "BRL" })).rejects.toBeInstanceOf(
      AmbiguousChargeError
    );
  });

  it("resposta 2xx cujo corpo falha ao ser lido também lança AmbiguousChargeError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: () => Promise.reject(new Error("conexão caiu no meio do corpo")),
        text: () => Promise.reject(new Error("idem")),
      }))
    );
    const p = new InfinitePayProvider();
    await expect(p.createCharge({ ...CHARGE_BASE, currency: "BRL" })).rejects.toBeInstanceOf(
      AmbiguousChargeError
    );
  });

  it("resposta 2xx sem `url` no corpo também lança AmbiguousChargeError", async () => {
    // "OK" com corpo incompleto: o gateway pode ter criado o link do
    // mesmo jeito e só devolvido uma resposta truncada.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ slug: "abc" }), { status: 200 }))
    );
    const p = new InfinitePayProvider();
    await expect(p.createCharge({ ...CHARGE_BASE, currency: "BRL" })).rejects.toBeInstanceOf(
      AmbiguousChargeError
    );
  });

  it("4xx (gateway recusou a NOSSA requisição) NÃO é ambíguo — Error comum", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 400 })));
    const p = new InfinitePayProvider();
    const erro = await p.createCharge({ ...CHARGE_BASE, currency: "BRL" }).catch((e: unknown) => e);
    expect(erro).not.toBeInstanceOf(AmbiguousChargeError);
    expect(erro).toBeInstanceOf(Error);
  });

  it("5xx (erro NO LADO do gateway) É ambíguo — pode ter criado mesmo assim", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    const p = new InfinitePayProvider();
    await expect(p.createCharge({ ...CHARGE_BASE, currency: "BRL" })).rejects.toBeInstanceOf(
      AmbiguousChargeError
    );
  });
});

describe("StripeProvider.createCharge — ambiguidade de rede", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_teste");
  });

  it("fetch rejeitando (timeout/conexão perdida) lança AmbiguousChargeError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const p = new StripeProvider();
    await expect(p.createCharge({ ...CHARGE_BASE, currency: "USD" })).rejects.toBeInstanceOf(
      AmbiguousChargeError
    );
  });

  it("STRIPE_SECRET_KEY ausente é erro de CONFIG, não ambíguo — nenhuma chamada chegou a sair", async () => {
    // Achado do Codex, 08/09/2026: apiBase()/requireSecretKey() validam
    // env, nunca tocam rede — um erro aqui precisa ser Error comum, não
    // AmbiguousChargeError, senão a reserva fica presa mesmo sem nenhuma
    // tentativa real de cobrança. Stub vazio (não unstub) para não depender
    // de a variável real estar ausente no ambiente de teste.
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const p = new StripeProvider();
    const erro = await p.createCharge({ ...CHARGE_BASE, currency: "USD" }).catch((e: unknown) => e);
    expect(erro).not.toBeInstanceOf(AmbiguousChargeError);
    expect(erro).toBeInstanceOf(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resposta 2xx cujo corpo falha ao ser lido também lança AmbiguousChargeError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: () => Promise.reject(new Error("conexão caiu no meio do corpo")),
        text: () => Promise.reject(new Error("idem")),
      }))
    );
    const p = new StripeProvider();
    await expect(p.createCharge({ ...CHARGE_BASE, currency: "USD" })).rejects.toBeInstanceOf(
      AmbiguousChargeError
    );
  });

  it("resposta 2xx sem `id`/`url` no corpo também lança AmbiguousChargeError", async () => {
    // "OK" com corpo incompleto: a Stripe pode ter criado a sessão do
    // mesmo jeito e só devolvido uma resposta truncada.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ object: "checkout.session" }), { status: 200 }))
    );
    const p = new StripeProvider();
    await expect(p.createCharge({ ...CHARGE_BASE, currency: "USD" })).rejects.toBeInstanceOf(
      AmbiguousChargeError
    );
  });

  it("4xx (gateway recusou a NOSSA requisição) NÃO é ambíguo — Error comum", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 400 })));
    const p = new StripeProvider();
    const erro = await p.createCharge({ ...CHARGE_BASE, currency: "USD" }).catch((e: unknown) => e);
    expect(erro).not.toBeInstanceOf(AmbiguousChargeError);
    expect(erro).toBeInstanceOf(Error);
  });

  it("5xx (erro NO LADO do gateway) É ambíguo — pode ter criado mesmo assim", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    const p = new StripeProvider();
    await expect(p.createCharge({ ...CHARGE_BASE, currency: "USD" })).rejects.toBeInstanceOf(
      AmbiguousChargeError
    );
  });
});
