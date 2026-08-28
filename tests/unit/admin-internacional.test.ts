import { describe, expect, it } from "vitest";
import {
  daLinha,
  formatarEndereco,
  type LinhaEndereco,
} from "@/lib/internacional/endereco";
import {
  formatarValorNaMoeda,
  formatarTotais,
  totalizarPorMoeda,
} from "@/lib/internacional/moeda";
import { podeOferecerEtiquetaNacional } from "@/lib/admin/venda-status";

/**
 * Regressão dos 5 bugs encontrados no teste vivo de 27/08/2026.
 *
 * Todos os cinco tinham a mesma origem: telas escritas quando só existia
 * Brasil e só existia real. Nenhum deles aparecia em teste unitário porque a
 * regra morava dentro do JSX — por isso duas destas correções COMEÇARAM
 * extraindo a regra para uma função que um teste alcance.
 */

/* =========================================================================
 * BUG 1 — ENDEREÇO INTERNACIONAL COM LAYOUT BRASILEIRO
 * =======================================================================*/

const LINHA_BR: LinhaEndereco = {
  country: "BR",
  recipient_name: "Maria Souza",
  company: null,
  cep: "12245000",
  street: "Rua das Flores",
  number: "100",
  complement: "Apto 21",
  neighborhood: "Centro",
  city: "Sao Jose dos Campos",
  state: "SP",
  line1: null,
  line2: null,
  postal_code: null,
  region: null,
};

const LINHA_US: LinhaEndereco = {
  country: "US",
  recipient_name: "Michael Smith",
  company: null,
  cep: null,
  street: null,
  number: null,
  complement: null,
  neighborhood: null,
  city: "Washington",
  state: null,
  line1: "1600 Pennsylvania Ave NW",
  line2: "Apt 2",
  postal_code: "20500",
  region: "DC",
};

function render(linha: LinhaEndereco, tel = "1") {
  const e = daLinha(linha, tel);
  if (!e) throw new Error("endereço não reconstituído");
  return formatarEndereco(e);
}

describe("bug 1 — endereço no formato do país", () => {
  it("EUA sai completo e sem sobra de pontuação", () => {
    const linhas = render(LINHA_US);
    const texto = linhas.join(" | ");
    expect(texto).toContain("1600 Pennsylvania Ave NW");
    expect(texto).toContain("Apt 2");
    expect(texto).toContain("Washington");
    expect(texto).toContain("DC");
    expect(texto).toContain("20500");
    expect(texto).toContain("UNITED STATES");
  });

  it("EUA NÃO mostra bairro, UF nem CEP", () => {
    const texto = render(LINHA_US).join(" | ");
    expect(texto).not.toContain("CEP");
    expect(texto).not.toMatch(/bairro/i);
    // O sintoma exato do bug: vírgula ou travessão soltos, separando vazio.
    for (const linha of render(LINHA_US)) {
      expect(linha.trim()).not.toMatch(/^[,—-]/);
      expect(linha.trim()).not.toMatch(/[,—-]$/);
      expect(linha).not.toContain(", ,");
      expect(linha).not.toContain("—  ");
    }
  });

  it("Portugal sai sem região e sem sobra", () => {
    const linhas = render({
      ...LINHA_US,
      country: "PT",
      recipient_name: "Ana Ferreira",
      line1: "Rua Augusta 120, 2 Esq",
      line2: null,
      city: "Lisboa",
      region: null,
      postal_code: "1100-053",
    });
    const texto = linhas.join(" | ");
    expect(texto).toContain("Lisboa");
    expect(texto).toContain("1100-053");
    expect(texto).toContain("PORTUGAL");
    expect(texto).not.toContain("CEP");
    // Sem região, a linha de cidade não pode ficar "Lisboa, , 1100-053".
    expect(texto).not.toContain(", ,");
  });

  it("Reino Unido mantém o postal code alfanumérico intacto", () => {
    const texto = render({
      ...LINHA_US,
      country: "GB",
      recipient_name: "James Clarke",
      company: "Clarke & Sons Ltd",
      line1: "10 Downing Street",
      line2: null,
      city: "London",
      region: null,
      postal_code: "SW1A 2AA",
    }).join(" | ");
    expect(texto).toContain("SW1A 2AA");
    expect(texto).toContain("Clarke & Sons Ltd");
    expect(texto).toContain("UNITED KINGDOM");
  });

  it("Austrália e Canadá saem com região", () => {
    const au = render({ ...LINHA_US, country: "AU", city: "Sydney", region: "NSW", postal_code: "2000" }).join(" ");
    expect(au).toContain("NSW");
    expect(au).toContain("AUSTRALIA");
    const ca = render({ ...LINHA_US, country: "CA", city: "Ottawa", region: "ON", postal_code: "K1A 0A2" }).join(" ");
    expect(ca).toContain("ON");
    expect(ca).toContain("CANADA");
  });

  it("BRASIL CONTINUA IGUAL — rua, número, complemento, bairro, cidade/UF e CEP", () => {
    const texto = render(LINHA_BR).join(" | ");
    expect(texto).toContain("Rua das Flores, 100");
    expect(texto).toContain("Apto 21");
    expect(texto).toContain("Centro");
    expect(texto).toContain("Sao Jose dos Campos — SP");
    expect(texto).toContain("CEP 12245-000");
    expect(texto).toContain("Brasil");
  });
});

