import "server-only";

/**
 * A consulta da tela de recuperação de carrinho abandonado.
 *
 * ===========================================================================
 * POR QUE EXISTE (11/09/2026)
 * ===========================================================================
 * O cron (`rodadaDeCarrinhoAbandonado`, em carrinho-abandonado.ts) decide e
 * envia, mas não tinha vitrine: para saber por que um pedido pendente não
 * recebeu aviso, a única forma era ler log da Vercel. Esta consulta reusa as
 * MESMAS regras do cron (`decidir`, `etapaDaRecuperacao`, os mesmos
 * `Limites`) para que a tela nunca diga "elegível" para um pedido que o cron
 * na verdade pularia — duas implementações da mesma regra é como elas
 * divergem em silêncio.
 *
 * ===========================================================================
 * A DISTINÇÃO QUE IMPORTA: NÃO AVISAMOS × TENTAMOS E RECUSARAM
 * ===========================================================================
 * Achado de 11/09/2026 (ver carrinho-abandonado.ts): até esta data, falta de
 * template configurado e recusa de verdade da Meta/Clint caíam no mesmo
 * motivo (`envio_recusado`), escondendo a causa real. Esta tela separa os
 * três casos que um pedido pendente pode estar:
 *
 *   1. ainda não é hora (dentro da janela de espera, ou fora do horário);
 *   2. não é elegível (sem telefone, moeda sem template, fora da janela);
 *   3. foi tentado e RECUSADO de verdade (erro da Meta/Clint, em
 *      `order_notifications.last_error`).
 *
 * Só o terceiro é uma recusa. Os outros dois nunca chegaram a tentar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decidir,
  dentroDoHorario,
  etapaDaRecuperacao,
  limitesDoAmbiente,
  type Limites,
} from "@/lib/notificacoes/carrinho-regra";
import { modoWhatsApp, type ModoWhatsApp } from "@/lib/notificacoes/whatsapp";

const KIND_PRIMEIRO = "checkout_abandonado_primeiro";
const KIND_LEGADO = "carrinho_abandonado";
const KIND_ULTIMO = "checkout_abandonado_ultimo";
const TAMANHO_PAGINA = 200;
const MAX_PAGINAS = 5;

export type EtapaExibida =
  | "aguardando_janela"
  | "elegivel_primeiro"
  | "primeiro_enviado"
  | "primeiro_recusado"
  | "elegivel_ultimo"
  | "ultimo_enviado"
  | "ultimo_recusado"
  | "fora_da_janela"
  | "nao_elegivel";

export const ETAPA_LABEL: Record<EtapaExibida, string> = {
  aguardando_janela: "Aguardando janela de espera",
  elegivel_primeiro: "Pronto para o 1º aviso",
  primeiro_enviado: "1º aviso enviado",
  primeiro_recusado: "1º aviso recusado",
  elegivel_ultimo: "Pronto para o último lembrete",
  ultimo_enviado: "Último lembrete enviado",
  ultimo_recusado: "Último lembrete recusado",
  fora_da_janela: "Fora da janela de recuperação",
  nao_elegivel: "Não elegível",
};

interface NotificacaoResumo {
  /** Quando a reserva foi criada — é isto, não `enviadoEm`, que conta para
   *  a janela do último lembrete (mesma regra do cron). */
  reservadoEm: string;
  enviadoEm: string | null;
  ultimoErro: string | null;
}

export interface PedidoRecuperacao {
  id: string;
  orderNumber: string;
  criadoEm: string;
  cliente: string;
  telefone: string | null;
  email: string | null;
  totalCents: number;
  currency: string;
  etapa: EtapaExibida;
  motivoNaoElegivel: string | null;
  primeiro: NotificacaoResumo | null;
  ultimo: NotificacaoResumo | null;
}

export interface ResumoRecuperacao {
  total: number;
  aguardandoJanela: number;
  elegiveis: number;
  primeiroEnviado: number;
  ultimoEnviado: number;
  recusadosDeVerdade: number;
  foraDaJanelaOuNaoElegivel: number;
}

const MOTIVO_LABEL: Record<"sem_telefone" | "fora_da_janela" | "moeda_sem_template", string> = {
  sem_telefone: "sem telefone válido",
  moeda_sem_template: "moeda sem modelo aprovado (só BRL por enquanto)",
  fora_da_janela: "fora da janela de recuperação",
};

