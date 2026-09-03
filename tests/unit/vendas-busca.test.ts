import { describe, expect, it } from "vitest";
import {
  casaBuscaLocal,
  selectVenda,
  type VendaResumo,
} from "@/lib/admin/vendas-consulta";

/**
 * Dois bugs reais pegos no teste vivo contra o staging (28/08/2026), ambos
 * invisíveis para teste unitário de regra pura — estes testes existem para
 * que nenhum dos dois VOLTE por refactor:
 *
 * 1. Filtro de recurso embutido sem `!inner`: `addresses.country=eq.BR` com
 *    left join não exclui o pedido, só anula o endereço embutido — o filtro
 *    "Internacional" listava pedidos do Brasil (sem cidade).
 * 2. Busca por nome/rastreio filtrada por order_number NO BANCO antes da
 *    passada em memória: o filtro de número esvaziava o resultado e a busca
 *    por rastreio devolvia sempre vazio.
 */

function venda(parcial: Partial<VendaResumo>): VendaResumo {
  return {
    id: "x",
    numero: "REV-ABC12345",
    criadoEm: "2026-08-28T00:00:00Z",
    cliente: "Cliente Teste",
    produto: "Micropele",
    quantidade: 1,
    totalCents: 77000,
    metodo: null,
    cidade: null,
    uf: null,
    telefone: null,
    email: null,
    cpf: null,
    pais: "BR",
    internacional: false,
    moeda: "BRL",
    exportStatus: "not_required",
    paymentStatus: "pending",
    shippingStatus: "not_ready",
    canceladoEm: null,
    motivoCancelamento: null,
    rastreio: null,
    etiquetaUrl: null,
    transportadora: null,
    vistoEm: null,
    ...parcial,
  };
}

describe("selectVenda — o join que o filtro de endereço exige", () => {
  it("sem filtro de endereço usa left join (pedido sem endereço aparece)", () => {
    expect(selectVenda(false)).toContain(" addresses(");
    expect(selectVenda(false)).not.toContain("!inner");
  });

  it("com filtro de endereço usa !inner (senão o filtro não corta a linha)", () => {
    expect(selectVenda(true)).toContain(" addresses!inner(");
  });
});

describe("casaBuscaLocal — os cinco campos prometidos pela tela", () => {
  it("casa por número do pedido", () => {
    expect(casaBuscaLocal(venda({}), "rev-abc")).toBe(true);
  });

  it("casa por nome do cliente", () => {
    expect(casaBuscaLocal(venda({ cliente: "Maria Souza" }), "maria")).toBe(true);
  });

  it("casa por rastreio", () => {
    expect(casaBuscaLocal(venda({ rastreio: "TVRASTREIO123BR" }), "tvrastreio123br")).toBe(true);
  });

  it("casa por e-mail", () => {
    expect(casaBuscaLocal(venda({ email: "cliente@example.com" }), "cliente@example")).toBe(true);
  });

  it("casa telefone por dígitos, ignorando máscara", () => {
    expect(casaBuscaLocal(venda({ telefone: "+55 11 97654-3210" }), "(11) 97654")).toBe(true);
  });

  it("casa CPF por dígitos", () => {
    expect(casaBuscaLocal(venda({ cpf: "529.982.247-25" }), "52998224725")).toBe(true);
  });

  it("dígitos curtos demais não casam telefone (evita falso positivo)", () => {
    // numero sem "12" para isolar o caminho dos dígitos do caminho de texto
    expect(
      casaBuscaLocal(venda({ numero: "REV-XYZWQK", telefone: "+55 11 97654-3210" }), "11")
    ).toBe(false);
  });

  it("termo que não existe em nada devolve false", () => {
    expect(casaBuscaLocal(venda({}), "inexistente")).toBe(false);
  });
});
