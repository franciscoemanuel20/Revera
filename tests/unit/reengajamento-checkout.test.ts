import { describe, expect, it } from "vitest";
import {
  escolherDestinatarios,
  pareceTeste,
  type LinhaReengajamento,
} from "@/lib/notificacoes/reengajamento-checkout";

const linha = (id: string, nome: string, telefone: string | null): LinhaReengajamento => ({
  id,
  codigo: `REV-${id}`,
  criadoEm: "2026-09-18T12:00:00Z",
  nome,
  telefone,
  email: null,
});

describe("pareceTeste", () => {
  it("pega os nomes de teste reais da lista de 18/09", () => {
    expect(pareceTeste("TESTE CLAUDE Francisco", "11954887743")).toBe(true);
    expect(pareceTeste("Teste Revera Campanha 0909 Nome Comprido Para Smoke", "11954887743")).toBe(true);
    expect(pareceTeste("Auditoria Teste Revera", "11954887743")).toBe(true);
    expect(pareceTeste("Teste Handle 31-08", "11954887743")).toBe(true);
  });

  it("pega os números da própria loja e os de mentira", () => {
    expect(pareceTeste("Ketlin gabriel", "12981409901")).toBe(true);
    expect(pareceTeste("Ketlin gabriel", "+55 12 98140-9901")).toBe(true);
    expect(pareceTeste("Fulano", "11999999999")).toBe(true);
    expect(pareceTeste("Fulano", "11900000000")).toBe(true);
    expect(pareceTeste("Fulano", "11999990000")).toBe(true);
  });

  it("não pega cliente de verdade", () => {
    expect(pareceTeste("RENAN ALBUQUERQUE RODRIGUES", "85994309770")).toBe(false);
    expect(pareceTeste("Thiago Santos Rodrigues", "11954887743")).toBe(false);
    // "Contestado" contém "test" mas não é a palavra "teste".
    expect(pareceTeste("Ana Contestado", "11954887743")).toBe(false);
  });
});

describe("escolherDestinatarios", () => {
  it("manda uma vez por pessoa, pelo pedido mais recente", () => {
    const { escolhidos, fora } = escolherDestinatarios(
      [
        linha("a", "Renan", "85994309770"),
        linha("b", "Renan Rodrigues", "(85) 99430-9770"),
        linha("c", "Thiago", "11954887743"),
      ],
      new Set()
    );
    expect(escolhidos.map((e) => e.id)).toEqual(["a", "c"]);
    expect(escolhidos[0]?.destino).toBe("5585994309770");
    expect(fora).toEqual([{ linha: expect.objectContaining({ id: "b" }), motivo: "outro_pedido_da_mesma_pessoa" }]);
  });

  it("não manda de novo para quem já recebeu, em qualquer pedido", () => {
    const { escolhidos, fora } = escolherDestinatarios(
      [linha("a", "Renan", "85994309770")],
      new Set(["5585994309770"])
    );
    expect(escolhidos).toEqual([]);
    expect(fora[0]?.motivo).toBe("ja_recebeu");
  });

  it("tira pedido feito com o e-mail de um administrador, com qualquer nome", () => {
    const pedido = { ...linha("a", "Francisco Estética Capilar", "12996790105"), email: "Dono@Loja.com " };
    const { escolhidos, fora } = escolherDestinatarios([pedido], new Set(), new Set(["dono@loja.com"]));
    expect(escolhidos).toEqual([]);
    expect(fora[0]?.motivo).toBe("teste");
  });

  it("tira teste e telefone inválido", () => {
    const { escolhidos, fora } = escolherDestinatarios(
      [linha("a", "TESTE Claude", "11954887743"), linha("b", "Inácio", "351928150157"), linha("c", "Sem", null)],
      new Set()
    );
    expect(escolhidos).toEqual([]);
    expect(fora.map((f) => f.motivo)).toEqual(["teste", "sem_telefone", "sem_telefone"]);
  });
});