function vazio(): ResumoRecuperacao {
  return {
    total: 0,
    aguardandoJanela: 0,
    elegiveis: 0,
    primeiroEnviado: 0,
    ultimoEnviado: 0,
    recusadosDeVerdade: 0,
    foraDaJanelaOuNaoElegivel: 0,
  };
}

function erroDeConfiguracao(erro: string | null): string | null {
  if (!erro) return null;

  const normalizado = erro.toLowerCase();
  if (normalizado.includes("whatsapp desligado") || normalizado.includes("whatsapp_provider desligado")) {
    return erro;
  }

  if (normalizado.includes("template") && normalizado.includes("configurado")) {
    return erro;
  }

  return null;
}

interface PagosPorPessoa {
  telefones: Map<string, string[]>;
  emails: Map<string, string[]>;
  erro: boolean;
}

function adicionarIndicePessoa(indice: Map<string, string[]>, chave: string, data: string) {
  if (!chave) return;
  const lista = indice.get(chave) ?? [];
  lista.push(data);
  indice.set(chave, lista);
}

function variantesTelefoneBrasileiro(telefone: string): string[] {
  if (!telefone) return [];
  const sem55 = telefone.startsWith("55") && telefone.length > 11 ? telefone.slice(2) : telefone;
  const com55 = sem55.length >= 10 ? `55${sem55}` : "";
  return [...new Set([telefone, sem55, com55, com55 ? `+${com55}` : ""].filter(Boolean))];
}

function comprouPorOutroPedido(
  pagos: PagosPorPessoa,
  pedido: { criadoEm: string; telefone: string | null; email: string | null }
): boolean {
  if (pagos.erro) return true;

  const telefone = (pedido.telefone ?? "").replace(/\D/g, "");
  const email = (pedido.email ?? "").trim().toLowerCase();
  const posteriores = [
    ...variantesTelefoneBrasileiro(telefone).flatMap((valor) => pagos.telefones.get(valor) ?? []),
    ...(email ? pagos.emails.get(email) ?? [] : []),
  ];

  return posteriores.some((data) => new Date(data).getTime() >= new Date(pedido.criadoEm).getTime());
}

async function buscarPagosPorPessoa(
  supabase: SupabaseClient,
  pedidos: Array<{ created_at: string }>
): Promise<PagosPorPessoa> {
  const telefones = new Map<string, string[]>();
  const emails = new Map<string, string[]>();
  const maisAntigo = pedidos[pedidos.length - 1]?.created_at;
  if (!maisAntigo) return { telefones, emails, erro: false };

  const { data, error } = await supabase
    .from("orders")
    .select("updated_at, customers(phone, email)")
    .eq("payment_status", "paid")
    .gte("updated_at", maisAntigo)
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (error) return { telefones, emails, erro: true };

  for (const linha of data ?? []) {
    const cliente = Array.isArray(linha.customers) ? linha.customers[0] : linha.customers;
    const dataPagamento = linha.updated_at as string;
    for (const telefone of variantesTelefoneBrasileiro((cliente?.phone ?? "").replace(/\D/g, ""))) {
      adicionarIndicePessoa(telefones, telefone, dataPagamento);
    }
    adicionarIndicePessoa(emails, (cliente?.email ?? "").trim().toLowerCase(), dataPagamento);
  }

  return { telefones, emails, erro: false };
}

/**
 * Linha por pedido. Dois motivos para não usar `decidir()` sozinha aqui:
 *
 *   - `decidir` responde só "pode tocar AGORA", não "em que pé está" — um
 *     pedido com o primeiro aviso já enviado passa por `enviar: true`
 *     (está dentro da janela), mas o certo é mostrar "1º aviso enviado",
 *     não "pronto para enviar".
 *   - Precisa saber, por etapa, se JÁ houve tentativa recusada, para não
 *     confundir "ainda não tentamos" com "tentamos e a Meta recusou" — a
 *     mesma distinção que motivou o achado de 11/09/2026.
 */
