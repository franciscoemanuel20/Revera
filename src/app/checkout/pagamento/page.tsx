import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { createAdminClient } from "@/lib/supabase/server";
import { providerParaMoeda } from "@/lib/payments";
import { AmbiguousChargeError } from "@/lib/payments/provider";
import { confirmarPagamento } from "@/lib/payments/confirmar";
import { urlDoWebhook } from "@/lib/payments/webhook-url";
import { baseUrl } from "@/lib/config/urls";

/**
 * Quanto tempo uma reserva `pending` sem URL em lugar nenhum (nem
 * `payments.raw_response`, nem `payment_events`) pode ficar parada antes de
 * ser considerada morta (achado do Codex, 08/09/2026: sem isto, a tela
 * "Estamos preparando" nunca sai do ar para aquele pedido).
 *
 * A sequência inteira que preenche a URL — chamar o gateway, e até 3
 * tentativas de gravar o resultado — acontece dentro de UMA requisição
 * síncrona e não leva perto disto. Depois desta janela, o que sobrou não é
 * "ainda em andamento", é lixo de uma tentativa que morreu no meio (queda de
 * conexão, função encerrada, banco fora do ar nas duas escritas). Curto o
 * bastante para não deixar o cliente esperando muito; longo o bastante para
 * nunca cortar uma tentativa legítima ainda em voo.
 */
