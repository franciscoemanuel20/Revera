import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { createAdminClient } from "@/lib/supabase/server";
import { providerParaMoeda } from "@/lib/payments";
import { urlDoWebhook } from "@/lib/payments/webhook-url";
import { baseUrl } from "@/lib/config/urls";

export const metadata: Metadata = {
  title: "Pagamento",
};

/**
 * Inicia o pagamento e manda o cliente para o checkout hospedado do gateway.
 *
 * Lê o pedido pelo `access_token` (não pelo id): o token é o que circula em
 * URL, é aleatório e não permite enumerar pedidos alheios — ver a coluna
 * `orders.access_token` no schema.
 *
 * Usa createAdminClient de propósito: o visitante que acabou de comprar não
 * tem sessão do Supabase Auth, e `orders` não tem (nem deve ter) policy de
 * leitura pública — registro financeiro com chave anon pública no bundle
 * seria leitura livre para qualquer um. A autorização aqui é a posse do
 * token, verificada nesta consulta.
 */
export default async function PagamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  const { pedido: accessToken } = await searchParams;
  if (!accessToken) notFound();

  const supabase = createAdminClient();

  const { data: pedido } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total_cents, shipping_cents, discount_cents, currency, access_token, customer_id"
    )
    .eq("access_token", accessToken)
    .maybeSingle();

  if (!pedido) notFound();

  // Já pago (ou já adiante): não recobra, manda direto para o comprovante.
  if (pedido.status !== "new") {
    redirect(`/pedido/${accessToken}`);
  }

  const [{ data: itens }, { data: cliente }] = await Promise.all([
    supabase
      .from("order_items")
      .select("product_name_snapshot, variant_label_snapshot, quantity, unit_price_cents")
      .eq("order_id", pedido.id),
    pedido.customer_id
      ? supabase
          .from("customers")
          .select("full_name, email, phone")
          .eq("id", pedido.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const base = baseUrl();

  /**
   * REAPROVEITA O LINK QUE JÁ EXISTE (29/08/2026) — idempotência.
   *
   * Esta página cria a cobrança no gateway. Sem guarda, cada F5, cada
   * "Tentar novamente" e cada volta pelo histórico criava um link NOVO e mais
   * uma linha em `payments`. Medido no pedido de teste REV-D32DE067: três
   * linhas `pending` para um pedido só.
   *
   * Nenhum cliente seria cobrado duas vezes por isso — só um link é pago —
   * mas a conciliação vira adivinhação ("qual destes três é o que valeu?") e
   * o webhook passa a ter mais de um candidato para o mesmo pedido.
   *
   * A guarda: se já existe cobrança pendente para ESTE pedido, com o MESMO
   * valor e com a URL guardada, manda o cliente para ela. Valor diferente
   * significa pedido alterado — aí um link novo é o certo.
   */
  const { data: pagamentoExistente } = await supabase
    .from("payments")
    .select("id, raw_response, amount_cents, status")
    .eq("order_id", pedido.id)
    .eq("status", "pending")
    .eq("amount_cents", pedido.total_cents)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const urlGuardada = (pagamentoExistente?.raw_response as { checkout_url?: string } | null)
    ?.checkout_url;
  if (urlGuardada) {
    redirect(urlGuardada);
  }

  /**
   * ===========================================================================
   * A RESERVA — por que a consulta acima não bastava (31/08/2026)
   * ===========================================================================
   * A guarda logo acima LÊ e depois ESCREVE, e entre as duas coisas existe um
   * intervalo. Duas requisições quase simultâneas passam as duas pela leitura
   * antes de qualquer uma escrever — e aí as duas cobram.
   *
   * Não é teoria: o pedido REV-ED9A384B, de 31/08 (DOIS DIAS depois daquela
   * guarda), gerou duas linhas `pending` com 24 ms de diferença. E o
   * REV-D32DE067 gerou três, duas delas separadas por 2 MILISSEGUNDOS. Dedo
   * humano não faz isso — é execução concorrente.
   *
   * Ninguém foi cobrado em dobro, porque só um link é pago. Mas ficavam dois
   * links VÁLIDOS no gateway para o mesmo pedido, e o cliente que abrisse os
   * dois pagaria os dois.
   *
   * A correção não é mais verificação: verificação sempre perde a corrida.
   * É INSERIR PRIMEIRO, com um índice único parcial no banco (migration 13)
   * garantindo no máximo uma linha `pending` por pedido. Quem consegue
   * inserir ganhou a corrida e é o único que fala com o gateway. Quem perde
   * recebe erro do banco e vai buscar o link do vencedor.
   *
   * A ordem importa: reservar ANTES de cobrar é o que impede a segunda
   * cobrança de existir. Cobrar primeiro e deduplicar depois deixaria o link
   * órfão criado do mesmo jeito.
   */
  const { data: reserva, error: erroReserva } = await supabase
    .from("payments")
    .insert({
      order_id: pedido.id,
      provider: providerParaMoeda(pedido.currency as string).name,
      status: "pending",
      amount_cents: pedido.total_cents,
      // Sem `checkout_url` ainda: ele só existe depois do gateway responder.
      // É exatamente esta ausência que diz "reservado, ainda não pronto".
      raw_response: {},
    })
    .select("id")
    .maybeSingle();

  if (erroReserva || !reserva) {
    /**
     * Perdemos a corrida (ou o banco recusou por outro motivo). O vencedor
     * está falando com o gateway agora e vai gravar a URL em seguida.
     *
     * Espera curta e limitada: 5 tentativas de 300 ms. Se em 1,5 s a URL não
     * apareceu, o vencedor provavelmente falhou — e aí cair na tela de
     * "tentar novamente" é melhor que deixar o cliente numa página parada.
     */
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      await new Promise((r) => setTimeout(r, 300));
      const { data: doVencedor } = await supabase
        .from("payments")
        .select("raw_response")
        .eq("order_id", pedido.id)
        .eq("status", "pending")
        .maybeSingle();
      const url = (doVencedor?.raw_response as { checkout_url?: string } | null)?.checkout_url;
      // Fora de try/catch: `redirect` funciona lançando exceção do Next.
      if (url) redirect(url);
    }
  }

  let checkoutUrl: string;
  try {
    /**
     * DENTRO do try de propósito (P0-2, 27/08/2026).
     *
     * getPaymentProvider() passou a LANÇAR quando o pagamento não está
     * configurado, em vez de cair em mock. Se a chamada ficasse fora daqui,
     * uma variável faltando derrubaria esta página numa tela de erro do
     * Next — e o cliente, que JÁ TEM UM PEDIDO CRIADO neste ponto, veria um
     * crash em vez do aviso de que nada foi cobrado e o pedido está guardado.
     *
     * Falhar fechado é sobre não aprovar pagamento indevido; não é desculpa
     * para tratar mal quem estava comprando.
     */
    // Roteado pela MOEDA do pedido: BRL → nacional, resto → Stripe.
    const provider = providerParaMoeda(pedido.currency as string);
    const resultado = await provider.createCharge({
      orderId: pedido.id,
      orderNumber: pedido.order_number,
      amountCents: pedido.total_cents,
      currency: pedido.currency as string,
      customerName: cliente?.full_name ?? undefined,
      customerEmail: cliente?.email ?? undefined,
      customerPhone: cliente?.phone ?? undefined,
      // PORTA 2 da confirmação: o cliente volta para cá depois de pagar, e
      // essa página confirma com o gateway. Ver src/lib/payments/confirmar.ts.
      redirectUrl: `${base}/pedido/${accessToken}`,
      // PORTA 1: o aviso do gateway. Segredo no caminho, nunca em query.
      webhookUrl: urlDoWebhook(base),
      // O frete entra como LINHA, não fica embutido no preço da peça.
      //
      // Sem isso as linhas somariam menos que `amountCents` e a tela do
      // gateway mostraria um total que não bate com o que está listado — o
      // tipo de detalhe que faz a pessoa desconfiar e abandonar bem no fim.
      // (Desconto, quando houver, ainda não tem linha aqui: hoje nenhum
      // pedido nasce com desconto. No dia em que nascer, esta soma volta a
      // divergir e o lugar de corrigir é este.)
      items: [
        ...(itens ?? []).map((item) => ({
          description: [item.product_name_snapshot, item.variant_label_snapshot]
            .filter(Boolean)
            .join(" — "),
          quantity: item.quantity as number,
          priceCents: item.unit_price_cents as number,
        })),
        ...(pedido.shipping_cents > 0
          ? [
              {
                description: "Frete",
                quantity: 1,
                priceCents: pedido.shipping_cents as number,
              },
            ]
          : []),
      ],
    });
    checkoutUrl = resultado.checkoutUrl;

    // ATUALIZA a reserva feita acima, em vez de inserir de novo — a linha já
    // existe desde antes de o gateway ser chamado. A URL do checkout fica
    // GUARDADA: é o que permite reaproveitar o link a cada recarga. A
    // InfinitePay nem sempre devolve `slug`, então `provider_payment_id` pode
    // vir nulo, e a URL é a única referência confiável para este link.
    await supabase
      .from("payments")
      .update({
        provider_payment_id: resultado.providerPaymentId,
        raw_response: { checkout_url: resultado.checkoutUrl },
      })
      .eq("id", reserva!.id);
  } catch (erro) {
    console.error("[pagamento] falha ao criar cobrança", erro);
    /**
     * DESFAZ A RESERVA. Sem isto, uma falha do gateway deixaria uma linha
     * `pending` sem URL — e o índice único da migration 13 faria TODA
     * tentativa seguinte perder a corrida contra um vencedor que não existe.
     * O cliente ficaria preso num pedido que nunca mais abre pagamento.
     */
    if (reserva?.id) {
      await supabase.from("payments").delete().eq("id", reserva.id);
    }
    // Não deixa o cliente numa tela morta: mostra o que aconteceu e como
    // retomar, sem expor detalhe técnico do gateway.
    return (
      <main
        className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-6 pb-16 text-center"
        style={{ paddingTop: HEADER_HEIGHT_PX + 64 }}
      >
        <span className="eyebrow-ink">Pedido {pedido.order_number}</span>
        <h1 className="font-display text-3xl text-ink">
          Não conseguimos abrir o pagamento
        </h1>
        <p className="text-ink/70">
          Seu pedido está guardado com o número acima e nada foi cobrado.
          Tente novamente em instantes — se continuar, guarde este número.
        </p>
        <a
          href={`/checkout/pagamento?pedido=${accessToken}`}
          className="text-ink underline decoration-gold decoration-2 underline-offset-4"
        >
          Tentar novamente
        </a>
      </main>
    );
  }

  // Fora do try: `redirect` funciona lançando uma exceção especial do Next,
  // que um catch por perto engoliria — e o cliente veria a tela de erro
  // depois de a cobrança ter sido criada com sucesso.
  redirect(checkoutUrl);
}
