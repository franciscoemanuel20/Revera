/**
 * Falhar fechado sem quebrar a tela de quem pagou.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE (P0-2, segunda passagem — 27/08/2026)
 * ===========================================================================
 * A correção do P0-2 fez `getPaymentProvider()` LANÇAR quando o pagamento
 * não está configurado, em vez de cair em mock. Certo — mas a mudança criou
 * um efeito colateral em um dos três pontos que chamam o factory.
 *
 * `confirmarPagamento()` chamava o factory solto, no topo da função. E ela é
 * chamada por `src/app/pedido/[token]/page.tsx:60` SEM try/catch. Ou seja,
 * numa janela de má configuração, quem tivesse acabado de pagar e abrisse o
 * link do próprio pedido receberia uma tela de erro do Next.
 *
 * O contrato desta função já previa o caso: o estado `indisponivel` existe
 * para "não consegui decidir agora". O pedido continua 'new', a outra porta
 * de confirmação continua valendo, e a pessoa vê o estado real.
 *
 * O teste guarda as duas metades da regra:
 *   1. sem provider configurado, NÃO lança e devolve `indisponivel`;
 *   2. NÃO marca o pedido como pago (falhar fechado continua fechado).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "../stubs/fake-supabase";

const PEDIDO = "44444444-4444-4444-8444-444444444444";

let fake: FakeSupabase;

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => fake,
}));

// O Purchase não deve nem ser cogitado quando não há provider. Se algum dia
// for chamado neste caminho, estes espiões denunciam.
const registrar = vi.fn();
const despachar = vi.fn();
vi.mock("@/lib/tracking/purchase", () => ({
  registrarPurchasePendente: (...a: unknown[]) => registrar(...a),
}));
vi.mock("@/lib/tracking/despachar", () => ({
  despacharPurchase: (...a: unknown[]) => despachar(...a),
}));

/** Ambiente limpo: nenhuma variável de pagamento, e sinal de produção. */
function ambienteSemPagamento() {
  const env = process.env as Record<string, string | undefined>;
  delete env.PAYMENT_PROVIDER;
  env.VERCEL_ENV = "production";
  // NODE_ENV é somente-leitura no tipo do Node; o cast acima é o mesmo
  // padrão usado em tests/unit/pagamento-fail-closed.test.ts.
  env.NODE_ENV = "production";
}

beforeEach(() => {
  vi.resetModules();
  registrar.mockClear();
  despachar.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  fake = new FakeSupabase({
    orders: [{ id: PEDIDO, status: "new", total_cents: 160000 }],
  });
});

describe("confirmarPagamento sem PAYMENT_PROVIDER", () => {
  it("NÃO lança — quem acabou de pagar não pode ver crash", async () => {
    ambienteSemPagamento();
    const { confirmarPagamento } = await import("@/lib/payments/confirmar");

    // A asserção é literal: se voltar a lançar, este teste falha aqui.
    await expect(confirmarPagamento(PEDIDO)).resolves.toBeDefined();
  });

  it("devolve o estado 'indisponivel', que é o contrato da função", async () => {
    ambienteSemPagamento();
    const { confirmarPagamento } = await import("@/lib/payments/confirmar");

    const r = await confirmarPagamento(PEDIDO);

    expect(r.estado).toBe("indisponivel");
  });

  it("o pedido continua 'new' — falhar fechado continua fechado", async () => {
    ambienteSemPagamento();
    const { confirmarPagamento } = await import("@/lib/payments/confirmar");

    await confirmarPagamento(PEDIDO);

    expect(fake.tabela("orders")[0]?.status).toBe("new");
  });

  it("não registra nem despacha Purchase nenhum", async () => {
    ambienteSemPagamento();
    const { confirmarPagamento } = await import("@/lib/payments/confirmar");

    await confirmarPagamento(PEDIDO);

    expect(registrar).not.toHaveBeenCalled();
    expect(despachar).not.toHaveBeenCalled();
  });

  it("mock pedido em PRODUÇÃO também é recusado, sem quebrar a tela", async () => {
    // Não é o mesmo caso do anterior: aqui a variável EXISTE e vale 'mock'.
    // O factory recusa por causa do ambiente, e a função tem que absorver
    // essa recusa do mesmo jeito.
    process.env.PAYMENT_PROVIDER = "mock";
    process.env.VERCEL_ENV = "production";
    const { confirmarPagamento } = await import("@/lib/payments/confirmar");

    const r = await confirmarPagamento(PEDIDO);

    expect(r.estado).toBe("indisponivel");
    expect(fake.tabela("orders")[0]?.status).toBe("new");
  });
});
