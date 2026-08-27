/**
 * A trava do duplo clique.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE (P1, 27/08/2026)
 * ===========================================================================
 * `criarPedidoAction` convertia o carrinho no FIM, depois de gravar cliente,
 * endereço, pedido e itens. Entre ler o carrinho e convertê-lo havia uma
 * janela, e o segundo clique entrava nela.
 *
 * Reproduzido contra o banco real em 27/08/2026: dois envios simultâneos do
 * mesmo carrinho criaram DOIS pedidos. O prejuízo não é cobrança dobrada —
 * cada pedido tem sua própria cobrança — é a operação: dois pedidos pagos do
 * mesmo carrinho viram duas etiquetas, e cada etiqueta debita a carteira da
 * SuperFrete de verdade.
 *
 * O que este teste protege é a atomicidade. Ele usa o FakeSupabase (que emula
 * `update ... where` devolvendo zero linhas quando não casa) justamente para
 * que trocar a trava por um `if (carrinho.status === "open")` — que tem a
 * mesma janela — QUEBRE a suíte em vez de passar despercebido.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeSupabase } from "../stubs/fake-supabase";

const CARRINHO = "44444444-4444-4444-8444-444444444444";

let fake: FakeSupabase;

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => fake,
}));

function bancoComCarrinho(status: string) {
  return new FakeSupabase({
    carts: [{ id: CARRINHO, token: "token-de-teste", status }],
  });
}

async function reivindicar() {
  const { reivindicarCarrinhoParaPedido } = await import("@/lib/cart/store");
  return reivindicarCarrinhoParaPedido(CARRINHO);
}

async function devolver() {
  const { devolverCarrinhoParaAberto } = await import("@/lib/cart/store");
  return devolverCarrinhoParaAberto(CARRINHO);
}

beforeEach(() => {
  vi.resetModules();
});

describe("reivindicarCarrinhoParaPedido", () => {
  it("o primeiro envio ganha o carrinho", async () => {
    fake = bancoComCarrinho("open");

    expect(await reivindicar()).toBe(true);
    expect(fake.tabela("carts")[0]?.status).toBe("converted");
  });

  it("O BUG ORIGINAL: dois envios seguidos, só UM cria pedido", async () => {
    fake = bancoComCarrinho("open");

    const primeiro = await reivindicar();
    const segundo = await reivindicar();

    expect(primeiro).toBe(true);
    expect(segundo).toBe(false);
  });

  it("dez cliques nervosos produzem UMA reivindicação", async () => {
    fake = bancoComCarrinho("open");

    const resultados: boolean[] = [];
    for (let i = 0; i < 10; i++) resultados.push(await reivindicar());

    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it("carrinho já convertido não é reivindicado de novo", async () => {
    fake = bancoComCarrinho("converted");
    expect(await reivindicar()).toBe(false);
  });

  it("carrinho abandonado não vira pedido", async () => {
    fake = bancoComCarrinho("abandoned");
    expect(await reivindicar()).toBe(false);
  });

  it("carrinho inexistente devolve false em vez de quebrar", async () => {
    fake = new FakeSupabase({ carts: [] });
    expect(await reivindicar()).toBe(false);
  });
});

describe("devolverCarrinhoParaAberto", () => {
  it("devolve a sacola quando a criação do pedido falha no meio", async () => {
    fake = bancoComCarrinho("open");
    await reivindicar();
    expect(fake.tabela("carts")[0]?.status).toBe("converted");

    await devolver();

    expect(fake.tabela("carts")[0]?.status).toBe("open");
  });

  it("depois de devolver, a pessoa consegue tentar de novo", async () => {
    fake = bancoComCarrinho("open");
    await reivindicar();
    await devolver();

    expect(await reivindicar()).toBe(true);
  });

  /**
   * A devolução é condicional (`where status = 'converted'`) de propósito.
   * Um pedido que já foi criado com sucesso não pode ter a sacola
   * ressuscitada por um erro tardio em outro caminho — isso devolveria ao
   * cliente uma sacola cheia de peças que ele já comprou.
   */
  it("não ressuscita sacola de um pedido que já foi concluído", async () => {
    fake = new FakeSupabase({
      carts: [{ id: CARRINHO, token: "t", status: "abandoned" }],
    });

    await devolver();

    expect(fake.tabela("carts")[0]?.status).toBe("abandoned");
  });
});
