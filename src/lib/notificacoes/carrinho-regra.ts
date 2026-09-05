/**
 * As regras do carrinho abandonado, separadas de banco e de rede.
 *
 * Ficam num arquivo próprio pelo mesmo motivo de
 * `chamada-pos-pagamento-regra.ts` no app da prótese: o módulo que fala com
 * o Supabase carrega `server-only` e não roda em teste. As decisões que
 * custam dinheiro — quem entra na fila, a que horas, quantos por vez —
 * precisam de teste, então moram aqui.
 */

/** Minutos de espera antes de tocar. Menos que isso é atropelar quem ainda
 *  está com o Pix aberto em outra aba. */
export const ESPERA_MINUTOS_PADRAO = 60;

/**
 * Janela máxima. Depois disso não se toca mais no assunto.
 *
 * Existe por uma razão concreta e não por estética: quando este fluxo subir,
 * a loja terá 7 pedidos pendentes parados desde 29–31/08. Sem teto, a
 * primeira rodada mandaria "vi que você não finalizou" para gente que tentou
 * comprar uma semana antes — mensagem paga, atrasada e constrangedora, numa
 * conta com caso de spam aberto desde 29/08. O teto faz o fluxo nascer
 * mirando só quem abandonou agora.
 */
export const JANELA_HORAS_PADRAO = 48;

/** Horário de atendimento, em São Paulo. Ninguém recebe oferta às 4h. */
export const HORA_INICIO_PADRAO = 9;
export const HORA_FIM_PADRAO = 20;

export const MAX_POR_RODADA_PADRAO = 3;
export const MAX_POR_DIA_PADRAO = 20;

function inteiro(bruto: string | undefined, padrao: number): number {
  const n = Number.parseInt((bruto ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : padrao;
}

export interface Limites {
  esperaMinutos: number;
  janelaHoras: number;
  horaInicio: number;
  horaFim: number;
  maxPorRodada: number;
  maxPorDia: number;
}

export function limitesDoAmbiente(env: NodeJS.ProcessEnv = process.env): Limites {
  return {
    esperaMinutos: inteiro(env.CARRINHO_ESPERA_MINUTOS, ESPERA_MINUTOS_PADRAO),
    janelaHoras: inteiro(env.CARRINHO_JANELA_HORAS, JANELA_HORAS_PADRAO),
    horaInicio: inteiro(env.CARRINHO_HORA_INICIO, HORA_INICIO_PADRAO),
    horaFim: inteiro(env.CARRINHO_HORA_FIM, HORA_FIM_PADRAO),
    maxPorRodada: inteiro(env.CARRINHO_MAX_POR_RODADA, MAX_POR_RODADA_PADRAO),
    maxPorDia: inteiro(env.CARRINHO_MAX_POR_DIA, MAX_POR_DIA_PADRAO),
  };
}

/**
 * A hora em São Paulo, tirada do relógio do servidor.
 *
 * `Intl` e não `getHours()`: a Vercel roda em UTC, e `getHours()` daria 4h
 * quando aqui é meia-noite — a janela de atendimento sairia deslocada em 3
 * horas e o toque cairia de madrugada. É o mesmo erro que fez o atendente
 * marcar 07:00 em [[atendente-nao-entendia-o-horario]].
 */
export function horaEmSaoPaulo(agora: Date): number {
  const texto = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(agora);
  return Number.parseInt(texto, 10);
}

export function dentroDoHorario(agora: Date, limites: Limites): boolean {
  const hora = horaEmSaoPaulo(agora);
  return hora >= limites.horaInicio && hora < limites.horaFim;
}

export interface PedidoCandidato {
  id: string;
  criadoEm: string;
  telefone: string | null;
  moeda: string | null;
}

export type MotivoPulo = "sem_telefone" | "fora_da_janela" | "moeda_sem_template";

export type Decisao = { enviar: true } | { enviar: false; motivo: MotivoPulo };

/**
 * Só português, e só quem paga em real.
 *
 * A loja vende em dólar desde 02/09, e existe UM template, em pt_BR. Mandar
 * português para um comprador americano é pior que não mandar: gasta uma
 * peça de marketing, queima o limite da Meta por usuário e ainda parece
 * descuido. Quando houver template en/es, esta função é o único lugar a
 * mudar.
 */
export function decidir(
  pedido: PedidoCandidato,
  agora: Date,
  limites: Limites
): Decisao {
  const telefone = (pedido.telefone ?? "").replace(/\D/g, "");
  if (telefone.length < 10) return { enviar: false, motivo: "sem_telefone" };

  const moeda = (pedido.moeda ?? "BRL").trim().toUpperCase();
  if (moeda !== "BRL") return { enviar: false, motivo: "moeda_sem_template" };

  const criado = new Date(pedido.criadoEm).getTime();
  if (!Number.isFinite(criado)) return { enviar: false, motivo: "fora_da_janela" };

  const idadeMinutos = (agora.getTime() - criado) / 60000;
  if (idadeMinutos < limites.esperaMinutos) return { enviar: false, motivo: "fora_da_janela" };
  if (idadeMinutos > limites.janelaHoras * 60) {
    return { enviar: false, motivo: "fora_da_janela" };
  }

  return { enviar: true };
}
