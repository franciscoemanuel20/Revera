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
  comDDI,
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
  pulados: Partial<
    Record<MotivoPulo | "reserva_recusada" | "envio_recusado" | "mudou_de_estado", number>
  >;
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

    // O modo `meta` NÃO serve para este fluxo, e o motivo é grave o bastante
    // para valer uma recusa explícita: `enviarWhatsApp` ignora
    // `mensagem.template` no caminho da Cloud API e usa sempre
    // `WHATSAPP_TEMPLATE_NOME`, que é o aviso INTERNO de venda paga, com sete
    // parâmetros. Este fluxo manda zero. Ou a Meta recusa a entrega, ou —
    // se o template for fixo — o CLIENTE recebe "nova venda, abra o painel".
    // Achado do Codex em 05/09/2026. Quando existir template Meta próprio,
    // esta trava sai junto com a implementação.
    if (modo === "meta") {
      return { ...vazio, motivo: "modo meta não suportado neste fluxo" };
    }

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
    /**
     * O teto conta RESERVAS do dia, não mensagens confirmadas.
     *
     * Achado do Codex em 05/09/2026: se a Clint aceita a mensagem e o UPDATE
     * de `sent_at` falha depois (ou o processo morre no meio), a linha fica
     * com `sent_at` nulo. Contando só as confirmadas, aquele envio PAGO
     * desapareceria da cota e o dia poderia estourar o teto.
     *
     * Reserva é o momento em que assumimos o custo; é ela que deve pesar no
     * orçamento. O erro para o lado seguro: uma reserva que não virou envio
     * consome uma vaga do dia, o que custa um toque a menos, não dinheiro a
     * mais.
     *
     * `count` vem NULO quando a consulta falha, e o supabase-js não lança.
     * Ler nulo como zero liberaria o dia inteiro justamente quando não dá
     * para saber quanto já foi gasto. Falha fechada.
     */
    const { count: hoje, error: erroConta } = await supabase
      .from("order_notifications")
      .select("id", { count: "exact", head: true })
      .eq("kind", KIND)
      .gte("created_at", desdeDia.toISOString());

    if (erroConta || hoje === null) {
      console.error("[carrinho] não deu para contar o dia — rodada abortada", erroConta?.message);
      return { ...vazio, motivo: "contagem do dia indisponível" };
    }

    if (hoje >= limites.maxPorDia) {
      return { ...vazio, motivo: "teto diário atingido" };
    }

    const candidatos = await lerCandidatos(
      supabase,
      agora,
      limites.janelaHoras,
      limites.esperaMinutos
    );
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

      const destino = comDDI(pedido.telefone);
      if (!destino) {
        conta("sem_telefone");
        continue;
      }

      // Reconfere o teto do dia IMEDIATAMENTE antes de reservar, e não só no
      // começo da rodada. Duas rodadas sobrepostas (o cron pode atrasar)
      // leriam a mesma contagem no início e cada uma gastaria seu saldo
      // achando que era o mesmo — 19 enviados viram 21. Reler aqui não é
      // um lock, mas encolhe a janela de segundos para milissegundos, que é
      // a mesma escolha feita na recuperação de lead frio do agente.
      const { count: agoraHoje, error: erroRecontagem } = await supabase
        .from("order_notifications")
        .select("id", { count: "exact", head: true })
        .eq("kind", KIND)
        .gte("created_at", desdeDia.toISOString());
      if (erroRecontagem || agoraHoje === null || agoraHoje >= limites.maxPorDia) break;

      /**
       * Relê o pedido imediatamente antes de reservar.
       *
       * A lista de candidatos é montada de uma vez, e depois cada envio passa
       * por idas ao banco e à Clint. Nesse intervalo o cliente pode ter
       * PAGO — e aí ele receberia "você não finalizou" logo depois de pagar,
       * que é pior que não mandar nada. A reserva por unique protege contra
       * mandar duas vezes, não contra mandar para quem já pagou.
       */
      const { data: atual } = await supabase
        .from("orders")
        .select("payment_status, canceled_at")
        .eq("id", pedido.id)
        .maybeSingle();

      if (!atual || atual.payment_status !== "pending" || atual.canceled_at) {
        conta("mudou_de_estado");
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
        // Com DDI, sempre. Sem isso a Clint cria um contato novo com o número
        // incompleto e a mensagem paga vai para quem não é o cliente.
        para: destino,
        texto: "Você começou uma compra na Reverá e não finalizou. Posso ajudar?",
        parametros: [],
        template,
      });

      if (envio.estado === "enviado") {
        const { error: erroBaixa } = await supabase
          .from("order_notifications")
          .update({
            sent_at: new Date().toISOString(),
            provider_message_id: envio.providerMessageId,
            last_error: null,
          })
          .eq("order_id", pedido.id)
          .eq("kind", KIND);

        resultado.enviados += 1;

        // A mensagem JÁ foi paga; o que falhou foi anotar. Como o teto conta
        // reservas, a cota continua correta — mas parar a rodada aqui evita
        // insistir contra um banco que acabou de recusar uma escrita.
        if (erroBaixa) {
          console.error("[carrinho] enviado mas não anotado", erroBaixa.message);
          break;
        }
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
  janelaHoras: number,
  esperaMinutos: number
): Promise<PedidoCandidato[]> {
  const limite = new Date(agora.getTime() - janelaHoras * 3600_000).toISOString();

  /**
   * Os já avisados são lidos SÓ DA JANELA, não do histórico inteiro.
   *
   * Achado do Codex em 05/09/2026: a lista vai serializada na URL do
   * Supabase. Crescendo o histórico, a URL estoura o limite de tamanho da
   * requisição, a consulta passa a falhar e o fluxo para de mandar — calado,
   * que é o pior jeito de parar. Além disso a leitura tem limite de linhas
   * própria, então "histórico inteiro" nunca foi verdade de verdade.
   *
   * Só a janela basta porque só pedidos da janela são candidatos: um aviso de
   * três meses atrás não muda nada aqui. A lista fica do tamanho do que a
   * loja abandona em 48h.
   */
  const { data: jaAvisados } = await supabase
    .from("order_notifications")
    .select("order_id")
    .eq("kind", KIND)
    .gte("created_at", limite);
  const avisados = (jaAvisados ?? []).map((l: { order_id: string }) => l.order_id);

  /**
   * A exclusão dos já avisados vai NO BANCO, antes do `limit` — não depois.
   *
   * Achado do Codex em 05/09/2026: filtrar em memória depois de pedir "os 50
   * mais recentes" faz os já avisados ocuparem as vagas. Passados 50 pedidos
   * na janela, os elegíveis mais antigos nunca mais apareceriam, e sairiam da
   * janela de 48h sem nunca terem sido tocados — uma fila que envelhece
   * calada, que é o pior tipo de bug: não dá erro, só deixa de vender.
   *
   * O `limit` continua existindo para o caso de a loja crescer: ele protege
   * a memória do processo, não a regra.
   */
  /**
   * Os filtros de elegibilidade vão para o BANCO, antes do limite.
   *
   * Segundo achado do Codex na mesma linha: 50 pedidos em dólar mais recentes
   * ocupariam o lote inteiro e um pedido elegível mais antigo nunca seria
   * alcançado — e, ao contrário dos já avisados, esses nunca ganham reserva,
   * então ocupariam a vaga em toda rodada até expirarem.
   *
   * `currency` pode ser nula em pedido antigo, e `decidir` trata nula como
   * BRL; a consulta precisa concordar com ela, senão some pedido válido.
   */
  const maduroAte = new Date(agora.getTime() - esperaMinutos * 60_000).toISOString();

  let consulta = supabase
    .from("orders")
    .select("id, created_at, currency, customers ( phone )")
    .eq("payment_status", "pending")
    // Cancelar NÃO mexe em payment_status: a action do painel grava só
    // `canceled_at` (admin/pedidos/actions.ts). Sem este filtro, um pedido
    // que a equipe cancelou de propósito receberia "você não finalizou".
    .is("canceled_at", null)
    .gte("created_at", limite)
    .lte("created_at", maduroAte)
    .or("currency.eq.BRL,currency.is.null");

  if (avisados.length > 0) {
    consulta = consulta.not("id", "in", `(${avisados.join(",")})`);
  }

  const { data, error } = await consulta
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

  const jaVistos = new Set(avisados);
  return (data ?? [])
    // Cinto e suspensório: se a exclusão no banco falhar por qualquer motivo,
    // a reserva por unique ainda pega — mas melhor não gastar a ida.
    .filter((linha: Linha) => !jaVistos.has(linha.id))
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
