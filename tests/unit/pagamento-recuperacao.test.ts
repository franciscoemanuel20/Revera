import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const fonte = readFileSync(join(process.cwd(), "src/app/checkout/pagamento/page.tsx"), "utf8");
const fonteAscii = fonte.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

describe("checkout pagamento - recuperacao", () => {
  it("classifica motivos de pagamento indisponivel", () => {
    expect(fonte).toContain("type MotivoPagamentoIndisponivel");
    expect(fonte).toContain('"erro_tecnico"');
    expect(fonte).toContain('"em_preparacao"');
    expect(fonte).toContain('"reserva_travada"');
    expect(fonte).toContain('"metodo_indisponivel"');
    expect(fonte).toContain('"internacional_indisponivel"');
    expect(fonte).toContain('"link_bloqueado"');
  });

  it("mantem tentativa segura sem criar segundo link", () => {
    expect(fonteAscii).toContain("nao criamos uma segunda cobranca");
    expect(fonte).toContain("<AutoRetryPagamento ativo={aguardando} />");
    expect(fonte).toContain("Tentar novamente");
    expect(fonte).toContain("Ver meu pedido");
  });

  it("orienta suporte somente quando precisa de intervencao", () => {
    expect(fonte).toContain('motivo === "reserva_travada"');
    expect(fonte).toContain('motivo === "metodo_indisponivel"');
    expect(fonte).toContain('motivo === "link_bloqueado"');
    expect(fonte).toContain('motivo === "internacional_indisponivel"');
    expect(fonte).toContain("Diagnóstico do pedido");
    expect(fonte).toContain("Ver meu pedido");
    expect(fonte).toContain("cobrança pendente");
  });

  it("explica as opcoes rapidas esperadas no checkout hospedado", () => {
    expect(fonte).toContain("Pix aparece como opção rápida");
    expect(fonte).toContain("Cartão de crédito fica disponível");
    expect(fonte).toContain("Apple Pay ou Google Pay aparecem");
  });
});