/* =========================================================================
 * BUG 2 e 5 — MOEDA
 * =======================================================================*/

describe("bug 2 — o detalhe usa a moeda do pedido", () => {
  it("pedido em USD NÃO mostra R$", () => {
    const v = formatarValorNaMoeda(32000, "USD");
    expect(v).toContain("US$");
    expect(v).not.toContain("R$");
  });

  it("pedido em EUR NÃO mostra R$", () => {
    const v = formatarValorNaMoeda(29000, "EUR");
    expect(v).toContain("€");
    expect(v).not.toContain("R$");
  });

  it("pedido em BRL continua em R$", () => {
    expect(formatarValorNaMoeda(65000, "BRL")).toBe("R$ 650,00");
  });

  it("moeda desconhecida não quebra a tela e sinaliza o problema", () => {
    const v = formatarValorNaMoeda(1000, "XYZ");
    expect(v).toContain("XYZ");
    expect(v).not.toContain("R$");
  });
});

describe("bug 5 — símbolos inequívocos", () => {
  it("USD, CAD e AUD são distinguíveis entre si", () => {
    const usd = formatarValorNaMoeda(32000, "USD");
    const cad = formatarValorNaMoeda(32000, "CAD");
    const aud = formatarValorNaMoeda(32000, "AUD");
    expect(new Set([usd, cad, aud]).size).toBe(3);
    expect(usd).toContain("US$");
    expect(cad).toContain("CA$");
    expect(aud).toContain("A$");
  });

  it("nenhuma das três é apenas '$'", () => {
    for (const m of ["USD", "CAD", "AUD"]) {
      expect(formatarValorNaMoeda(100, m)).not.toMatch(/^\$/);
    }
  });

  it("EUR e GBP seguem inequívocos", () => {
    expect(formatarValorNaMoeda(100, "EUR")).toContain("€");
    expect(formatarValorNaMoeda(100, "GBP")).toContain("£");
  });
});

/* =========================================================================
 * BUG 3 — DASHBOARD SOMANDO MOEDAS
 * =======================================================================*/

