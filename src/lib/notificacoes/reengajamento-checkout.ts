/**
 * Reengajamento ÚNICO dos checkouts parados (18/09/2026).
 *
 * ===========================================================================
 * POR QUE EXISTE
 * ===========================================================================
 * Até 18/09 a tela de pagamento da InfinitePay pedia o endereço de novo, em
 * branco, depois de o cliente ter preenchido tudo no site. Resultado no
 * painel naquele dia: 89 pedidos, 3 pagos. Corrigido o checkout, o Francisco
 * decidiu mandar UMA mensagem a quem parou ali, dizendo que o pagamento
 * ficou mais simples.
 *
 * Não é um terceiro lembrete do cron, e por isso mora fora dele: roda só
 * quando alguém clica no painel, com prévia antes, e usa um kind próprio
 * (`checkout_reengajamento`, migration 27) cujo unique por pedido garante
 * que ninguém recebe esta mensagem duas vezes.
 *
 * Herdadas do cron, de propósito: reserva antes do envio, releitura do
 * pedido antes de reservar, "comprou por outro checkout" por telefone e
 * e-mail, horário comercial, DDI obrigatório, template fixo sem variável.
 *
 * Próprias daqui:
 *   - UMA pessoa = UM envio, contado pelo telefone em TODOS os pedidos dela
 *     (a mesma pessoa tem até 4 checkouts na lista);
 *   - pedidos de teste da equipe ficam de fora (nome com "teste",
 *     telefones de mentira, o número antigo da loja);
 *   - teto por clique, porque a conta tem caso de spam aberto desde 29/08 e
 *     volume é risco.
 */

import { comDDI, dentroDoHorario, limitesDoAmbiente } from "./carrinho-regra";
import { comprouPorOutroPedido } from "./carrinho-abandonado";
import { enviarWhatsApp, modoWhatsApp } from "./whatsapp";
import { WHATSAPP_REVERA } from "@/lib/config/whatsapp";
import type { createAdminClient } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof createAdminClient>;

export const KIND_REENGAJAMENTO = "checkout_reengajamento";
/** Quem abandonou antes disto não viveu o problema recente o bastante. */
export const JANELA_DIAS_REENGAJAMENTO = 10;
/** Por clique. Cada clique reconfere tudo, então clicar de novo continua a fila. */
export const MAX_POR_CLIQUE = 20;

/**
 * Mesmo texto do modelo cadastrado na Clint. Serve de corpo no modo simulado
 * e de referência para quem conferir o que foi aprovado.
 */
export const TEXTO_REENGAJAMENTO =
  "Seu pedido na Reverá foi registrado e está aguardando o pagamento para ser confirmado. Para concluir, é só responder esta mensagem.";

/**
 * O WhatsApp da própria Reverá nunca é cliente: a equipe usou esse número em
 * checkouts de teste (a "Ketlin" de 16 a 18/09). Lido da config, e não
 * escrito aqui, porque o número já trocou duas vezes. Só dígitos, sem DDI.
 */
const TELEFONES_DA_CASA = new Set([WHATSAPP_REVERA.replace(/^55/, "")]);

