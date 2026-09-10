import { describe, expect, it } from "vitest";
import {
  comDDI,
  decidir,
  dentroDoHorario,
  etapaDaRecuperacao,
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
      esperaMinutos: 20,
      segundoLembreteHoras: 24,
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

describe("etapas da recuperação", () => {
  it("libera o primeiro toque aos 20 minutos", () => {
    expect(etapaDaRecuperacao({}, AGORA, LIMITES)).toBe("primeiro");
  });

  it("só libera o último lembrete 24 horas após o primeiro envio", () => {
    const estado = {
      primeiroCriadoEm: new Date(AGORA.getTime() - 24 * 3600_000).toISOString(),
      primeiroEnviadoEm: new Date(AGORA.getTime() - 24 * 3600_000).toISOString(),
    };
    expect(etapaDaRecuperacao(estado, AGORA, LIMITES)).toBe("ultimo");
    expect(
      etapaDaRecuperacao(
        { ...estado, primeiroCriadoEm: new Date(AGORA.getTime() - 23 * 3600_000).toISOString() },
        AGORA,
        LIMITES
      )
    ).toBeNull();
  });

  it("não cria segundo toque se o primeiro falhou ou se o último já foi reservado", () => {
    const ontem = new Date(AGORA.getTime() - 25 * 3600_000).toISOString();
    expect(etapaDaRecuperacao({ primeiroCriadoEm: ontem }, AGORA, LIMITES)).toBeNull();
    expect(
      etapaDaRecuperacao(
        { primeiroCriadoEm: ontem, primeiroEnviadoEm: ontem, ultimoReservado: true },
        AGORA,
        LIMITES
      )
    ).toBeNull();
  });
});


/**
 * Achado P1 do Codex em 05/09/2026. O checkout guarda 10-11 dígitos sem o
 * `55` (schema.ts), e os 7 clientes reais no banco estão assim, começando em
 * "4899". Sem DDI a Clint não acha o contato, CRIA um novo com o número
 * incompleto, e a mensagem paga vai para quem não é o cliente.
 */
describe("telefone com DDI", () => {
  it("celular do checkout (11 dígitos) ganha o 55", () => {
    expect(comDDI("48999887766")).toBe("5548999887766");
  });

  it("fixo do checkout (10 dígitos) ganha o 55", () => {
    expect(comDDI("4833445566")).toBe("554833445566");
  });

  it("aceita máscara e espaços", () => {
    expect(comDDI("(48) 99988-7766")).toBe("5548999887766");
  });

  it("número que já tem DDI não ganha outro", () => {
    expect(comDDI("5548999887766")).toBe("5548999887766");
  });

  /**
   * A armadilha: 55 também é DDD (Santa Maria/RS). Decidir por "começa com
   * 55" mandaria o gaúcho sem DDI. Quem decide é o TAMANHO.
   */
  it("DDD 55 do Rio Grande do Sul ainda ganha o DDI", () => {
    expect(comDDI("55996622326")).toBe("5555996622326");
  });

  it("lixo e vazio viram null em vez de virar envio", () => {
    expect(comDDI("123")).toBeNull();
    expect(comDDI("")).toBeNull();
    expect(comDDI(null)).toBeNull();
    expect(comDDI("999999999999999")).toBeNull();
  });

  it("decidir recusa o pedido cujo telefone não vira número válido", () => {
    const p = {
      id: "x",
      criadoEm: new Date(AGORA.getTime() - 2 * 3600_000).toISOString(),
      telefone: "123",
      moeda: "BRL",
    };
    expect(decidir(p, AGORA, LIMITES)).toEqual({ enviar: false, motivo: "sem_telefone" });
  });
});