const IDADE_MAXIMA_RESERVA_SEM_URL_MS = 90_000;

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
    .select("id, provider, raw_response, amount_cents, status, created_at")
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

  // Se a criação no gateway respondeu, mas a atualização de `payments`
  // falhou, a URL fica em um evento de recuperação. Reconstituímos a linha
  // antes de tentar criar qualquer cobrança nova; o mesmo pedido nunca ganha
  // um segundo link.
  if (pagamentoExistente) {
    const { data: recuperacao } = await supabase
      .from("payment_events")
      .select("payload")
      .eq("provider", pagamentoExistente.provider)
      .eq("provider_event_id", `checkout-link:${pagamentoExistente.id}`)
      .maybeSingle();
    const dadosRecuperados = recuperacao?.payload as {
      checkout_url?: string;
      provider_payment_id?: string | null;
    } | null;
    const urlRecuperada = dadosRecuperados?.checkout_url;

    if (urlRecuperada) {
      const { error: erroRestaurar } = await supabase
        .from("payments")
        .update({
          provider_payment_id: dadosRecuperados?.provider_payment_id ?? null,
          raw_response: { checkout_url: urlRecuperada },
        })
        .eq("id", pagamentoExistente.id);
      if (erroRestaurar) {
        console.error("[pagamento] falha ao restaurar link guardado", erroRestaurar);
      }
      redirect(urlRecuperada);
    }

    /**
     * NEM `raw_response` NEM `payment_events` têm a URL — o pior caso do
     * achado "payment link recovery can permanently strand a checkout"
     * (Codex, 08/09/2026): as duas escritas que deveriam guardá-la
     * falharam. Sem o que vem a seguir, toda visita futura cairia sempre
     * aqui, para sempre.
     *
     * Antes de decidir o que fazer, perguntamos ao PRÓPRIO GATEWAY se o
     * pedido já foi pago — reaproveitando confirmarPagamento(), a MESMA
     * função que o webhook e a página de obrigado usam (porta 1 e porta 2).
     * Não é uma terceira implementação da regra de confirmação; é a mesma,
     * chamada de um terceiro lugar. Se o gateway disser que sim, o cliente
     * vai direto para o comprovante — a reserva sem URL deixa de importar,
     * porque o que interessava (o pagamento) já aconteceu.
     */
    const confirmacao = await confirmarPagamento(pedido.id);
    if (confirmacao.estado === "pago") {
      redirect(`/pedido/${accessToken}`);
    }

    /**
     * Não pago (ou gateway indisponível agora). A reserva pode ainda estar
     * em voo — a mesma requisição que a criou pode não ter terminado — ou
     * pode ser exatamente o caso que este bloco existe para tratar. A
     * janela de segurança evita as duas coisas ruins ao mesmo tempo:
     * mostrar "aguarde" para sempre (o achado de cima) OU liberar uma
     * reserva que uma OUTRA requisição, rodando agora, ainda está
     * preenchendo (o que a migration 13 existe para impedir).
     */
    const idadeMs = Date.now() - new Date(pagamentoExistente.created_at as string).getTime();
    if (idadeMs > IDADE_MAXIMA_RESERVA_SEM_URL_MS) {
      const { error: erroLimpeza } = await supabase
        .from("payments")
        .delete()
        .eq("id", pagamentoExistente.id);
      if (erroLimpeza) {
        console.error("[pagamento] falha ao limpar reserva morta", erroLimpeza);
        return telaDePagamentoIndisponivel(pedido.order_number, accessToken, true);
      }
      // Segue o fluxo normal abaixo: cai na reserva de uma cobrança nova,
      // já confirmado pelo gateway que esta aqui não virou pagamento.
    } else {
      return telaDePagamentoIndisponivel(pedido.order_number, accessToken, true);
    }
  }

  // A escolha do provider também pode falhar (por exemplo, se uma variável
  // essencial foi removida). Fazemos isso antes de reservar qualquer coisa e
  // tratamos a falha como erro de checkout, nunca como tela de erro do Next.
  // Um link já criado acima ainda pode ser aberto mesmo numa falha temporária
  // de configuração, pois não cria cobrança nova.
  let provider;
  try {
    provider = providerParaMoeda(pedido.currency as string);
  } catch (erro) {
    console.error("[pagamento] pagamento não configurado", erro);
    return telaDePagamentoIndisponivel(pedido.order_number, accessToken);
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
      provider: provider.name,
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

    // Não existe autorização para criar outra cobrança. A linha pendente sem
    // URL pode ser uma criação ainda em curso ou uma resposta do gateway que
    // chegou quando o banco estava indisponível. Nos dois casos criar outro
    // link pode cobrar duas vezes; preservar a reserva é a opção segura.
    return telaDePagamentoIndisponivel(pedido.order_number, accessToken, true);
  }

  let checkoutUrl: string;
  let cobrancaCriada = false;
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
    cobrancaCriada = true;

    // ATUALIZA a reserva feita acima, em vez de inserir de novo — a linha já
    // existe desde antes de o gateway ser chamado. A URL do checkout fica
    // GUARDADA: é o que permite reaproveitar o link a cada recarga. A
    // InfinitePay nem sempre devolve `slug`, então `provider_payment_id` pode
    // vir nulo, e a URL é a única referência confiável para este link.
    let erroPersistir: unknown = null;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const { error } = await supabase
        .from("payments")
        .update({
          provider_payment_id: resultado.providerPaymentId,
          raw_response: { checkout_url: resultado.checkoutUrl },
        })
        .eq("id", reserva!.id);

      if (!error) {
        erroPersistir = null;
        break;
      }
      erroPersistir = error;
      console.error("[pagamento] falha ao guardar link do gateway", error);
      await new Promise((r) => setTimeout(r, 200));
    }

    if (erroPersistir) {
      // Supabase devolve vários erros como valor de retorno, sem lançar. Se
      // todos os retries do UPDATE falharem, preservamos a URL numa tabela
      // separada — com o MESMO retry da linha acima (3 tentativas, mesmo
      // backoff): a falha que derrubou o update é, mais das vezes, a mesma
      // instabilidade que derrubaria esta escrita também, e ela é a ÚLTIMA
      // chance de recuperar o link (achado do Codex, 08/09/2026: se ela
      // falhar também, a próxima visita não encontra a URL em lugar
      // nenhum). A próxima visita restaura `payments` a partir daqui, sem
      // criar outra cobrança no gateway para o mesmo pedido.
      let erroBackup: unknown = null;
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const { error } = await supabase.from("payment_events").insert({
          payment_id: reserva!.id,
          provider: provider.name,
          provider_event_id: `checkout-link:${reserva!.id}`,
          event_type: "checkout_link_recovery",
          payload: {
            checkout_url: checkoutUrl,
            provider_payment_id: resultado.providerPaymentId,
          },
        });
        if (!error) {
          erroBackup = null;
          break;
        }
        erroBackup = error;
        console.error("[pagamento] falha ao guardar recuperação do link", error);
        await new Promise((r) => setTimeout(r, 200));
      }
      if (erroBackup) {
        // As duas escritas falharam. Não é mais um problema desta visita —
        // ela já vai receber `checkoutUrl` no redirect abaixo. É a PRÓXIMA
        // visita que ficaria sem para onde ir; o reconhecimento e o
        // autorreparo dessa situação vivem no bloco de `pagamentoExistente`
        // no topo desta função (idade da reserva + confirmarPagamento).
        console.error(
          "[pagamento] link do gateway não guardado em lugar nenhum — próxima visita depende da reconciliação",
          { pedido: pedido.id, reserva: reserva!.id }
        );
      }
    }
  } catch (erro) {
    console.error("[pagamento] falha ao criar cobrança", erro);
    /**
     * DESFAZ A RESERVA — mas só quando é seguro. Sem isto (no caso geral),
     * uma falha deixaria uma linha `pending` sem URL — e o índice único da
     * migration 13 faria TODA tentativa seguinte perder a corrida contra um
     * vencedor que não existe. O cliente ficaria preso num pedido que nunca
     * mais abre pagamento.
     *
     * Mas apagar às cegas tem um risco oposto (achado do Codex, 08/09/2026):
     * `createCharge()` pode ter lançado por uma falha de REDE (timeout,
     * conexão perdida) DEPOIS de o gateway já ter aceitado a requisição e
     * criado um link de verdade do outro lado — nós é que não vimos a
     * resposta. Apagar a reserva nesse caso e deixar tentar de novo criaria
     * um SEGUNDO link válido para o mesmo pedido, o duplo-link que esta
     * função inteira existe para evitar.
     *
     * `AmbiguousChargeError` é como os adapters (InfinitePay, Stripe) MARCAM
     * essa incerteza — ver o comentário na classe, em
     * src/lib/payments/provider.ts. Só apagamos quando: (a) o gateway já
     * criou o link e nós JÁ TEMOS a URL (`cobrancaCriada`, tratado antes,
     * nunca cai aqui), ou (b) o erro é CERTO — validação nossa antes de
     * qualquer chamada, ou uma resposta HTTP que o gateway de fato mandou
     * dizendo "não". Erro ambíguo mantém a reserva — a mesma reconciliação
     * por idade + confirmarPagamento() do bloco de `pagamentoExistente` no
     * topo desta função é quem eventualmente libera essa reserva, depois de
     * perguntar ao gateway se ela virou pagamento mesmo.
     */
    const ambiguo = erro instanceof AmbiguousChargeError;
    if (reserva?.id && !cobrancaCriada && !ambiguo) {
      await supabase.from("payments").delete().eq("id", reserva.id);
    }
    // Não deixa o cliente numa tela morta: mostra o que aconteceu e como
    // retomar, sem expor detalhe técnico do gateway. Erro ambíguo usa o
    // mesmo aviso de "estamos preparando" da reserva preservada — é
    // exatamente o que aconteceu: preservamos por segurança, não por já
    // termos o link.
    return telaDePagamentoIndisponivel(pedido.order_number, accessToken, cobrancaCriada || ambiguo);
  }

  // Fora do try: `redirect` funciona lançando uma exceção especial do Next,
  // que um catch por perto engoliria — e o cliente veria a tela de erro
  // depois de a cobrança ter sido criada com sucesso.
  redirect(checkoutUrl);
}

function telaDePagamentoIndisponivel(
  numeroPedido: string,
  accessToken: string,
  cobrancaEmAnalise = false
) {
  return (
    <main
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-6 pb-16 text-center"
      style={{ paddingTop: HEADER_HEIGHT_PX + 64 }}
    >
      <span className="eyebrow-ink">Pedido {numeroPedido}</span>
      <h1 className="font-display text-3xl text-ink">
        {cobrancaEmAnalise ? "Estamos preparando seu pagamento" : "Não conseguimos abrir o pagamento"}
      </h1>
      <p className="text-ink/70">
        {cobrancaEmAnalise
          ? "Seu pedido está guardado. Aguarde um instante e tente novamente; para sua segurança, não criamos uma segunda cobrança."
          : "Seu pedido está guardado com o número acima e nada foi cobrado. Tente novamente em instantes — se continuar, guarde este número."}
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