function etapaDoPedido(
  pedido: {
    telefone: string | null;
    moeda: string | null;
    criadoEm: string;
  },
  primeiro: NotificacaoResumo | null,
  ultimo: NotificacaoResumo | null,
  agora: Date,
  limites: Limites
): { etapa: EtapaExibida; motivoNaoElegivel: string | null } {
  if (ultimo?.enviadoEm) return { etapa: "ultimo_enviado", motivoNaoElegivel: null };
  const erroUltimoConfiguracao = erroDeConfiguracao(ultimo?.ultimoErro ?? null);
  if (erroUltimoConfiguracao) return { etapa: "nao_elegivel", motivoNaoElegivel: erroUltimoConfiguracao };
  if (ultimo?.ultimoErro) return { etapa: "ultimo_recusado", motivoNaoElegivel: null };

  if (primeiro?.enviadoEm) {
    const decisao = decidir(
      { id: "", criadoEm: pedido.criadoEm, telefone: pedido.telefone, moeda: pedido.moeda },
      agora,
      limites
    );
    if (!decisao.enviar) {
      if (decisao.motivo === "fora_da_janela") {
        return { etapa: "fora_da_janela", motivoNaoElegivel: MOTIVO_LABEL.fora_da_janela };
      }
      return { etapa: "nao_elegivel", motivoNaoElegivel: MOTIVO_LABEL[decisao.motivo] ?? decisao.motivo };
    }
    if (!dentroDoHorario(agora, limites)) {
      return { etapa: "aguardando_janela", motivoNaoElegivel: "fora do horário de atendimento" };
    }

    const proximaEtapa = etapaDaRecuperacao(
      { primeiroCriadoEm: primeiro.reservadoEm, primeiroEnviadoEm: primeiro.enviadoEm },
      agora,
      limites
    );
    if (proximaEtapa === "ultimo") return { etapa: "elegivel_ultimo", motivoNaoElegivel: null };
    return { etapa: "primeiro_enviado", motivoNaoElegivel: null };
  }
  const erroPrimeiroConfiguracao = erroDeConfiguracao(primeiro?.ultimoErro ?? null);
  if (erroPrimeiroConfiguracao) return { etapa: "nao_elegivel", motivoNaoElegivel: erroPrimeiroConfiguracao };
  if (primeiro?.ultimoErro) return { etapa: "primeiro_recusado", motivoNaoElegivel: null };

  const decisao = decidir(
    { id: "", criadoEm: pedido.criadoEm, telefone: pedido.telefone, moeda: pedido.moeda },
    agora,
    limites
  );
  if (!decisao.enviar) {
    if (decisao.motivo === "fora_da_janela") {
      const idadeMin = (agora.getTime() - new Date(pedido.criadoEm).getTime()) / 60000;
      if (idadeMin < limites.esperaMinutos) {
        return { etapa: "aguardando_janela", motivoNaoElegivel: null };
      }
      return { etapa: "fora_da_janela", motivoNaoElegivel: MOTIVO_LABEL.fora_da_janela };
    }
    return { etapa: "nao_elegivel", motivoNaoElegivel: MOTIVO_LABEL[decisao.motivo] ?? decisao.motivo };
  }
  if (!dentroDoHorario(agora, limites)) {
    return { etapa: "aguardando_janela", motivoNaoElegivel: "fora do horário de atendimento" };
  }
  return { etapa: "elegivel_primeiro", motivoNaoElegivel: null };
}

