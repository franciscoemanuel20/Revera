/**
 * "Você deixou o carrinho" — o toque em quem chegou ao checkout e não pagou.
 *
 * ===========================================================================
 * O QUE ISTO COPIA DO FLUXO DA HOTMART, E O QUE MUDA (05/09/2026)
 * ===========================================================================
 * Lá quem avisa que o carrinho ficou para trás é a própria Hotmart: ela
 * dispara `PURCHASE_OUT_OF_SHOPPING_CART` e o agente responde com um
 * template. Aqui não existe quem dispare — a loja é nossa —, então o gatilho
 * é um cron que varre `orders` pendentes.
 *
 * O resto é igual de propósito, porque foi o que se provou em produção:
 *   - template aprovado, fixo, sem variável (mapear variável na Clint é o
 *     passo que mais falhou em silêncio neste projeto);
 *   - reserva ANTES do envio, para reentrega não virar mensagem dobrada;
 *   - teto por rodada e por dia, para um bug não virar disparo em massa;
 *   - registro do motivo quando não sai, para "não avisamos" e "tentaram e
 *     recusaram" não se confundirem.
 *
 * ===========================================================================
 * ISTO É MARKETING, E ISSO TEM CONSEQUÊNCIA
 * ===========================================================================
 * Não existe transação acordada num carrinho abandonado, então a Meta
 * classifica como marketing — e marketing passa pelo limite de mensagens por
 * usuário, que barra parte dos envios com o erro 131049. Metade dos envios
 * internacionais do fluxo equivalente da Hotmart não chega por isso. É o
 * custo conhecido, não um defeito a caçar depois.
 *
 * Por isso os tetos são baixos e a janela é curta: numa conta com caso de
 * "Sending spam" aberto desde 29/08/2026, volume é risco, não oportunidade.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { enviarWhatsApp, modoWhatsApp } from "./whatsapp";
import {
  decidir,
  dentroDoHorario,
  limitesDoAmbiente,
  type MotivoPulo,
  type PedidoCandidato,
} from "./carrinho-regra";

const KIND = "carrinho_abandonado";

export interface ResultadoRodada {
  executou: boolean;
  motivo?: string;
  vistos: number;
  enviados: number;
  pulados: Partial<Record<MotivoPulo | "reserva_recusada" | "envio_recusado", number>>;
}

function templateDoCarrinho(): string {
  return (process.env.CLINT_TEMPLATE_CARRINHO_ID ?? "").trim();
}

/**
 * Uma rodada. Nunca lança: quem chama é uma rota de cron, e cron que devolve
 * 500 é reexecutado — num fluxo que paga por mensagem, o caminho mais curto
 * para pagar duas vezes.
 */
