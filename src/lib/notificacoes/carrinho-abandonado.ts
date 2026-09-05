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
    Record<
      | MotivoPulo
      | "reserva_recusada"
      | "envio_recusado"
      | "mudou_de_estado"
      | "comprou_em_outro_pedido"
      | "mesma_pessoa_nesta_rodada",
      number
    >
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

    const leitura = await lerCandidatos(
      supabase,
      agora,
      limites.janelaHoras,
      limites.esperaMinutos,
      limites.maxPorRodada
    );
    if (leitura.erro) {
      return { ...vazio, motivo: "não deu para montar a fila com segurança" };
    }
    const candidatos = leitura.candidatos;
    const resultado: ResultadoRodada = { executou: true, vistos: candidatos.length, enviados: 0, pulados: {} };
    const conta = (m: keyof ResultadoRodada["pulados"]) => {
      resultado.pulados[m] = (resultado.pulados[m] ?? 0) + 1;
    };

    /**
     * Conta RESERVAS, não sucessos — mesma razão do teto diário.
     *
     * Achado do Codex em 05/09/2026: com `resultado.enviados`, uma Clint
     * recusando tudo (ou respostas perdidas depois de aceitas) não fazia o
     * contador subir, e a rodada seguia tentando candidato após candidato
     * até esgotar sozinha o orçamento do DIA inteiro numa única execução.
     * Cada reserva é um custo possivelmente já assumido.
     */
    let reservados = 0;
    // A mesma pessoa pode ter vários pedidos elegíveis NESTA lista; a leitura
    // do banco só conhece os avisos de rodadas anteriores.
    const telefonesDaRodada = new Set<string>();

    for (const pedido of candidatos) {
      if (reservados >= limites.maxPorRodada) break;
      if (hoje + reservados >= limites.maxPorDia) break;

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

      if (telefonesDaRodada.has(destino)) {
        conta("mesma_pessoa_nesta_rodada");
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

      /**
       * A MESMA PESSOA pode ter comprado por OUTRO checkout.
       *
       * Achado do Codex em 05/09/2026, e o cenário é comum: o pagamento falha,
       * a pessoa refaz o checkout do zero e paga. `checkout/actions.ts` cria
       * um `customers` NOVO a cada vez (linha 123), com id novo — então o
       * pedido abandonado continua `pending`, ligado a outro customer_id, e
       * comparar ids não resolveria. É por isso que a chave aqui é telefone e
       * e-mail, que são estáveis entre checkouts.
       *
       * Sinal de que isso já acontece nesta loja: entre os 7 pendentes há
       * valores repetidos (R$ 3.164,46 duas vezes em 29/08).
       *
       * Só compra POSTERIOR conta. Quem comprou antes e abandonou outro
       * carrinho depois é um abandono de verdade.
       */
      if (await comprouPorOutroPedido(supabase, pedido)) {
        conta("comprou_em_outro_pedido");
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

      reservados += 1;
      telefonesDaRodada.add(destino);

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
 * Existe pedido PAGO da mesma pessoa depois deste? Telefone e e-mail são as
 * chaves porque o customer_id muda a cada checkout.
 *
 * Usa `customers.email`, e não `email_normalizado`. As duas colunas existem no
 * banco de produção, mas só `email` está nas migrations deste repositório —
 * apontar para a coluna não versionada faria a consulta falhar em qualquer
 * ambiente recriado do repo, e `lerCandidatos` devolveria lista vazia: o
 * fluxo pararia calado, sem erro visível. Comparar `email` cru é seguro
 * porque o checkout já grava em minúsculas (`checkout/schema.ts`).
 *
 * Na dúvida (erro de consulta) devolve `true`: não mandar é o erro barato.
 */
async function comprouPorOutroPedido(
  supabase: Supabase,
  pedido: PedidoCandidato
): Promise<boolean> {
  const telefone = (pedido.telefone ?? "").replace(/\D/g, "");
  const email = (pedido.email ?? "").trim().toLowerCase();
  if (!telefone && !email) return false;

  try {
    for (const [coluna, valor] of [
      ["phone", telefone],
      ["email", email],
    ] as const) {
      if (!valor) continue;
      const { data, error } = await supabase
        .from("orders")
        .select("id, customers!inner ( id )")
        .eq("payment_status", "paid")
        .eq(`customers.${coluna}`, valor)
        // `updated_at`, e não `created_at`: é ele que a confirmação de
        // pagamento carimba (payments/confirmar.ts:202). Comparar pela
        // CRIAÇÃO do pedido pago erra o caso em que a pessoa abre o checkout
        // A, abre o B, volta ao A e paga — A nasceu antes de B, então ao
        // avaliar B o pagamento de A passaria despercebido e ela receberia
        // "você não finalizou" já tendo comprado.
        //
        // Outros updates no pedido pago (etiqueta, envio) também mexem em
        // `updated_at`. Isso só torna o filtro mais conservador: suprime um
        // toque a mais, nunca manda um a mais.
        .gte("updated_at", pedido.criadoEm)
        .limit(1);
      if (error) return true;
      if ((data ?? []).length > 0) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Pendentes ainda dentro da janela, sem aviso reservado, do mais novo para o
 * mais velho — quem abandonou há pouco é quem ainda lembra do carrinho.
 */
async function lerCandidatos(
  supabase: Supabase,
  agora: Date,
  janelaHoras: number,
  esperaMinutos: number,
  quantosBastam: number
): Promise<{ erro: true } | { erro: false; candidatos: PedidoCandidato[] }> {
  const limite = new Date(agora.getTime() - janelaHoras * 3600_000).toISOString();
  const maduroAte = new Date(agora.getTime() - esperaMinutos * 60_000).toISOString();

  const { data: jaAvisados, error: erroAvisados } = await supabase
    .from("order_notifications")
    .select("order_id")
    .eq("kind", KIND)
    .gte("created_at", limite);

  /**
   * Histórico ilegível ABORTA a rodada.
   *
   * Achado do Codex em 05/09/2026: tratar a falha como "ninguém foi avisado"
   * desliga a dedupe justamente quando não dá para saber o que já saiu — e
   * a constraint `(order_id, kind)` não protege a PESSOA, só o pedido. O
   * resultado seria mensagem paga repetida para quem já recebeu.
   */
  if (erroAvisados || !jaAvisados) {
    console.error("[carrinho] histórico de avisos ilegível", erroAvisados?.message);
    return { erro: true };
  }

  const avisados = jaAvisados.map((l: { order_id: string }) => l.order_id);

  const telefonesAvisados = new Set<string>();
  if (avisados.length > 0) {
    const { data: pedidosAvisados, error: erroPedidos } = await supabase
      .from("orders")
      .select("customers ( phone )")
      .in("id", avisados);

    if (erroPedidos || !pedidosAvisados) {
      console.error("[carrinho] telefones já avisados ilegíveis", erroPedidos?.message);
      return { erro: true };
    }

    for (const linha of pedidosAvisados) {
      const c = (linha as { customers: { phone: string | null } | { phone: string | null }[] | null })
        .customers;
      const cliente = Array.isArray(c) ? c[0] : c;
      const digitos = (cliente?.phone ?? "").replace(/\D/g, "");
      if (digitos) telefonesAvisados.add(digitos);
    }
  }

  type Linha = {
    id: string;
    created_at: string;
    currency: string | null;
    customers:
      | { phone: string | null; email: string | null }
      | { phone: string | null; email: string | null }[]
      | null;
  };

  /**
   * PAGINA em vez de olhar só os 50 mais recentes.
   *
   * Achado do Codex: se os 50 primeiros forem todos de gente já avisada por
   * outro pedido, o filtro os remove DEPOIS do limite e ninguém sobra — e
   * como esses pedidos nunca ganham reserva, toda rodada seguinte traz os
   * mesmos 50 e os elegíveis mais antigos morrem de velhice dentro da janela.
   *
   * Para de paginar quando junta candidatos suficientes (com folga sobre o
   * teto da rodada, porque exclusões caras — "já comprou por outro checkout" —
   * só acontecem depois, no laço) ou quando a janela acaba. O teto de páginas
   * existe para uma rodada não varrer o banco inteiro se algo der errado.
   */
  const PAGINA = 50;
  const MAX_PAGINAS = 10;
  const folga = Math.max(quantosBastam * 4, PAGINA);
  const candidatos: PedidoCandidato[] = [];
  const jaVistos = new Set(avisados);

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const de = pagina * PAGINA;
    const { data, error } = await supabase
      .from("orders")
      .select("id, created_at, currency, customers ( phone, email )")
      .eq("payment_status", "pending")
      // Cancelar NÃO mexe em payment_status: a action do painel grava só
      // `canceled_at` (admin/pedidos/actions.ts). Sem este filtro, um pedido
      // que a equipe cancelou de propósito receberia "você não finalizou".
      .is("canceled_at", null)
      .gte("created_at", limite)
      .lte("created_at", maduroAte)
      .or("currency.eq.BRL,currency.is.null")
      .order("created_at", { ascending: false })
      .range(de, de + PAGINA - 1);

    if (error) {
      console.error("[carrinho] falha ao ler candidatos", error.message);
      return { erro: true };
    }

    const linhas = (data ?? []) as Linha[];

    for (const linha of linhas) {
      if (jaVistos.has(linha.id)) continue;
      const c = linha.customers;
      const cliente = Array.isArray(c) ? c[0] : c;
      const digitos = (cliente?.phone ?? "").replace(/\D/g, "");
      if (digitos && telefonesAvisados.has(digitos)) continue;
      candidatos.push({
        id: linha.id,
        criadoEm: linha.created_at,
        telefone: cliente?.phone ?? null,
        email: cliente?.email ?? null,
        moeda: linha.currency,
      });
    }

    if (candidatos.length >= folga) break;
    if (linhas.length < PAGINA) break; // acabou a janela
  }

  return { erro: false, candidatos };
}
