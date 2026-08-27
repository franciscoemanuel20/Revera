import { describe, expect, it } from "vitest";
import {
  ENVIOS_AGUARDANDO,
  contaComoVenda,
  filtroDaAba,
  transicoesEnvioDisponiveis,
  validarTransicaoEnvio,
  type ShippingStatusValue,
} from "@/lib/admin/venda-status";
import { montarAvisoVendaPaga } from "@/lib/notificacoes/venda-paga";
import { inicioDoPeriodo } from "@/lib/admin/vendas-consulta";

/**
 * O que dá para provar sem banco e sem rede.
 *
 * As garantias de "uma etiqueta só" e "um aviso só" NÃO estão aqui: elas
 * moram em constraints do Postgres (`shipments_order_id_unico`,
 * `unique (order_id, kind)`) e em compare-and-swap. Um teste unitário com
 * banco falso provaria que o mock funciona, não que o banco recusa — seria
 * teatro. Elas estão listadas como NÃO PROVADAS na entrega, e o roteiro de
 * como provar de verdade está junto.
 */

describe("abas são visões dos dois eixos, nunca um campo novo", () => {
  it("pendentes nunca inclui pedido pago", () => {
    const f = filtroDaAba("pendentes");
    expect(f.paymentStatus).toEqual(["pending", "failed"]);
    expect(f.paymentStatus).not.toContain("paid");
  });

  it("aguardando envio exige pagamento e reúne tudo que ainda dá trabalho", () => {
    const f = filtroDaAba("aguardando_envio");
    expect(f.paymentStatus).toEqual(["paid"]);
    // Erro de etiqueta PRECISA aparecer aqui: se ficasse só numa aba de
    // exceção, o pedido sumiria da fila de trabalho parecendo normal.
    expect(f.shippingStatus).toContain("shipping_error");
    expect(f.shippingStatus).toContain("awaiting_label");
    expect(f.shippingStatus).toContain("label_created");
  });

  it("nenhuma aba operacional mostra pedido cancelado, e a de cancelados só mostra eles", () => {
    for (const aba of ["pendentes", "pagas", "aguardando_envio", "enviadas"] as const) {
      expect(filtroDaAba(aba).cancelado).toBe(false);
    }
    expect(filtroDaAba("canceladas").cancelado).toBe(true);
  });

  it("todas não filtra nada", () => {
    expect(filtroDaAba("todas")).toEqual({});
  });
});

describe("transições manuais de envio", () => {
  it("NENHUM caminho manual chega em 'etiqueta pronta'", () => {
    const todos: ShippingStatusValue[] = [
      "not_ready",
      "awaiting_label",
      "label_processing",
      "label_created",
      "shipped",
      "delivered",
      "shipping_error",
    ];
    for (const origem of todos) {
      expect(transicoesEnvioDisponiveis(origem)).not.toContain("label_created");
    }
  });

  it("erro de etiqueta volta para a fila, para poder tentar de novo", () => {
    expect(validarTransicaoEnvio("shipping_error", "awaiting_label").ok).toBe(true);
  });

  it("não dá para pular de aguardando etiqueta direto para enviado", () => {
    const r = validarTransicaoEnvio("awaiting_label", "shipped");
    expect(r.ok).toBe(false);
  });

  it("pedido em emissão está travado: nenhuma ação manual sai de label_processing", () => {
    expect(transicoesEnvioDisponiveis("label_processing")).toHaveLength(0);
  });

  it("etiqueta pronta vira enviado, e enviado vira entregue", () => {
    expect(validarTransicaoEnvio("label_created", "shipped").ok).toBe(true);
    expect(validarTransicaoEnvio("shipped", "delivered").ok).toBe(true);
  });
});

describe("faturamento", () => {
  it("pedido cancelado não conta como venda mesmo tendo sido pago", () => {
    expect(contaComoVenda("paid", "2026-08-27T12:00:00Z")).toBe(false);
    expect(contaComoVenda("paid", null)).toBe(true);
    expect(contaComoVenda("pending", null)).toBe(false);
    expect(contaComoVenda("refunded", null)).toBe(false);
  });
});

describe("aviso de venda no WhatsApp", () => {
  const venda = {
    orderId: "11111111-1111-4111-8111-111111111111",
    numero: "RV-1028",
    cliente: "João Silva",
    produto: "Micropele 0,06mm",
    quantidade: 1,
    totalCents: 160000,
    cidade: "Campinas",
    uf: "SP",
  };

  it("não carrega endereço, CPF, e-mail nem telefone", () => {
    const { texto, parametros } = montarAvisoVendaPaga(venda);
    const tudo = `${texto} ${parametros.join(" ")}`.toLowerCase();
    for (const proibido of ["rua", "cep", "cpf", "@", "bairro", "complemento"]) {
      expect(tudo).not.toContain(proibido);
    }
  });

  it("traz o que a responsável precisa para agir", () => {
    const { texto } = montarAvisoVendaPaga(venda);
    expect(texto).toContain("RV-1028");
    expect(texto).toContain("João Silva");
    expect(texto).toContain("Campinas/SP");
    expect(texto).toContain("R$");
    expect(texto).toContain("AGUARDANDO ETIQUETA");
  });

  it("o link aponta para o painel, que exige login — não carrega segredo", () => {
    const { texto } = montarAvisoVendaPaga(venda);
    expect(texto).toContain(`/admin/pedidos/${venda.orderId}`);
    // access_token do pedido é o que abre a página SEM login. Ele não pode
    // vazar num WhatsApp encaminhável.
    expect(texto).not.toContain("access_token");
    expect(texto).not.toContain("/pedido/");
  });

  it("mais de um produto vira resumo, não lista", () => {
    const { texto } = montarAvisoVendaPaga({ ...venda, produto: "Micropele 0,06mm +1" });
    expect(texto).toContain("+1");
  });
});

describe("recorte de período no fuso de São Paulo", () => {
  it("às 22h de Brasília, 'hoje' ainda é hoje — e não amanhã em UTC", () => {
    // 2026-08-27 22:30 em São Paulo = 2026-08-28 01:30 UTC.
    const agora = new Date("2026-08-28T01:30:00Z");
    const inicio = inicioDoPeriodo("hoje", agora)!;
    // A meia-noite de 27/08 em SP é 03:00Z do dia 27.
    expect(inicio.toISOString()).toBe("2026-08-27T03:00:00.000Z");
    expect(inicio.getTime()).toBeLessThan(agora.getTime());
  });

  it("'tudo' não recorta nada", () => {
    expect(inicioDoPeriodo("tudo", new Date())).toBeNull();
  });

  it("7 dias começa antes de hoje", () => {
    const agora = new Date("2026-08-27T15:00:00Z");
    const hoje = inicioDoPeriodo("hoje", agora)!;
    const sete = inicioDoPeriodo("7dias", agora)!;
    expect(sete.getTime()).toBeLessThan(hoje.getTime());
  });
});

describe("a fila de trabalho", () => {
  it("reúne exatamente os quatro estados que ainda exigem ação física", () => {
    expect([...ENVIOS_AGUARDANDO].sort()).toEqual(
      ["awaiting_label", "label_created", "label_processing", "shipping_error"].sort()
    );
    expect(ENVIOS_AGUARDANDO).not.toContain("shipped");
    expect(ENVIOS_AGUARDANDO).not.toContain("delivered");
  });
});