export async function rodadaDeCarrinhoAbandonado(
  agora: Date = new Date()
): Promise<ResultadoRodada> {
  const vazio: ResultadoRodada = { executou: false, vistos: 0, enviados: 0, pulados: {} };
  try {
    const modo = modoWhatsApp();
    if (modo === "desligado") return { ...vazio, motivo: "whatsapp desligado" };

    const template = templateDoCarrinho();
    if (modo === "clint" && !template) {
      // Mesma trava do aviso de contato: sem template próprio o envio cairia
      // no `CLINT_TEMPLATE_ID`, que é o aviso INTERNO de venda paga — o
      // cliente receberia "nova venda, abra o painel".
      return { ...vazio, motivo: "CLINT_TEMPLATE_CARRINHO_ID não definida" };
    }

    const limites = limitesDoAmbiente();
    if (!dentroDoHorario(agora, limites)) {
      return { ...vazio, motivo: "fora do horário de atendimento" };
    }

    const supabase = createAdminClient();

    const desdeDia = new Date(agora.getTime());
    desdeDia.setUTCHours(0, 0, 0, 0);
    const { count: hoje } = await supabase
      .from("order_notifications")
      .select("id", { count: "exact", head: true })
      .eq("kind", KIND)
      .not("sent_at", "is", null)
      .gte("sent_at", desdeDia.toISOString());

    if ((hoje ?? 0) >= limites.maxPorDia) {
      return { ...vazio, motivo: "teto diário atingido" };
    }

    const candidatos = await lerCandidatos(supabase, agora, limites.janelaHoras);
    const resultado: ResultadoRodada = { executou: true, vistos: candidatos.length, enviados: 0, pulados: {} };
    const conta = (m: keyof ResultadoRodada["pulados"]) => {
      resultado.pulados[m] = (resultado.pulados[m] ?? 0) + 1;
    };

    for (const pedido of candidatos) {
      if (resultado.enviados >= limites.maxPorRodada) break;
      if ((hoje ?? 0) + resultado.enviados >= limites.maxPorDia) break;

      const decisao = decidir(pedido, agora, limites);
      if (!decisao.enviar) {
        conta(decisao.motivo);
        continue;
      }

      // Reserva primeiro. Se duas rodadas se cruzarem (o cron pode atrasar e
      // sobrepor), quem perder o INSERT sabe disso antes de gastar mensagem.
      const { error: erroReserva } = await supabase
        .from("order_notifications")
        .insert({ order_id: pedido.id, kind: KIND, channel: "whatsapp" });

      if (erroReserva) {
        // 23505 = já reservado. Qualquer outro erro (inclusive o CHECK antigo,
        // enquanto a migration 15 não roda) também PARA o envio: sem registro
        // não há como saber que já mandamos, e sem isso o próximo cron manda
        // de novo. Falhar sem enviar é o lado seguro.
        if (erroReserva.code !== "23505") {
          console.error("[carrinho] reserva recusada", erroReserva.message);
        }
        conta("reserva_recusada");
        continue;
      }

      const envio = await enviarWhatsApp({
        para: (pedido.telefone ?? "").replace(/\D/g, ""),
        texto: "Você começou uma compra na Reverá e não finalizou. Posso ajudar?",
        parametros: [],
        template,
      });

      if (envio.estado === "enviado") {
        await supabase
          .from("order_notifications")
          .update({
            sent_at: new Date().toISOString(),
            provider_message_id: envio.providerMessageId,
            last_error: null,
          })
          .eq("order_id", pedido.id)
          .eq("kind", KIND);
        resultado.enviados += 1;
        continue;
      }

      // A reserva FICA, com sent_at nulo e o motivo gravado. Não se tenta de
      // novo: um template recusado hoje é recusado daqui a uma hora, e
      // retentar em laço é como se paga duas vezes pelo mesmo erro.
      const motivo = envio.estado === "erro" ? envio.motivo : "whatsapp desligado";
      await supabase
        .from("order_notifications")
        .update({ last_error: motivo })
        .eq("order_id", pedido.id)
        .eq("kind", KIND);
      conta("envio_recusado");
    }

    return resultado;
  } catch (erro) {
    console.error("[carrinho] exceção na rodada", erro);
    return { ...vazio, motivo: "exceção na rodada" };
  }
}

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * Pendentes ainda dentro da janela, sem aviso reservado, do mais novo para o
 * mais velho — quem abandonou há pouco é quem ainda lembra do carrinho.
 */
async function lerCandidatos(
  supabase: Supabase,
  agora: Date,
  janelaHoras: number
): Promise<PedidoCandidato[]> {
  const limite = new Date(agora.getTime() - janelaHoras * 3600_000).toISOString();

  const { data: jaAvisados } = await supabase
    .from("order_notifications")
    .select("order_id")
    .eq("kind", KIND);
  const avisados = new Set((jaAvisados ?? []).map((l: { order_id: string }) => l.order_id));

  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, currency, customers ( phone )")
    .eq("payment_status", "pending")
    .gte("created_at", limite)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[carrinho] falha ao ler candidatos", error.message);
    return [];
  }

  type Linha = {
    id: string;
    created_at: string;
    currency: string | null;
    customers: { phone: string | null } | { phone: string | null }[] | null;
  };

  return (data ?? [])
    .filter((linha: Linha) => !avisados.has(linha.id))
    .map((linha: Linha) => {
      const cliente = Array.isArray(linha.customers) ? linha.customers[0] : linha.customers;
      return {
        id: linha.id,
        criadoEm: linha.created_at,
        telefone: cliente?.phone ?? null,
        moeda: linha.currency,
      };
    });
}
