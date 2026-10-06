import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  writes: [] as string[],
  tarifaDhl: 5000,
  nomeServico: "Express Worldwide",
  prazoDias: 4,
  dataEntrega: "2026-10-09",
  items: [{ variantId: "variant-fixture", quantity: 1, basePriceCents: 10000, productName: "Fixture", variantLabel: "Standard" }],
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { state.redirect(path); throw new Error("redirect"); } }));
vi.mock("@/lib/cart/store", () => ({
  devolverCarrinhoParaAberto: vi.fn(),
  lerCarrinhoCompleto: vi.fn(async () => ({ cartId: "cart-fixture", items: state.items })),
  reivindicarCarrinhoParaPedido: vi.fn(async () => true),
}));
vi.mock("@/lib/cart/token", () => ({ limparTokenDoCookie: vi.fn() }));
vi.mock("@/lib/http/limite-dhl-compartilhado", () => ({ consumirLimiteDhlCompartilhado: vi.fn(async () => ({ permitido: true, retryAfterSeconds: 0 })) }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({
  from: (table: string) => {
    const query: Record<string, (...args: unknown[]) => unknown> = {
      insert: () => { state.writes.push(table); return Promise.resolve({ error: null }); },
      delete: () => query,
      update: () => query,
      eq: () => query,
      is: () => query,
      select: () => query,
      single: async () => ({ error: null }),
    };
    return query;
  },
}) }));
vi.mock("@/lib/internacional/endereco", () => ({
  paraLinha: (endereco: Record<string, unknown>) => ({ country: endereco.pais, postal_code: endereco.codigoPostal, city: endereco.cidade, region: endereco.regiao, line1: endereco.linha1, line2: endereco.linha2, company: endereco.empresa }),
  validarEndereco: (entrada: Record<string, unknown>) => ({ ok: true, endereco: { pais: entrada.pais, telefone: entrada.telefone, cidade: entrada.cidade, linha1: entrada.linha1, linha2: entrada.linha2, regiao: entrada.regiao, codigoPostal: entrada.codigoPostal, empresa: entrada.empresa } }),
}));
vi.mock("@/lib/internacional/mercado", () => ({
  precosDoCarrinhoNoMercado: vi.fn(async (items: Array<{ variantId: string; quantity: number }>) => ({
    ok: true,
    itens: items.map((item) => ({ ...item, unitPriceCents: 10000, subtotalCents: 10000 * item.quantity })),
    subtotalCents: items.reduce((sum, item) => sum + 10000 * item.quantity, 0),
  })),
  prontidaoDoMercado: vi.fn(async () => ({ aberto: true, moeda: "USD" })),
}));
vi.mock("@/lib/internacional/aceite", () => ({ ACEITE_INTERNACIONAL_VERSAO: "fixture-v1" }));
vi.mock("@/lib/internacional/paises", () => ({ idiomaDoPais: () => "en" }));
vi.mock("@/lib/internacional/idioma", () => ({ textos: () => ({
  erroConfiraCampos: "Check fields", erroNome: "Name", erroEmail: "Email", erroTelefone: "Phone",
  erroEnderecoObrigatorio: "Address", erroCidadeObrigatoria: "City", aceiteObrigatorio: "Accept",
  erroEnderecoBrasileiro: "Brazil", sacolaVazia: "Empty", semPrecoNoMercado: "No price",
  erroPedidoEmAndamento: "Pending", erroRegistrarDados: "Customer", erroRegistrarEndereco: "Address",
}) }));
vi.mock("@/lib/internacional/cambio-ptax", () => ({ obterCotacaoPtax: vi.fn(async () => ({ moeda: "USD", reaisPorUnidade: 5, data: "2026-10-05", fonte: "fixture" })) }));
vi.mock("@/lib/shipping/dhl/admin-quote", () => ({ cotarDhlOperacional: vi.fn(async () => ({
  ambiente: "producao",
  quotes: [{ productCode: "8", currency: "USD", priceCents: state.tarifaDhl, productName: state.nomeServico, etaDays: state.prazoDias, deliveryDate: state.dataEntrega }],
})) }));
vi.mock("@/lib/notificacoes/email-operacional", () => ({ avisarPedidoPendentePorEmail: vi.fn(async () => ({ estado: "enviado" })) }));

const payload = {
  pais: "US", name: "Fixture Buyer", email: "buyer@example.test", telefone: "+1 5551234567",
  empresa: null, linha1: "1 Test Street", linha2: null, cidade: "Beverly Hills", regiao: "CA",
  codigoPostal: "90210", aceite: false,
};

