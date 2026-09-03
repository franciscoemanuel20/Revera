/**
 * "Vendeu" — o aviso que chega no WhatsApp oficial da Reverá.
 *
 * ===========================================================================
 * A GARANTIA DE UMA VEZ SÓ MORA NO BANCO (27/08/2026)
 * ===========================================================================
 * A InfinitePay reenvia webhook. A página de obrigado também confirma
 * pagamento (são duas portas, ver confirmar.ts). Se o "já avisei?" fosse um
 * SELECT seguido de um INSERT, existiria uma janela entre os dois em que o
 * segundo webhook lê "não avisei ainda" — e saem duas mensagens.
 *
 * Então a reserva é o próprio INSERT, contra `unique (order_id, kind)`:
 * quem conseguir inserir ganhou o direito de mandar; quem colidir sabe, sem
 * ambiguidade, que outro já tem o direito. É o mesmo desenho de
 * `pixel_event_log` (um Purchase por pedido) e de `shipments_order_id_unico`
 * (uma etiqueta por pedido), que já estavam certos neste projeto.
 *
 * A linha nasce com `sent_at` NULO — reservada, não enviada. Só depois da
 * resposta do provedor ela vira enviada. Assim o painel consegue distinguir
 * "não avisamos" de "tentamos e a Meta recusou", que são problemas
 * diferentes.
 *
 * ===========================================================================
 * O QUE NÃO VAI NA MENSAGEM
 * ===========================================================================
 * Endereço completo, CPF, e-mail e telefone do cliente NÃO entram. WhatsApp
 * é uma superfície que vaza fácil: aparece na notificação da tela de
 * bloqueio, fica no aparelho, é encaminhável com dois toques. Cidade/UF
 * basta para a responsável saber o que a espera; o resto está no painel,
 * atrás de login.
 *
 * O link também não carrega segredo: aponta para /admin/pedidos/{id}, que
 * exige sessão de admin. Um link vazado não abre nada.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { formatarBRL } from "@/lib/format/money";
import { formatarValorNaMoeda } from "@/lib/internacional/moeda";
import { nomeDoPais } from "@/lib/internacional/paises";
import { WHATSAPP_REVERA } from "@/lib/config/whatsapp";
import { enviarWhatsApp, modoWhatsApp } from "./whatsapp";

type Supabase = ReturnType<typeof createAdminClient>;

export type ResultadoAviso =
  | { estado: "enviado" }
  | { estado: "ja_avisado" }
  | { estado: "desligado" }
  | { estado: "erro"; motivo: string };

/**
 * Só chamar depois de o pedido ter EFETIVAMENTE transicionado para pago —
 * isto é, do lado vencedor do compare-and-swap em confirmar.ts. Chamar do
 * lado perdedor não duplicaria (a constraint pega), mas gastaria uma ida ao
 * banco à toa em todo webhook repetido.
 *
 * Não lança. Um aviso que falha não pode derrubar a confirmação de uma venda
 * que já foi paga — ver o cabeçalho de whatsapp.ts.
 */
export async function avisarVendaPaga(
  supabase: Supabase,
  orderId: string
): Promise<ResultadoAviso> {
  try {
    // Reserva primeiro, monta a mensagem depois: se dois webhooks chegarem
    // juntos, o perdedor descobre isso ANTES de ler o pedido inteiro.
    const { error: erroReserva } = await supabase
      .from("order_notifications")
      .insert({ order_id: orderId, kind: "venda_paga", channel: "whatsapp" });

    if (erroReserva) {
      // 23505 = unique_violation. Outro já reservou: nada a fazer, e isso é
      // sucesso, não erro — é literalmente o comportamento que queremos do
      // webhook repetido.
      if (erroReserva.code === "23505") return { estado: "ja_avisado" };
      console.error("[aviso-venda] falha ao reservar", erroReserva);
      return { estado: "erro", motivo: "não foi possível reservar o aviso" };
    }

    if (modoWhatsApp() === "desligado") {
      // A reserva FICA, com sent_at nulo. O painel mostra "aviso não
      // enviado" e a responsável entende o porquê, em vez de achar que a
      // mensagem se perdeu.
      await supabase
        .from("order_notifications")
        .update({ last_error: "WHATSAPP_PROVIDER desligado" })
        .eq("order_id", orderId)
        .eq("kind", "venda_paga");
      return { estado: "desligado" };
    }

    const dados = await lerResumo(supabase, orderId);
    if (!dados) {
      await registrarFalha(supabase, orderId, "pedido não encontrado para montar o aviso");
      return { estado: "erro", motivo: "pedido não encontrado" };
    }

    // WHATSAPP_DESTINO é para ONDE o aviso CHEGA — a equipe —, não o número
    // que o cliente vê. Por isso ele não virou constante junto com
    // WHATSAPP_REVERA em 03/09/2026: são papéis diferentes, e um dia o aviso
    // pode ir para um número que não atende cliente nenhum. Sem a variável,
    // porém, cair no número da loja é melhor que não avisar ninguém.
    const destino = (process.env.WHATSAPP_DESTINO || WHATSAPP_REVERA).replace(/\D/g, "");
    const { texto, parametros } = montarAvisoVendaPaga(dados);
    const envio = await enviarWhatsApp({ para: destino, texto, parametros });

    if (envio.estado === "erro") {
      await registrarFalha(supabase, orderId, envio.motivo);
      return { estado: "erro", motivo: envio.motivo };
    }
    if (envio.estado === "desligado") {
      return { estado: "desligado" };
    }

    await supabase
      .from("order_notifications")
      .update({
        sent_at: new Date().toISOString(),
        provider_message_id: envio.providerMessageId,
        last_error: null,
      })
      .eq("order_id", orderId)
      .eq("kind", "venda_paga");

    return { estado: "enviado" };
  } catch (erro) {
    console.error("[aviso-venda] exceção", erro);
    return { estado: "erro", motivo: "exceção ao avisar" };
  }
}

