import { describe, expect, it } from "vitest";
import {
  CAIXA_UNITARIA,
  caixaPara,
  escolherServico,
  melhorOpcao,
} from "@/lib/shipping/regras";
import type { ShippingQuote } from "@/lib/shipping/provider";

/**
 * As regras de frete que decidem dinheiro.
 *
 * Os números do primeiro bloco são REAIS: cotação São José dos Campos →
 * Manaus, 300 g, feita no painel da SuperFrete em 19/08/2026. É o caso que
 * originou a regra — a Jadlog era a mais barata E não cobria o valor da peça.
 * Testar com números inventados aqui não provaria nada; o ponto é justamente
 * que a opção mais barata era a errada.
 */

/** Cotação real de 19/08/2026, SJC → Manaus, 300 g, peça de R$ 1.600. */
const COTACAO_REAL: ShippingQuote[] = [
  { serviceId: 3, serviceName: "Jadlog .Package", carrier: "Jadlog", priceCents: 1943, etaDays: 6, coversInsurance: false },
  { serviceId: 31, serviceName: "Loggi Express", carrier: "Loggi", priceCents: 2280, etaDays: 4, coversInsurance: true },
  { serviceId: 1, serviceName: "PAC", carrier: "Correios", priceCents: 2612, etaDays: 8, coversInsurance: true },
  { serviceId: 2, serviceName: "SEDEX", carrier: "Correios", priceCents: 4831, etaDays: 3, coversInsurance: true },
];

describe("melhorOpcao — a regra do seguro", () => {
  it("escolhe a Loggi e não a Jadlog, que é R$ 3,37 mais barata mas deixa R$ 100 da peça descobertos", () => {
    const escolhida = melhorOpcao(COTACAO_REAL);
    expect(escolhida?.carrier).toBe("Loggi");
    expect(escolhida?.priceCents).toBe(2280);
  });

  it("descarta serviço que veio com erro, mesmo cobrindo o seguro", () => {
    const escolhida = melhorOpcao([
      { serviceId: 1, serviceName: "PAC", carrier: "Correios", priceCents: 2000, etaDays: 8, coversInsurance: true, error: "CEP não atendido" },
      { serviceId: 2, serviceName: "SEDEX", carrier: "Correios", priceCents: 4831, etaDays: 3, coversInsurance: true },
    ]);
    expect(escolhida?.priceCents).toBe(4831);
  });

  it("descarta preço zero — a API devolve 0 em serviço indisponível, e sem isto o frete sairia de graça", () => {
    const escolhida = melhorOpcao([
      { serviceId: 1, serviceName: "PAC", carrier: "Correios", priceCents: 0, etaDays: 0, coversInsurance: true },
      { serviceId: 2, serviceName: "SEDEX", carrier: "Correios", priceCents: 4831, etaDays: 3, coversInsurance: true },
    ]);
    expect(escolhida?.priceCents).toBe(4831);
  });

  it("devolve null quando nenhuma cobre o seguro, em vez da menos ruim", () => {
    expect(
      melhorOpcao([
        { serviceId: 3, serviceName: "Jadlog", carrier: "Jadlog", priceCents: 1943, etaDays: 6, coversInsurance: false },
        { serviceId: 33, serviceName: "J&T", carrier: "J&T", priceCents: 1800, etaDays: 7, coversInsurance: false },
      ])
    ).toBeNull();
  });

  it("lista vazia devolve null", () => {
    expect(melhorOpcao([])).toBeNull();
  });

  it("não altera a lista que recebeu", () => {
    const original = [...COTACAO_REAL];
    melhorOpcao(COTACAO_REAL);
    expect(COTACAO_REAL).toEqual(original);
  });
});

describe("escolherServico — no despacho a escolha não é livre", () => {
  it("compra o MESMO serviço que o cliente pagou, mesmo havendo mais barato hoje", () => {
    // SEDEX foi cobrado no checkout. Hoje a Loggi está mais barata — e não
    // importa: trocar faria a diferença sair do bolso da operação.
    const escolhido = escolherServico(2, COTACAO_REAL);
    expect(escolhido?.serviceId).toBe(2);
    expect(escolhido?.serviceName).toBe("SEDEX");
  });

  it("cai na melhor opção quando o serviço pago sumiu da praça", () => {
    const semLoggi = COTACAO_REAL.filter((o) => o.serviceId !== 31);
    // 31 (Loggi) foi cobrado, mas não aparece mais na cotação de hoje.
    const escolhido = escolherServico(31, semLoggi);
    expect(escolhido?.carrier).toBe("Correios");
    expect(escolhido?.priceCents).toBe(2612); // o PAC, mais barato dos que cobrem
  });

  it("cai na melhor opção quando o serviço pago voltou com erro", () => {
    const comErro = COTACAO_REAL.map((o) =>
      o.serviceId === 2 ? { ...o, error: "CEP não atendido" } : o
    );
    expect(escolherServico(2, comErro)?.serviceId).toBe(31);
  });

  it("pedido antigo sem serviço gravado usa a melhor opção", () => {
    expect(escolherServico(null, COTACAO_REAL)?.carrier).toBe("Loggi");
  });

  it("respeita o serviço pago mesmo que ele não cubra o seguro — mudar sozinho seria desfazer decisão já tomada", () => {
    // A Jadlog não cobre os R$ 1.600. Se ainda assim foi ela que o cliente
    // pagou, quem decide trocar é gente, olhando a diferença de preço — não
    // esta função, calada.
    expect(escolherServico(3, COTACAO_REAL)?.carrier).toBe("Jadlog");
  });

  it("sem nenhuma opção utilizável devolve null, não uma etiqueta errada", () => {
    expect(escolherServico(2, [])).toBeNull();
  });
});

describe("caixaPara — erra para cima de propósito", () => {
  it("uma peça é a caixa unitária", () => {
    expect(caixaPara(1)).toEqual(CAIXA_UNITARIA);
  });

  it("peças empilham: peso e altura somam, a base não muda", () => {
    expect(caixaPara(3)).toEqual({
      weightGrams: 900,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 15,
    });
  });

  it("quantidade zero ou negativa não vira caixa de peso zero", () => {
    expect(caixaPara(0)).toEqual(CAIXA_UNITARIA);
    expect(caixaPara(-5)).toEqual(CAIXA_UNITARIA);
  });

  it("quantidade fracionária não gera meia caixa", () => {
    expect(caixaPara(2.7).weightGrams).toBe(600);
  });
});
