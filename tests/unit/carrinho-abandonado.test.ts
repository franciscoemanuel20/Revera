import { describe, expect, it } from "vitest";
import {
  decidir,
  dentroDoHorario,
  horaEmSaoPaulo,
  limitesDoAmbiente,
  type Limites,
} from "@/lib/notificacoes/carrinho-regra";

const LIMITES: Limites = limitesDoAmbiente({} as unknown as NodeJS.ProcessEnv);

const AGORA = new Date("2026-09-05T18:00:00Z"); // 15h em São Paulo

function pedido(campos: Partial<Parameters<typeof decidir>[0]> = {}) {
  return {
    id: "pedido-1",
    criadoEm: new Date(AGORA.getTime() - 2 * 3600_000).toISOString(),
    telefone: "11999990000",
    moeda: "BRL",
    ...campos,
  };
}

describe("quem entra na fila do carrinho abandonado", () => {
  it("pendente de 2h, com telefone e em real: entra", () => {
    expect(decidir(pedido(), AGORA, LIMITES)).toEqual({ enviar: true });
  });

  /**
   * O teste que existe por causa de um caso real: quando este fluxo subir, a
   * loja tem 7 pedidos parados desde 29–31/08. Sem a janela, a primeira
   * rodada mandaria "vi que você não finalizou" para gente de uma semana
   * atrás — mensagem paga, atrasada e constrangedora.
   */
  it("pendente de uma semana NÃO entra", () => {
    const velho = pedido({ criadoEm: new Date(AGORA.getTime() - 7 * 24 * 3600_000).toISOString() });
    expect(decidir(velho, AGORA, LIMITES)).toEqual({ enviar: false, motivo: "fora_da_janela" });
  });

  it("abandonado há 10 minutos ainda não: pode estar com o Pix aberto", () => {
    const recente = pedido({ criadoEm: new Date(AGORA.getTime() - 10 * 60_000).toISOString() });
    expect(decidir(recente, AGORA, LIMITES)).toEqual({ enviar: false, motivo: "fora_da_janela" });
  });

  it("sem telefone não entra", () => {
    expect(decidir(pedido({ telefone: null }), AGORA, LIMITES)).toEqual({
      enviar: false,
      motivo: "sem_telefone",
    });
  });

  /**
   * A loja vende em dólar desde 02/09 e o template é pt_BR. Mandar português
   * para quem paga em dólar gasta uma peça de marketing e queima o limite da
   * Meta por usuário.
   */
  it("quem paga em dólar não recebe o template em português", () => {
    expect(decidir(pedido({ moeda: "USD" }), AGORA, LIMITES)).toEqual({
      enviar: false,
      motivo: "moeda_sem_template",
    });
  });

  it("data ilegível não vira envio", () => {
    expect(decidir(pedido({ criadoEm: "não é data" }), AGORA, LIMITES)).toEqual({
      enviar: false,
      motivo: "fora_da_janela",
    });
  });
});

describe("horário de atendimento", () => {
  /**
   * A Vercel roda em UTC. `getHours()` diria 4h quando em São Paulo é 1h da
   * manhã — a janela sairia deslocada em 3 horas e o toque cairia de
   * madrugada, o mesmo erro que fez o atendente marcar 07:00.
   */
  it("lê a hora em São Paulo, não a do servidor", () => {
    const meiaNoiteEmSP = new Date("2026-09-05T03:00:00Z");
    expect(meiaNoiteEmSP.getUTCHours()).toBe(3);
    expect(horaEmSaoPaulo(meiaNoiteEmSP)).toBe(0);
  });

  it("3h da manhã em São Paulo não manda nada", () => {
    expect(dentroDoHorario(new Date("2026-09-05T06:00:00Z"), LIMITES)).toBe(false);
  });

  it("15h em São Paulo manda", () => {
    expect(dentroDoHorario(AGORA, LIMITES)).toBe(true);
  });

  it("20h é fim: às 20h já não manda", () => {
    expect(dentroDoHorario(new Date("2026-09-05T23:00:00Z"), LIMITES)).toBe(false);
  });
});

describe("limites do ambiente", () => {
  it("sem variável nenhuma usa os padrões conservadores", () => {
    expect(LIMITES).toEqual({
      esperaMinutos: 60,
      janelaHoras: 48,
      horaInicio: 9,
      horaFim: 20,
      maxPorRodada: 3,
      maxPorDia: 20,
    });
  });

  /**
   * Lixo em variável de ambiente não pode virar teto infinito nem zero
   * silencioso — é a família do TAB que parou a loja de cobrar em 29/08.
   */
  it("valor inválido cai no padrão em vez de virar NaN", () => {
    const l = limitesDoAmbiente({ CARRINHO_MAX_POR_DIA: "muitos" } as unknown as NodeJS.ProcessEnv);
    expect(l.maxPorDia).toBe(20);
  });

  it("valor válido manda", () => {
    const l = limitesDoAmbiente({ CARRINHO_MAX_POR_DIA: "5" } as unknown as NodeJS.ProcessEnv);
    expect(l.maxPorDia).toBe(5);
  });
});