export async function buscarRecuperacao(
  supabase: SupabaseClient,
  agora: Date = new Date()
): Promise<{ pedidos: PedidoRecuperacao[]; resumo: ResumoRecuperacao; erro: boolean }> {
  const limites = limitesDoAmbiente();

  const data: Array<{
    id: string;
    order_number: string;
    created_at: string;
    total_cents: number;
    currency: string;
    customers:
      | { full_name: string | null; phone: string | null; email: string | null }
      | Array<{ full_name: string | null; phone: string | null; email: string | null }>
      | null;
    order_notifications:
      | Array<{ kind: string; created_at: string; sent_at: string | null; last_error: string | null }>
      | null;
  }> = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const inicio = pagina * TAMANHO_PAGINA;
    const fim = inicio + TAMANHO_PAGINA - 1;
    const { data: paginaDados, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, created_at, total_cents, currency, customers(full_name, phone, email), order_notifications(kind, created_at, sent_at, last_error)"
      )
      .eq("payment_status", "pending")
      .is("canceled_at", null)
      .order("created_at", { ascending: false })
      .range(inicio, fim);

    if (error || !paginaDados) return { pedidos: [], resumo: vazio(), erro: true };
    data.push(...(paginaDados as typeof data));
    if (paginaDados.length < TAMANHO_PAGINA) break;
  }

  const pagos = await buscarPagosPorPessoa(supabase, data);

  const resumo = vazio();
  resumo.total = data.length;

  const pedidos: PedidoRecuperacao[] = data.map((linha) => {
    const cliente = Array.isArray(linha.customers) ? linha.customers[0] : linha.customers;
    const notificacoes = (linha.order_notifications ?? []) as Array<{
      kind: string;
      created_at: string;
      sent_at: string | null;
      last_error: string | null;
    }>;

    const achar = (kind: string): NotificacaoResumo | null => {
      const n = notificacoes.find((x) => x.kind === kind);
      if (!n) return null;
      return {
        reservadoEm: n.created_at,
        enviadoEm: n.sent_at,
        ultimoErro: n.sent_at ? null : n.last_error,
      };
    };

    const primeiro = achar(KIND_PRIMEIRO) ?? achar(KIND_LEGADO);
    const ultimo = achar(KIND_ULTIMO);

    let { etapa, motivoNaoElegivel } = etapaDoPedido(
      { telefone: cliente?.phone ?? null, moeda: linha.currency, criadoEm: linha.created_at },
      primeiro,
      ultimo,
      agora,
      limites
    );

    if (
      (etapa === "elegivel_primeiro" || etapa === "elegivel_ultimo") &&
      comprouPorOutroPedido(pagos, {
        criadoEm: linha.created_at,
        telefone: cliente?.phone ?? null,
        email: cliente?.email ?? null,
      })
    ) {
      etapa = "nao_elegivel";
      motivoNaoElegivel = "cliente já pagou em outro checkout";
    }

    switch (etapa) {
      case "aguardando_janela":
        resumo.aguardandoJanela += 1;
        break;
      case "elegivel_primeiro":
      case "elegivel_ultimo":
        resumo.elegiveis += 1;
        break;
      case "primeiro_enviado":
        resumo.primeiroEnviado += 1;
        break;
      case "ultimo_enviado":
        resumo.ultimoEnviado += 1;
        break;
      case "primeiro_recusado":
      case "ultimo_recusado":
        resumo.recusadosDeVerdade += 1;
        break;
      case "fora_da_janela":
      case "nao_elegivel":
        resumo.foraDaJanelaOuNaoElegivel += 1;
        break;
    }

    return {
      id: linha.id,
      orderNumber: linha.order_number,
      criadoEm: linha.created_at,
      cliente: cliente?.full_name?.trim() || "Cliente sem nome",
      telefone: cliente?.phone ?? null,
      email: cliente?.email ?? null,
      totalCents: linha.total_cents,
      currency: linha.currency,
      etapa,
      motivoNaoElegivel,
      primeiro,
      ultimo,
    };
  });

  return { pedidos, resumo, erro: false };
}

/**
 * Config do canal, para a tela avisar ANTES de alguém estranhar "por que
 * ninguém recebeu aviso". Só leitura de env — nunca imprime valor de
 * segredo (mesma regra de `exigir()` em whatsapp.ts).
 */
export interface ConfigRecuperacao {
  /** Mesma função que o cron usa — inclui o rebaixamento automático para
   *  "simulado" fora de produção (ver modoWhatsApp() em whatsapp.ts). */
  modo: ModoWhatsApp;
  templatePrimeiroConfigurado: boolean;
  templateUltimoConfigurado: boolean;
}

export function lerConfigRecuperacao(): ConfigRecuperacao {
  return {
    modo: modoWhatsApp(),
    templatePrimeiroConfigurado: Boolean(
      (process.env.CLINT_TEMPLATE_CARRINHO_PRIMEIRO_ID ?? "").trim()
    ),
    templateUltimoConfigurado: Boolean(
      (process.env.CLINT_TEMPLATE_CARRINHO_ULTIMO_ID ?? "").trim()
    ),
  };
}