describe("bug 3 — faturamento por moeda, nunca somado", () => {
  const pedidos = [
    { total_cents: 65000, currency: "BRL" },
    { total_cents: 32000, currency: "USD" },
    { total_cents: 29000, currency: "EUR" },
    { total_cents: 15000, currency: "BRL" },
  ];

  it("separa em uma linha por moeda", () => {
    const t = totalizarPorMoeda(pedidos);
    expect(t).toHaveLength(3);
    expect(t.find((x) => x.moeda === "BRL")!.minor).toBe(80000);
    expect(t.find((x) => x.moeda === "USD")!.minor).toBe(32000);
    expect(t.find((x) => x.moeda === "EUR")!.minor).toBe(29000);
  });

  it("NÃO existe um total único somando tudo", () => {
    const t = totalizarPorMoeda(pedidos);
    const somaIngenua = pedidos.reduce((s, p) => s + p.total_cents, 0);
    expect(t.some((x) => x.minor === somaIngenua)).toBe(false);
  });

  it("o texto do cartão mostra as três, e o real vem primeiro", () => {
    const texto = formatarTotais(totalizarPorMoeda(pedidos));
    expect(texto).toContain("R$ 800,00");
    expect(texto).toContain("US$ 320,00");
    expect(texto).toContain("€ 290,00");
    expect(texto.indexOf("R$")).toBeLessThan(texto.indexOf("US$"));
  });

  it("com uma moeda só, mostra só ela", () => {
    const texto = formatarTotais(totalizarPorMoeda([{ total_cents: 65000, currency: "BRL" }]));
    expect(texto).toBe("R$ 650,00");
  });

  it("pedido sem moeda gravada conta como real", () => {
    const t = totalizarPorMoeda([{ total_cents: 100, currency: null }]);
    expect(t[0]?.moeda).toBe("BRL");
  });

  it("conta os pedidos por moeda, para o ticket médio", () => {
    const t = totalizarPorMoeda(pedidos);
    expect(t.find((x) => x.moeda === "BRL")!.pedidos).toBe(2);
    expect(t.find((x) => x.moeda === "USD")!.pedidos).toBe(1);
  });
});

/* =========================================================================
 * BUG 4 — SUPERFRETE EM PEDIDO INTERNACIONAL
 * =======================================================================*/

describe("bug 4 — etiqueta nacional não se oferece a destino estrangeiro", () => {
  const pago = {
    paymentStatus: "paid" as const,
    shippingStatus: "awaiting_label" as const,
    jaTemEtiqueta: false,
  };

  it("Brasil, pago e aguardando etiqueta: OFERECE", () => {
    expect(podeOferecerEtiquetaNacional({ ...pago, paisDestino: "BR" })).toBe(true);
  });

  it("nenhum dos cinco destinos estrangeiros oferece", () => {
    for (const pais of ["US", "PT", "GB", "AU", "CA"]) {
      expect(podeOferecerEtiquetaNacional({ ...pago, paisDestino: pais }), pais).toBe(false);
    }
  });

  it("o país pesa mais que qualquer outra condição favorável", () => {
    expect(
      podeOferecerEtiquetaNacional({
        paisDestino: "US",
        paymentStatus: "paid",
        shippingStatus: "shipping_error",
        jaTemEtiqueta: false,
      })
    ).toBe(false);
  });

  it("Brasil não pago continua sem oferecer", () => {
    expect(
      podeOferecerEtiquetaNacional({ ...pago, paisDestino: "BR", paymentStatus: "pending" })
    ).toBe(false);
  });

  it("Brasil com etiqueta concluída não oferece de novo", () => {
    expect(podeOferecerEtiquetaNacional({ ...pago, paisDestino: "BR", jaTemEtiqueta: true })).toBe(
      false
    );
  });

  it("erro de etiqueta no Brasil mantém o 'tentar novamente'", () => {
    expect(
      podeOferecerEtiquetaNacional({
        ...pago,
        paisDestino: "BR",
        shippingStatus: "shipping_error",
      })
    ).toBe(true);
  });

  it("país em minúsculas não engana a trava", () => {
    expect(podeOferecerEtiquetaNacional({ ...pago, paisDestino: "us" })).toBe(false);
  });
});