export function pareceTeste(nome: string | null | undefined, telefone: string | null | undefined): boolean {
  const n = (nome ?? "").toLowerCase();
  if (/\bteste\b|\bauditoria\b|\bsmoke\b|\bhandle\b/.test(n)) return true;
  const digitos = (telefone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (TELEFONES_DA_CASA.has(digitos)) return true;
  // 11999999999, 11900000000, 11999990000… — sequência de 9 ou de 0 depois do DDD.
  if (/^\d{2}9(9{4}|0{4})\d{4}$/.test(digitos)) return true;
  return false;
}

export interface LinhaReengajamento {
  id: string;
  codigo: string;
  criadoEm: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
}

export type MotivoFora = "teste" | "sem_telefone" | "outro_pedido_da_mesma_pessoa" | "ja_recebeu";

/**
 * Uma pessoa por telefone, o pedido MAIS RECENTE dela. Puro, para teste.
 * `linhas` chega do mais novo para o mais velho.
 */
export function escolherDestinatarios(
  linhas: LinhaReengajamento[],
  telefonesJaAvisados: Set<string>,
  emailsDaCasa: Set<string> = new Set()
): {
  escolhidos: Array<LinhaReengajamento & { destino: string }>;
  fora: Array<{ linha: LinhaReengajamento; motivo: MotivoFora }>;
} {
  const escolhidos: Array<LinhaReengajamento & { destino: string }> = [];
  const fora: Array<{ linha: LinhaReengajamento; motivo: MotivoFora }> = [];
  const vistos = new Set<string>();

  for (const linha of linhas) {
    if (
      pareceTeste(linha.nome, linha.telefone) ||
      emailsDaCasa.has((linha.email ?? "").trim().toLowerCase())
    ) {
      fora.push({ linha, motivo: "teste" });
      continue;
    }
    const destino = comDDI(linha.telefone);
    if (!destino) {
      fora.push({ linha, motivo: "sem_telefone" });
      continue;
    }
    if (telefonesJaAvisados.has(destino)) {
      fora.push({ linha, motivo: "ja_recebeu" });
      continue;
    }
    if (vistos.has(destino)) {
      fora.push({ linha, motivo: "outro_pedido_da_mesma_pessoa" });
      continue;
    }
    vistos.add(destino);
    escolhidos.push({ ...linha, destino });
  }
  return { escolhidos, fora };
}

type Leitura =
  | { erro: string }
  | {
      escolhidos: Array<LinhaReengajamento & { destino: string }>;
      fora: Array<{ linha: LinhaReengajamento; motivo: MotivoFora }>;
    };

/** Pendentes em BRL dos últimos dias, menos quem já recebeu esta mensagem. */
export async function lerFilaDeReengajamento(supabase: Supabase, agora: Date): Promise<Leitura> {
  const desde = new Date(agora.getTime() - JANELA_DIAS_REENGAJAMENTO * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, created_at, customers ( phone, email, full_name )")
    .eq("payment_status", "pending")
    .is("canceled_at", null)
    .gte("created_at", desde)
    .or("currency.eq.BRL,currency.is.null")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return { erro: "não deu para ler os pedidos pendentes" };

  // Quem já recebeu — por TELEFONE, em qualquer pedido, não só no pedido.
  const { data: avisos, error: erroAvisos } = await supabase
    .from("order_notifications")
    .select("order_id")
    .eq("kind", KIND_REENGAJAMENTO);
  if (erroAvisos || !avisos) return { erro: "não deu para ler quem já recebeu" };

  const telefonesJaAvisados = new Set<string>();
  const idsAvisados = (avisos as Array<{ order_id: string }>).map((a) => a.order_id);
  if (idsAvisados.length > 0) {
    const { data: pedidosAvisados, error: erroPedidos } = await supabase
      .from("orders")
      .select("id, customers ( phone )")
      .in("id", idsAvisados);
    if (erroPedidos || !pedidosAvisados) return { erro: "não deu para ler quem já recebeu" };
    for (const p of pedidosAvisados as Array<{ customers: unknown }>) {
      const destino = comDDI(clienteDe(p.customers)?.phone);
      if (destino) telefonesJaAvisados.add(destino);
    }
  }

  const linhas: LinhaReengajamento[] = (data as Array<{
    id: string;
    order_number: string | null;
    created_at: string;
    customers: unknown;
  }>).map((l) => {
    const c = clienteDe(l.customers);
    return {
      id: l.id,
      codigo: l.order_number ?? l.id.slice(0, 8),
      criadoEm: l.created_at,
      nome: c?.full_name ?? null,
      telefone: c?.phone ?? null,
      email: c?.email ?? null,
    };
  });

  // Os administradores da loja fazem checkout de teste com o próprio
  // e-mail (o Francisco tinha 5 pedidos assim na fila de 18/09, com nomes
  // diferentes). Lido de admin_users + auth, e não escrito aqui.
  const emailsDaCasa = await emailsDosAdministradores(supabase);
  if (!emailsDaCasa) return { erro: "não deu para ler os administradores" };

  return escolherDestinatarios(linhas, telefonesJaAvisados, emailsDaCasa);
}

async function emailsDosAdministradores(supabase: Supabase): Promise<Set<string> | null> {
  const { data, error } = await supabase.from("admin_users").select("id");
  if (error || !data) return null;
  const emails = new Set<string>();
  for (const { id } of data as Array<{ id: string }>) {
    const { data: u, error: erroUser } = await supabase.auth.admin.getUserById(id);
    if (erroUser) return null;
    const email = (u.user?.email ?? "").trim().toLowerCase();
    if (email) emails.add(email);
  }
  return emails;
}

function clienteDe(
  c: unknown
): { phone?: string | null; email?: string | null; full_name?: string | null } | null {
  const v = Array.isArray(c) ? c[0] : c;
  return (v as { phone?: string | null; email?: string | null; full_name?: string | null }) ?? null;
}

export interface ResultadoEnvioReengajamento {
  enviados: number;
  pulados: Record<string, number>;
  restantes: number;
  erro?: string;
}

/**
 * Manda para até MAX_POR_CLIQUE pessoas. Nunca lança.
 * `template` é o UUID do modelo aprovado na Clint.
 */
export async function enviarReengajamento(
  supabase: Supabase,
  agora: Date,
  template: string
): Promise<ResultadoEnvioReengajamento> {
  const pulados: Record<string, number> = {};
  const conta = (m: string) => (pulados[m] = (pulados[m] ?? 0) + 1);
  const falha = (erro: string): ResultadoEnvioReengajamento => ({ enviados: 0, pulados, restantes: 0, erro });

  try {
    const modo = modoWhatsApp();
    if (modo !== "clint" && modo !== "simulado") {
      return falha(`WhatsApp em modo "${modo}" — este envio só funciona pela Clint.`);
    }
    if (modo === "clint" && !template) {
      return falha("Falta o modelo aprovado: configure CLINT_TEMPLATE_REENGAJAMENTO_ID na Vercel.");
    }
    if (!dentroDoHorario(agora, limitesDoAmbiente())) {
      return falha("Fora do horário de atendimento (9h às 20h, horário de Brasília).");
    }

    const fila = await lerFilaDeReengajamento(supabase, agora);
    if ("erro" in fila) return falha(fila.erro);

    let enviados = 0;
    let tentados = 0;
    for (const pessoa of fila.escolhidos) {
      if (tentados >= MAX_POR_CLIQUE) break;

      // Pode ter pago entre a leitura e agora.
      const { data: atual } = await supabase
        .from("orders")
        .select("payment_status, canceled_at")
        .eq("id", pessoa.id)
        .maybeSingle();
      if (!atual || atual.payment_status !== "pending" || atual.canceled_at) {
        conta("mudou_de_estado");
        continue;
      }
      if (
        await comprouPorOutroPedido(supabase, {
          id: pessoa.id,
          criadoEm: pessoa.criadoEm,
          telefone: pessoa.telefone,
          email: pessoa.email,
          moeda: "BRL",
        })
      ) {
        conta("comprou_em_outro_pedido");
        continue;
      }

      const { error: erroReserva } = await supabase
        .from("order_notifications")
        .insert({ order_id: pessoa.id, kind: KIND_REENGAJAMENTO, channel: "whatsapp" });
      if (erroReserva) {
        // 23505 = alguém já reservou; qualquer outro erro (migration 27 não
        // aplicada) também para, sem enviar — sem registro não há dedupe.
        if (erroReserva.code !== "23505") {
          return { enviados, pulados, restantes: 0, erro: `Reserva recusada pelo banco: ${erroReserva.message}` };
        }
        conta("ja_reservado");
        continue;
      }
      tentados += 1;

      const envio = await enviarWhatsApp({
        para: pessoa.destino,
        nomeDoContato: (pessoa.nome ?? "").trim() || "Cliente Reverá",
        texto: TEXTO_REENGAJAMENTO,
        parametros: [],
        template,
      });

      if (envio.estado === "enviado") {
        enviados += 1;
        const { error: erroBaixa } = await supabase
          .from("order_notifications")
          .update({ sent_at: new Date().toISOString(), provider_message_id: envio.providerMessageId, last_error: null })
          .eq("order_id", pessoa.id)
          .eq("kind", KIND_REENGAJAMENTO);
        if (erroBaixa) {
          return { enviados, pulados, restantes: 0, erro: "Enviado, mas não deu para anotar. Parei por segurança." };
        }
        continue;
      }

      // A reserva fica, com o motivo: retentar em laço é pagar duas vezes pelo mesmo erro.
      const motivo = envio.estado === "desligado" ? "whatsapp desligado" : envio.motivo;
      await supabase
        .from("order_notifications")
        .update({ last_error: motivo })
        .eq("order_id", pessoa.id)
        .eq("kind", KIND_REENGAJAMENTO);
      conta("envio_recusado");
    }

    const restantes = Math.max(0, fila.escolhidos.length - tentados - Object.values(pulados).reduce((a, b) => a + b, 0));
    return { enviados, pulados, restantes };
  } catch (e) {
    console.error("[reengajamento] exceção", e);
    return falha("Erro inesperado — nada além do que já foi contado saiu.");
  }
}