describe("checkout internacional: cotação antes da criação do pedido", () => {
  beforeEach(() => {
    state.writes = [];
    state.tarifaDhl = 5000;
    state.nomeServico = "Express Worldwide";
    state.prazoDias = 4;
    state.dataEntrega = "2026-10-09";
    state.items = [{ variantId: "variant-fixture", quantity: 1, basePriceCents: 10000, productName: "Fixture", variantLabel: "Standard" }];
    state.redirect.mockClear();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-fixture-not-a-secret-value");
  });

  it("mostra subtotal, frete e total sem gravar pedido nem cobrança", async () => {
    const { criarPedidoInternacionalAction } = await import("@/app/checkout/actions-internacional");
    const resultado = await criarPedidoInternacionalAction(payload);

    expect(resultado.cotacao).toEqual({
      currency: "USD", subtotalCents: 10000, shippingCents: 5000, totalCents: 15000,
      serviceName: "Express Worldwide", etaDays: 4, deliveryDate: "2026-10-09", token: expect.any(String),
    });
    expect(state.writes).toEqual([]);
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("não avança quando o preço do frete muda na recotação", async () => {
    const { criarPedidoInternacionalAction } = await import("@/app/checkout/actions-internacional");
    const preview = await criarPedidoInternacionalAction(payload);
    if (!preview.cotacao) throw new Error("quote preview expected");
    state.tarifaDhl = 5100;
    const resultado = await criarPedidoInternacionalAction({ ...payload, aceite: true, confirmarCotacao: preview.cotacao.token });

    expect(resultado.erro).toMatch(/quote expired or changed/i);
    expect(resultado.cotacao?.shippingCents).toBe(5100);
    expect(state.writes).toEqual([]);
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("não avança quando os itens do carrinho mudam e o subtotal permanece igual", async () => {
    const { criarPedidoInternacionalAction } = await import("@/app/checkout/actions-internacional");
    const preview = await criarPedidoInternacionalAction(payload);
    if (!preview.cotacao) throw new Error("quote preview expected");
    state.items = [{ ...state.items[0]!, variantId: "different-variant" }];
    const resultado = await criarPedidoInternacionalAction({ ...payload, aceite: true, confirmarCotacao: preview.cotacao.token });

    expect(resultado.erro).toMatch(/quote expired or changed/i);
    expect(state.writes).toEqual([]);
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["serviço", () => { state.nomeServico = "Different DHL service"; }],
    ["prazo", () => { state.prazoDias = 7; }],
    ["data de entrega", () => { state.dataEntrega = "2026-10-10"; }],
  ])("exige nova confirmação se mudar o %s com o mesmo preço", async (_nome, alterar) => {
    const { criarPedidoInternacionalAction } = await import("@/app/checkout/actions-internacional");
    const preview = await criarPedidoInternacionalAction(payload);
    if (!preview.cotacao) throw new Error("quote preview expected");
    alterar();
    const resultado = await criarPedidoInternacionalAction({ ...payload, aceite: true, confirmarCotacao: preview.cotacao.token });

    expect(resultado.erro).toMatch(/quote expired or changed/i);
    expect(state.writes).toEqual([]);
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("vincula a confirmação ao endereço normalizado", async () => {
    const { criarPedidoInternacionalAction } = await import("@/app/checkout/actions-internacional");
    const preview = await criarPedidoInternacionalAction(payload);
    if (!preview.cotacao) throw new Error("quote preview expected");
    const resultado = await criarPedidoInternacionalAction({ ...payload, linha1: "2 Other Street", aceite: true, confirmarCotacao: preview.cotacao.token });

    expect(resultado.erro).toMatch(/quote expired or changed/i);
    expect(state.writes).toEqual([]);
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("exige novo gesto de aceite após exibir uma cotação", async () => {
    const { criarPedidoInternacionalAction } = await import("@/app/checkout/actions-internacional");
    const preview = await criarPedidoInternacionalAction(payload);
    if (!preview.cotacao) throw new Error("quote preview expected");
    const resultado = await criarPedidoInternacionalAction({ ...payload, aceite: false, confirmarCotacao: preview.cotacao.token });

    expect(resultado.erro).toBe("Accept");
    expect(state.writes).toEqual([]);
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("só cria pedido após confirmar token válido e aceite", async () => {
    const { criarPedidoInternacionalAction } = await import("@/app/checkout/actions-internacional");
    const preview = await criarPedidoInternacionalAction(payload);
    if (!preview.cotacao) throw new Error("quote preview expected");

    await expect(criarPedidoInternacionalAction({ ...payload, aceite: true, confirmarCotacao: preview.cotacao.token })).rejects.toThrow("redirect");

    expect(state.writes).toContain("orders");
    expect(state.redirect).toHaveBeenCalledOnce();
  });

  it("recusa token adulterado", async () => {
    const { criarPedidoInternacionalAction } = await import("@/app/checkout/actions-internacional");
    const preview = await criarPedidoInternacionalAction(payload);
    if (!preview.cotacao) throw new Error("quote preview expected");
    const [corpoToken, assinatura] = preview.cotacao.token.split(".");
    const tokenAdulterado = `${corpoToken}.${assinatura?.[0] === "a" ? "b" : "a"}${assinatura?.slice(1) ?? ""}`;
    const resultado = await criarPedidoInternacionalAction({ ...payload, aceite: true, confirmarCotacao: tokenAdulterado });

    expect(resultado.erro).toMatch(/quote expired or changed/i);
    expect(state.writes).toEqual([]);
    expect(state.redirect).not.toHaveBeenCalled();
  });
});
