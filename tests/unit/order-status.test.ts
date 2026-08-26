import { describe, expect, it } from "vitest";
import { transicoesDisponiveis, validarTransicaoPedido } from "@/lib/admin/order-status";

// Mesma lógica de tests/unit/discount.test.ts: prova a regra de negócio
// pura (a máquina de estados de pedido) sem precisar de Postgres.
describe("validarTransicaoPedido", () => {
  it("nunca autoriza mover para 'paid', de nenhum status", () => {
    const resultadoDeNovo = validarTransicaoPedido("new", "paid");
    const resultadoDePreparando = validarTransicaoPedido("preparing", "paid");

    expect(resultadoDeNovo.ok).toBe(false);
    expect(resultadoDePreparando.ok).toBe(false);
  });

  it("rejeita pular etapa (new direto para delivered)", () => {
    const resultado = validarTransicaoPedido("new", "delivered");
    expect(resultado.ok).toBe(false);
  });

  it("aceita a sequência normal do pedido", () => {
    expect(validarTransicaoPedido("paid", "preparing").ok).toBe(true);
    expect(validarTransicaoPedido("preparing", "label_ready").ok).toBe(true);
    expect(validarTransicaoPedido("label_ready", "shipped").ok).toBe(true);
    expect(validarTransicaoPedido("shipped", "delivered").ok).toBe(true);
    expect(validarTransicaoPedido("delivered", "warranty").ok).toBe(true);
  });

  it("aceita cancelar a partir de new, paid, preparing e label_ready", () => {
    expect(validarTransicaoPedido("new", "canceled").ok).toBe(true);
    expect(validarTransicaoPedido("paid", "canceled").ok).toBe(true);
    expect(validarTransicaoPedido("preparing", "canceled").ok).toBe(true);
    expect(validarTransicaoPedido("label_ready", "canceled").ok).toBe(true);
  });

  it("não aceita cancelar depois de enviado", () => {
    expect(validarTransicaoPedido("shipped", "canceled").ok).toBe(false);
    expect(validarTransicaoPedido("delivered", "canceled").ok).toBe(false);
  });

  it("canceled e warranty são estados terminais (sem transição manual)", () => {
    expect(transicoesDisponiveis("canceled")).toEqual([]);
    expect(transicoesDisponiveis("warranty")).toEqual([]);
  });

  it("rejeita transição para o próprio status atual", () => {
    expect(validarTransicaoPedido("preparing", "preparing").ok).toBe(false);
  });
});