async function registrarFalha(supabase: Supabase, orderId: string, motivo: string) {
  await supabase
    .from("order_notifications")
    .update({ last_error: motivo.slice(0, 500) })
    .eq("order_id", orderId)
    .eq("kind", "venda_paga");
}

export interface ResumoVenda {
  orderId: string;
  numero: string;
  cliente: string;
  produto: string;
  quantidade: number;
  totalCents: number;
  /**
   * Moeda do pedido. Sem ela o aviso mentia: um pedido de US$ 850 chegava
   * no WhatsApp como "R$ 850,00" — número certo, moeda errada, e a diferença
   * é de cinco mil reais na leitura de quem separa a peça.
   */
  moeda: string;
  cidade: string;
  uf: string;
  /** ISO do país de entrega. "BR" no pedido nacional. */
  pais: string;
}

async function lerResumo(supabase: Supabase, orderId: string): Promise<ResumoVenda | null> {
  const { data } = await supabase
    .from("orders")
    .select(
      "id, order_number, total_cents, currency, customers(full_name), addresses(city, state, country), order_items(product_name_snapshot, quantity)"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!data) return null;

  const itens = (data.order_items ?? []) as Array<{
    product_name_snapshot: string;
    quantity: number;
  }>;
  const primeiro = itens[0];
  const endereco = data.addresses as
    | { city?: string; state?: string; country?: string }
    | null;
  const cliente = (data.customers as { full_name?: string } | null)?.full_name;

  return {
    orderId: data.id as string,
    numero: data.order_number as string,
    // Um pedido com dois produtos vira "Micropele 0,08 +1 item": o aviso é
    // para saber que vendeu e o que separar, não é a nota fiscal.
    produto: primeiro
      ? itens.length > 1
        ? `${primeiro.product_name_snapshot} +${itens.length - 1} item(ns)`
        : primeiro.product_name_snapshot
      : "—",
    quantidade: itens.reduce((soma, i) => soma + i.quantity, 0),
    cliente: cliente?.trim() || "Cliente sem nome",
    totalCents: data.total_cents as number,
    moeda: (data.currency as string) ?? "BRL",
    cidade: endereco?.city ?? "—",
    uf: endereco?.state ?? "—",
    pais: (endereco?.country as string) ?? "BR",
  };
}

/**
 * Exportada para o teste conseguir provar, sem rede e sem banco, que a
 * mensagem não carrega rua, número, CEP, CPF, e-mail nem telefone.
 */
export function montarAvisoVendaPaga(v: ResumoVenda): { texto: string; parametros: string[] } {
  /**
   * O aviso é INTERNO — vai para a equipe, em português. O que muda no
   * pedido internacional não é a língua, é o dado: a moeda tem que ser a do
   * pedido, e "cidade/UF" não descreve um endereço americano (state pode
   * vir nulo, e "Miami/—" não diz nada). Fora do Brasil o lugar sai como
   * "cidade, País".
   */
  const valor =
    v.moeda === "BRL" ? formatarBRL(v.totalCents) : formatarValorNaMoeda(v.totalCents, v.moeda);
  const lugar =
    v.pais === "BR" ? `${v.cidade}/${v.uf}` : `${v.cidade}, ${nomeDoPais(v.pais)}`;
  const link = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/admin/pedidos/${v.orderId}`;

  const parametros = [
    v.numero,
    v.cliente,
    v.produto,
    String(v.quantidade),
    valor,
    lugar,
    link,
  ];

  const texto = [
    "NOVA VENDA REVERÁ",
    "",
    `Pedido: ${v.numero}`,
    `Cliente: ${v.cliente}`,
    `Produto: ${v.produto}`,
    `Quantidade: ${v.quantidade}`,
    `Valor: ${valor}`,
    `Cidade: ${lugar}`,
    "",
    "Pagamento: CONFIRMADO",
    "Envio: AGUARDANDO ETIQUETA",
    "",
    `Abrir pedido: ${link}`,
  ].join("\n");

  return { texto, parametros };
}
