/**
 * A porta que separa a loja de vender por R$ 0,00.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE (P0-1, 27/08/2026)
 * ===========================================================================
 * `product_variants.price_cents` é NOT NULL. Então "ainda não defini o preço"
 * não vira null no banco — vira ZERO. E zero é um número que o sistema
 * inteiro aceita sem reclamar: o subtotal soma 0, o pedido nasce com total 0,
 * o gateway cobra nada e o pedido é considerado legítimo do início ao fim.
 *
 * A auditoria de 26/08/2026 encontrou a variante da Micropele exatamente
 * assim: `price_cents: 0`, `is_active: false`. A ÚNICA coisa que separava a
 * loja de entregar a peça de graça era o `is_active` — ou seja, um clique no
 * painel. Quem ativasse o produto para "colocar no ar" abriria a torneira sem
 * perceber, porque ativar é justamente o que se faz para publicar.
 *
 * `src/lib/catalog/vitrine.ts` já impede a home de OFERECER esse produto, e
 * `tests/unit/vitrine.test.ts` prova aquela regra. Mas a vitrine é só a
 * porta da frente: a URL do produto é adivinhável, e o `adicionarItemAoCarrinho`
 * atende qualquer variant_id que chegue. Esconder o botão não é a mesma coisa
 * que recusar a compra.
 *
 * Por isso a guarda vive no carrinho — o único ponto por onde TODO item passa,
 * venha da página do produto, do drawer ou de uma chamada direta à server
 * action. Este teste existe para que remover aquela guarda quebre a suíte.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "../stubs/fake-supabase";

const VARIANTE = "22222222-2222-4222-8222-222222222222";
const CARRINHO = "33333333-3333-4333-8333-333333333333";

let fake: FakeSupabase;

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => fake,
}));

// O carrinho identifica o visitante por um cookie httpOnly. Aqui ele já
// existe: o que está sob teste é a decisão sobre o PREÇO, não a criação do
// carrinho.
vi.mock("@/lib/cart/token", () => ({
  lerTokenDoCookie: async () => "token-de-teste",
  gravarTokenNoCookie: async () => {},
  tokenTemFormatoValido: () => true,
}));

/** Monta um banco com uma variante do preço pedido, já com carrinho aberto. */
function bancoComVariante(precoCentavos: number, ativa = true) {
  return new FakeSupabase({
    carts: [{ id: CARRINHO, token: "token-de-teste", status: "open" }],
    cart_items: [],
    product_variants: [
      {
        id: VARIANTE,
        is_active: ativa,
        stock_qty: 10,
        price_cents: precoCentavos,
      },
    ],
  });
}

async function adicionar(quantidade = 1) {
  const { adicionarItemAoCarrinho } = await import("@/lib/cart/store");
  return adicionarItemAoCarrinho(VARIANTE, quantidade);
}

describe("adicionarItemAoCarrinho — guarda de preço", () => {
  beforeEach(() => {
    vi.resetModules();
    // O console.error da guarda é esperado: é o rastro que o operador vê.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("RECUSA variante ATIVA com preço zero — o estado real da auditoria de 26/08", async () => {
    fake = bancoComVariante(0);

    const { erro } = await adicionar();

    expect(erro).toBeTruthy();
    expect(erro).toMatch(/sem preço definido/i);
  });

  it("recusar preço zero não deixa item nenhum na sacola", async () => {
    fake = bancoComVariante(0);

    await adicionar();

    // A prova que importa: não basta devolver erro, tem que NÃO gravar.
    // Um item em cart_items viraria order_item no checkout.
    expect(fake.tabela("cart_items")).toHaveLength(0);
  });

  it("recusa preço negativo", async () => {
    fake = bancoComVariante(-1000);

    const { erro } = await adicionar();

    expect(erro).toBeTruthy();
    expect(fake.tabela("cart_items")).toHaveLength(0);
  });

  it("recusa mesmo quando a pessoa pede várias unidades", async () => {
    fake = bancoComVariante(0);

    const { erro } = await adicionar(3);

    expect(erro).toBeTruthy();
    expect(fake.tabela("cart_items")).toHaveLength(0);
  });

  it("variante inativa continua recusada, mesmo com preço válido", async () => {
    fake = bancoComVariante(129000, false);

    const { erro } = await adicionar();

    expect(erro).toMatch(/não está disponível/i);
    expect(fake.tabela("cart_items")).toHaveLength(0);
  });

  /**
   * Controle positivo. Sem ele os testes acima passariam mesmo que
   * `adicionarItemAoCarrinho` recusasse tudo — o que provaria nada sobre a
   * guarda de preço e esconderia uma loja quebrada.
   */
  it("ACEITA variante ativa com preço de verdade e grava o item", async () => {
    fake = bancoComVariante(129000);

    const { erro } = await adicionar(2);

    expect(erro).toBeNull();
    const itens = fake.tabela("cart_items");
    expect(itens).toHaveLength(1);
    expect(itens[0]?.variant_id).toBe(VARIANTE);
    expect(itens[0]?.quantity).toBe(2);
  });
});
