import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "../stubs/fake-supabase";
import { InfinitePayProvider } from "@/lib/payments/infinitepay-provider";

const ORDER = "44444444-4444-4444-8444-444444444444";
const TOKEN = "55555555-5555-4555-8555-555555555555";
const TRANSACTION = "66666666-6666-4666-8666-666666666666";
const confirmar = vi.hoisted(() => vi.fn(async () => ({ estado: "nao_pago" })));
let fake: FakeSupabase;

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => fake }));
vi.mock("@/lib/payments/confirmar", () => ({ confirmarPagamento: confirmar }));
vi.mock("@/lib/tracking/purchase", () => ({ consumirPurchaseParaNavegador: vi.fn(async () => null) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubEnv("INFINITEPAY_HANDLE", "handle-teste");
  confirmar.mockClear();
  fake = new FakeSupabase({
    orders: [{
      id: ORDER, access_token: TOKEN, order_number: "REV-TEST",
      status: "new", payment_status: "pending", currency: "BRL",
      subtotal_cents: 10000, discount_cents: 0, shipping_cents: 1000, total_cents: 11000,
    }],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function abrirPedido(searchParams: Record<string, string | string[]>) {
  const { default: PedidoPage } = await import("@/app/pedido/[token]/page");
  return PedidoPage({ params: Promise.resolve({ token: TOKEN }), searchParams: Promise.resolve(searchParams) });
}

describe("retorno nacional sem webhook", () => {
  // Em 08/10, a consulta da venda real sem transaction_nsu/slug retornava success=false.
  it("encaminha as pistas da InfinitePay para reconfirmação do pedido autorizado pelo token", async () => {
    await abrirPedido({ retorno: "pagamento", order_nsu: ORDER, transaction_nsu: TRANSACTION, slug: "invoice-fixture" });
    expect(confirmar).toHaveBeenCalledWith(ORDER, { transactionId: TRANSACTION, invoiceSlug: "invoice-fixture" });
  });

  it("ignora pistas de outro pedido e usa a confirmação histórica", async () => {
    await abrirPedido({ retorno: "pagamento", order_nsu: TOKEN, transaction_nsu: TRANSACTION, slug: "invoice-fixture" });
    expect(confirmar).toHaveBeenCalledWith(ORDER);
  });

  it.each([
    { transaction_nsu: [TRANSACTION, TOKEN], slug: "invoice-fixture" },
    { transaction_nsu: TRANSACTION, slug: ["invoice-fixture", "outra"] },
    { transaction_nsu: "invalida", slug: "invoice-fixture" },
    { transaction_nsu: TRANSACTION, slug: "https://example.com" },
  ])("ignora parâmetros ambíguos ou malformados: %j", async (params) => {
    await abrirPedido({ retorno: "pagamento", order_nsu: ORDER, ...params });
    expect(confirmar).toHaveBeenCalledWith(ORDER);
  });

  it("pedido já pago não reconfirma nem redispara efeitos no retorno", async () => {
    Object.assign(fake.tabela("orders")[0]!, { status: "paid", payment_status: "paid" });
    await abrirPedido({ retorno: "pagamento", order_nsu: ORDER, transaction_nsu: TRANSACTION, slug: "invoice-fixture" });
    expect(confirmar).not.toHaveBeenCalled();
  });
});

describe("consulta InfinitePay distingue ausência de confirmação de não pagamento", () => {
  it("success=false é indisponibilidade da consulta, nunca comprovação de não pago", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false }))));
    await expect(new InfinitePayProvider().confirmPayment({ orderId: ORDER, transactionId: null, invoiceSlug: null, eventId: "fixture" }))
      .rejects.toThrow("verificar");
  });

  it("success=true e paid=false mantém o pagamento não aprovado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, paid: false }))));
    const result = await new InfinitePayProvider().confirmPayment({ orderId: ORDER, transactionId: TRANSACTION, invoiceSlug: "invoice-fixture", eventId: "fixture" });
    expect(result.paid).toBe(false);
  });

  it("consulta aprovada usa os identificadores completos e timeout", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init: RequestInit) => new Response(JSON.stringify({ success: true, paid: true, amount: 11000, paid_amount: 11000 })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new InfinitePayProvider().confirmPayment({ orderId: ORDER, transactionId: TRANSACTION, invoiceSlug: "invoice-fixture", eventId: "fixture" });
    expect(result).toMatchObject({ paid: true, currency: "BRL", paidAmountCents: 11000 });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body))).toMatchObject({ order_nsu: ORDER, transaction_nsu: TRANSACTION, slug: "invoice-fixture" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
