import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { createAdminClient } from "@/lib/supabase/server";
import { getStripeProvider } from "@/lib/payments";
import { getReveraProviderForCurrency } from "@/lib/payments/revera";
import { AmbiguousChargeError } from "@/lib/payments/provider";
import { confirmarPagamento } from "@/lib/payments/confirmar";
import { urlDoWebhook } from "@/lib/payments/webhook-url";
import { baseUrl } from "@/lib/config/urls";
import { idiomaDoPais } from "@/lib/internacional/paises";
import { pedidoInternacionalPagavel } from "@/lib/internacional/mercado";
import { urlCheckoutStripeSegura } from "@/lib/payments/stripe-provider";
import { montarItensDoPagamento } from "@/lib/payments/itens";
import { AutoRetryPagamento } from "./AutoRetryPagamento";

/**
 * Quanto tempo uma reserva `pending` sem URL em lugar nenhum (nem
 * `payments.raw_response`, nem `payment_events`) fica parada antes de a
 * TELA (só a tela — nunca o banco) parar de dizer "aguarde" e passar a
 * sugerir contato com o suporte.
 *
 * NÃO É UM PRAZO DE LIBERAÇÃO — uma versão anterior deste arquivo apagava a
 * reserva depois desta janela e deixava o fluxo criar uma cobrança nova; o
 * Codex apontou (08/09/2026) que isso podia recriar um segundo link válido
 * para o mesmo pedido, porque "não pago" não é o mesmo que "não existe link
 * em aberto". A liberação de verdade é sempre uma decisão humana — ver o
 * comentário grande mais abaixo, onde este valor é usado.
 *
 * POR QUE ESTA JANELA VIROU GARANTIA, E NÃO SÓ SUPOSIÇÃO (achado seguinte do
 * Codex, mesmo dia): antes de existir `TIMEOUT_CRIACAO_MS`
 * (src/lib/payments/provider.ts), uma chamada ao gateway sem teto de tempo
 * podia, em teoria, continuar em andamento além de qualquer prazo — "90 s
 * se passaram" não provava que a tentativa original tinha morrido. Com o
 * teto (20 s) mais a margem dos retries de persistência (poucos segundos),
 * a sequência inteira de criação SEMPRE termina bem antes desta janela — o
 * que era suposição virou garantia.
 */
const IDADE_PARA_SUGERIR_CONTATO_MS = 90_000;

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
      "id, order_number, status, payment_status, total_cents, shipping_cents, discount_cents, currency, payment_preference, access_token, customer_id, address_id, intl_shipping_quote_id"
    )
    .eq("access_token", accessToken)
    .maybeSingle();

  if (!pedido) notFound();

  /**
   * ESTORNADO NUNCA RECOBRA (achado do Codex, 08/09/2026).
   *
   * `orders.status` é coluna GERADA (migration 8) e a fórmula não tem ramo
   * para `payment_status = 'refunded'` — ela existe para decidir ENVIO
   * (cancelado/garantia/entregue/enviado/etiqueta/pago), não para decidir se
   * o pedido pode ser cobrado de novo. Um pedido estornado sem envio
   * derivava `status = 'new'` (o mesmo de um pedido que nunca foi pago) e
   * passava direto pela guarda abaixo para uma cobrança nova.
   *
   * O pior não é só cobrar de novo: confirmarPagamento() (src/lib/payments/
   * confirmar.ts) RECUSA reconfirmar qualquer pedido com
   * `payment_status = 'refunded'`, de propósito — é a mesma trava que
   * impede um webhook atrasado reaprovar um estorno. Então esse pagamento
   * novo cobraria o cliente de verdade no gateway e o sistema NUNCA
   * marcaria o pedido como pago — dinheiro entrando sem nenhum caminho de
   * volta a não ser alguém perceber na mão.
   *
   * A checagem é por `payment_status`, o eixo real do dinheiro — não por
   * `status`, que é derivado e não tem este caso.
   */
  if (pedido.payment_status === "refunded") {
    redirect(`/pedido/${accessToken}`);
  }

  // Já pago (ou já adiante): não recobra, manda direto para o comprovante.
  if (pedido.status !== "new") {
    redirect(`/pedido/${accessToken}`);
  }

  let idiomaPagamento: "pt" | "en" | "es" = "pt";
  if (pedido.currency !== "BRL") {
    const { data: endereco } = await supabase.from("addresses").select("country")
      .eq("id", pedido.address_id).maybeSingle();
    // Revalida antes de criar OU reaproveitar uma sessão: um pedido antigo
    // não contorna país fechado, cotação vencida ou catálogo incompleto.
    if (!(await pedidoInternacionalPagavel(endereco?.country ?? "", pedido.currency, pedido.intl_shipping_quote_id, pedido.shipping_cents))) {
      return telaDePagamentoIndisponivel(pedido.order_number, accessToken, {
        motivo: "internacional_indisponivel",
      });
    }
    idiomaPagamento = idiomaDoPais(endereco!.country);
  }
  const linkPermitido = (url: string) => pedido.currency === "BRL" || urlCheckoutStripeSegura(url);

  const [{ data: itens }, { data: cliente }, { data: endereco }] = await Promise.all([
    supabase
      .from("order_items")
      .select("product_name_snapshot, variant_label_snapshot, quantity, unit_price_cents")
      .eq("order_id", pedido.id),
    pedido.customer_id
      ? supabase
          .from("customers")
          .select("full_name, email, phone, cpf")
          .eq("id", pedido.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    pedido.address_id
      ? supabase
          .from("addresses")
          .select("street, number, complement, neighborhood, city, state, cep")
          .eq("id", pedido.address_id)
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
    if (!linkPermitido(urlGuardada)) {
      return telaDePagamentoIndisponivel(pedido.order_number, accessToken, {
        motivo: "link_bloqueado",
      });
    }
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
      if (!linkPermitido(urlRecuperada)) {
        return telaDePagamentoIndisponivel(pedido.order_number, accessToken, {
          motivo: "link_bloqueado",
        });
      }
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
     * Não pago (ou gateway indisponível agora) — NÃO LIBERAMOS A RESERVA
     * AQUI, nem depois de qualquer prazo (achado do Codex, 08/09/2026,
     * sobre uma versão anterior deste bloco que apagava a reserva depois de
     * 90 s).
     *
     * "Não pago" não é o mesmo que "não existe link em aberto": o gateway
     * pode ter criado um link válido que ninguém pagou ainda, e nenhum dos
     * dois providers desta loja tem uma chamada de "existe link para este
     * pedido?" nem "cancele o link antigo" por id de pedido — só por id de
     * transação, que é exatamente o que se perde quando a reserva trava.
     * Apagar e deixar o fluxo criar uma cobrança nova recriaria o duplo-link
     * que este arquivo inteiro existe para evitar.
     *
     * Sem um jeito seguro de o PRÓPRIO SISTEMA confirmar que o link antigo
     * está morto, a decisão de liberar essa reserva é humana — quem opera
     * confere no painel do gateway (InfinitePay ou Stripe) se não existe
     * outro link em aberto para este pedido, e libera pelo botão em
     * /admin/pedidos/[id] (`liberarReservaTravadaAction`, o mesmo desenho
     * do estorno manual em confirmar.ts: "o estorno em si é manual no
     * painel do gateway"). A mensagem ao cliente já indica contato quando a
     * espera passa de um tempo razoável — ver `estagnada` abaixo.
     */
    const idadeMs = Date.now() - new Date(pagamentoExistente.created_at as string).getTime();
    const estagnada = idadeMs > IDADE_PARA_SUGERIR_CONTATO_MS;
    return telaDePagamentoIndisponivel(pedido.order_number, accessToken, {
      motivo: estagnada ? "reserva_travada" : "em_preparacao",
    });
  }

  // A escolha do provider também pode falhar (por exemplo, se uma variável
  // essencial foi removida). Fazemos isso antes de reservar qualquer coisa e
  // tratamos a falha como erro de checkout, nunca como tela de erro do Next.
  // Um link já criado acima ainda pode ser aberto mesmo numa falha temporária
  // de configuração, pois não cria cobrança nova.
  let provider;
  try {
    provider =
      pedido.currency === "BRL" && pedido.payment_preference === "apple_pay"
        ? getStripeProvider()
        : getReveraProviderForCurrency(pedido.currency as string);
  } catch (erro) {
    console.error("[pagamento] pagamento não configurado", erro);
    return telaDePagamentoIndisponivel(pedido.order_number, accessToken, {
      motivo: "metodo_indisponivel",
    });
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
     * Espera limitada: até 20 tentativas de 400 ms (8 s). Até 18/09/2026
     * eram 1,5 s, e isso era curto: no teste de produção daquele dia o
     * cliente viu "Estamos preparando seu pagamento" e só chegou à
     * InfinitePay depois do recarregamento automático, ~10 s ao todo. Esta
     * espera só LÊ o banco, nunca cria cobrança, então esperar mais não traz
     * risco de link duplicado — só troca uma tela que parece erro por alguns
     * segundos a mais de carregamento.
     *
     * Sai antes se a reserva sumiu (o vencedor falhou com erro certo e
     * apagou a linha): aí não há link a esperar, e a tela de sempre é a
     * resposta certa.
     */
    for (let tentativa = 0; tentativa < 20; tentativa++) {
      await new Promise((r) => setTimeout(r, 400));
      const { data: doVencedor, error: erroLeitura } = await supabase
        .from("payments")
        .select("raw_response")
        .eq("order_id", pedido.id)
        .eq("status", "pending")
        .maybeSingle();
      if (!erroLeitura && !doVencedor) break;
      const url = (doVencedor?.raw_response as { checkout_url?: string } | null)?.checkout_url;
      // Fora de try/catch: `redirect` funciona lançando exceção do Next.
      if (url && linkPermitido(url)) redirect(url);
    }

    // Não existe autorização para criar outra cobrança. A linha pendente sem
    // URL pode ser uma criação ainda em curso ou uma resposta do gateway que
    // chegou quando o banco estava indisponível. Nos dois casos criar outro
    // link pode cobrar duas vezes; preservar a reserva é a opção segura.
    return telaDePagamentoIndisponivel(pedido.order_number, accessToken, {
      motivo: "em_preparacao",
    });
  }

  const itensDoPagamento = montarItensDoPagamento({
    itens: itens ?? [],
    shippingCents: pedido.shipping_cents as number,
    discountCents: pedido.discount_cents as number,
    idiomaPagamento,
  });

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
      preferredMethod: pedido.payment_preference === "apple_pay" ? "apple_pay" : undefined,
      locale: idiomaPagamento,
      customerName: cliente?.full_name ?? undefined,
      customerEmail: cliente?.email ?? undefined,
      customerPhone: cliente?.phone ?? undefined,
      customerDocument: cliente?.cpf ?? undefined,
      customerAddress: endereco
        ? {
            street: endereco.street,
            number: endereco.number,
            complement: endereco.complement,
            neighborhood: endereco.neighborhood,
            city: endereco.city,
            state: endereco.state,
            postalCode: endereco.cep,
          }
        : undefined,
      // PORTA 2 da confirmação: o cliente volta para cá depois de pagar, e
      // essa página confirma com o gateway. Ver src/lib/payments/confirmar.ts.
      // O retorno é apenas um sinal de navegação para abrir o WhatsApp. A
      // página do pedido ainda reconfirma o pagamento antes de agir; a query
      // nunca aprova dinheiro por si só.
      redirectUrl: `${base}/pedido/${accessToken}?retorno=pagamento`,
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
      items: itensDoPagamento,
    });
    checkoutUrl = resultado.checkoutUrl;
    cobrancaCriada = true;

    // ATUALIZA a reserva feita acima, em vez de inserir de novo — a linha já
    // existe desde antes de o gateway ser chamado. A URL do checkout fica
    // GUARDADA: é o que permite reaproveitar o link a cada recarga. A
    // InfinitePay nem sempre devolve `slug`, então `provider_payment_id` pode
    // vir nulo, e a URL é a única referência confiável para este link.
    //
    // `.select("id").maybeSingle()` no UPDATE (achado do Codex, 08/09/2026):
    // sem isso, um UPDATE que não bate em NENHUMA linha (a reserva sumiu —
    // por exemplo, liberarReservaTravadaAction rodando ao mesmo tempo lá no
    // admin) volta `error: null` do mesmo jeito que um sucesso de verdade.
    // O código seguia direto para o redirect acreditando que a URL estava
    // guardada, quando na verdade não sobrou registro nenhum — a próxima
    // visita não acharia a reserva e criaria uma cobrança nova, duplicando o
    // link. Com `.select()`, "zero linhas afetadas" vira um caso PRÓPRIO
    // (`linhaSumiu`), distinto de erro de banco.
    let erroPersistir: unknown = null;
    let linhaSumiu = false;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const { data: atualizada, error } = await supabase
        .from("payments")
        .update({
          provider_payment_id: resultado.providerPaymentId,
          raw_response: { checkout_url: resultado.checkoutUrl },
        })
        .eq("id", reserva!.id)
        .select("id")
        .maybeSingle();

      if (!error && atualizada) {
        erroPersistir = null;
        linhaSumiu = false;
        break;
      }
      if (!error && !atualizada) {
        // Zero linhas, zero erro: a reserva não existe mais. Repetir o
        // mesmo UPDATE não muda nada — sai já para a recriação abaixo.
        linhaSumiu = true;
        erroPersistir = null;
        break;
      }
      erroPersistir = error;
      console.error("[pagamento] falha ao guardar link do gateway", error);
      await new Promise((r) => setTimeout(r, 200));
    }

    if (linhaSumiu) {
      /**
       * A reserva sumiu no meio da criação da cobrança (liberação manual
       * concorrente, ou outra requisição que já limpou isto). RECRIA o
       * registro do zero, já com a URL que JÁ TEMOS em mãos — ou, se essa
       * recriação também perder a corrida, usa a URL de quem venceu. Ver
       * `recriarReservaOuUsarVencedor` para o raciocínio completo.
       */
      const resultadoRecriacao = await recriarReservaOuUsarVencedor(
        supabase,
        pedido,
        provider.name,
        resultado,
        reserva!.id,
        accessToken
      );
      if (!resultadoRecriacao.ok) return resultadoRecriacao.tela;
      checkoutUrl = resultadoRecriacao.checkoutUrl;
    } else if (erroPersistir) {
      /**
       * Todos os retries do UPDATE direto falharam. `gravar_recuperacao_link`
       * (migration 17) é a ÚLTIMA chance de recuperar o link — e faz isso sob
       * o MESMO advisory lock de `liberar_reserva_travada` (achado do Codex,
       * 08/09/2026: um INSERT simples em `payment_events` não disputa lock
       * nenhum com o DELETE do admin, então "checar antes de apagar" nunca
       * fecha essa corrida de verdade — só um lock consultivo comum às duas
       * pontas fecha). Se o admin já apagou a reserva, a função enxerga isso
       * (sob o MESMO lock) e devolve `gravado: false` em vez de tentar um
       * INSERT que violaria a chave estrangeira.
       */
      const { data: recuperacaoResultado, error: erroRpcRecuperacao } = await supabase.rpc(
        "gravar_recuperacao_link",
        {
          p_payment_id: reserva!.id,
          p_provider: provider.name,
          p_checkout_url: checkoutUrl,
          p_provider_payment_id: resultado.providerPaymentId,
        }
      );

      if (erroRpcRecuperacao) {
        // Não é mais um problema desta visita — ela já vai receber
        // `checkoutUrl` no redirect abaixo. É a PRÓXIMA visita que ficaria
        // sem para onde ir; o reconhecimento e o autorreparo dessa situação
        // vivem no bloco de `pagamentoExistente` no topo desta função.
        const funcaoAusente = erroRpcRecuperacao.message?.toLowerCase().includes("function");
        console.error(
          funcaoAusente
            ? "[pagamento] gravar_recuperacao_link ainda não existe no banco (falta aplicar supabase/aplicar/LIBERAR-RESERVA-ATOMICO.sql) — link não guardado em lugar nenhum"
            : "[pagamento] falha ao chamar gravar_recuperacao_link — link não guardado em lugar nenhum",
          erroRpcRecuperacao,
          { pedido: pedido.id, reserva: reserva!.id }
        );
      } else if (recuperacaoResultado?.[0]?.gravado !== true) {
        // A reserva sumiu no instante em que o lock foi concedido — mesma
        // saída segura do caso `linhaSumiu` acima.
        const resultadoRecriacao = await recriarReservaOuUsarVencedor(
          supabase,
          pedido,
          provider.name,
          resultado,
          reserva!.id,
          accessToken
        );
        if (!resultadoRecriacao.ok) return resultadoRecriacao.tela;
        checkoutUrl = resultadoRecriacao.checkoutUrl;
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
    return telaDePagamentoIndisponivel(pedido.order_number, accessToken, {
      motivo: cobrancaCriada || ambiguo ? "em_preparacao" : "erro_tecnico",
    });
  }

  // Fora do try: `redirect` funciona lançando uma exceção especial do Next,
  // que um catch por perto engoliria — e o cliente veria a tela de erro
  // depois de a cobrança ter sido criada com sucesso.
  if (!linkPermitido(checkoutUrl)) {
    return telaDePagamentoIndisponivel(pedido.order_number, accessToken, {
      motivo: "link_bloqueado",
    });
  }
  redirect(checkoutUrl);
}

/**
 * A reserva original sumiu no meio da criação da cobrança — row deletada por
 * outra requisição (um "tentar novamente" concorrente, ou uma liberação
 * manual no admin). RECRIA o registro do zero, já com a URL que temos em
 * mãos. Se essa recriação TAMBÉM perder a corrida contra uma reserva
 * concorrente (índice único da migration 13), busca a URL de quem está
 * valendo agora e usa ELA — nunca a nossa, que ficaria órfã: um link real,
 * pagável, sem registro em lugar nenhum, ao lado do link do vencedor (o
 * duplo-link que este arquivo inteiro existe para evitar).
 *
 * Devolve `{ ok: true, checkoutUrl }` quando há uma URL segura para usar
 * (nossa recriação, ou a do vencedor), ou `{ ok: false, tela }` quando nem
 * isso — a tela segura, nunca um link que não está em nenhum registro.
 */
async function recriarReservaOuUsarVencedor(
  supabase: ReturnType<typeof createAdminClient>,
  pedido: { id: string; order_number: string; total_cents: number },
  providerName: string,
  resultado: { providerPaymentId: string | null; checkoutUrl: string },
  reservaAntigaId: string,
  accessToken: string
): Promise<
  { ok: true; checkoutUrl: string } | { ok: false; tela: ReturnType<typeof telaDePagamentoIndisponivel> }
> {
  const { error: erroRecriar } = await supabase.from("payments").insert({
    order_id: pedido.id,
    provider: providerName,
    status: "pending",
    amount_cents: pedido.total_cents,
    provider_payment_id: resultado.providerPaymentId,
    raw_response: { checkout_url: resultado.checkoutUrl },
  });
  if (!erroRecriar) {
    return { ok: true, checkoutUrl: resultado.checkoutUrl };
  }

  console.error(
    "[pagamento] reserva sumiu e a recriação perdeu para outra reserva — buscando o link do vencedor",
    erroRecriar,
    { pedido: pedido.id, reservaAntiga: reservaAntigaId }
  );

  let urlDoVencedor: string | undefined;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data: atual } = await supabase
      .from("payments")
      .select("raw_response")
      .eq("order_id", pedido.id)
      .eq("status", "pending")
      .maybeSingle();
    urlDoVencedor = (atual?.raw_response as { checkout_url?: string } | null)?.checkout_url;
    if (urlDoVencedor) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  if (urlDoVencedor) {
    return { ok: true, checkoutUrl: urlDoVencedor };
  }
  // Nem o vencedor guardou a URL dentro do prazo de espera. Não redireciona
  // para NENHUM link nosso (órfão) nem inventa um — mostra a tela segura, a
  // mesma de quando perdemos a corrida original.
  return {
    ok: false,
    tela: telaDePagamentoIndisponivel(pedido.order_number, accessToken, {
      motivo: "em_preparacao",
    }),
  };
}

type MotivoPagamentoIndisponivel =
  | "erro_tecnico"
  | "em_preparacao"
  | "reserva_travada"
  | "metodo_indisponivel"
  | "internacional_indisponivel"
  | "link_bloqueado";

function telaDePagamentoIndisponivel(
  numeroPedido: string,
  accessToken: string,
  opcoes: { motivo?: MotivoPagamentoIndisponivel } = {}
) {
  const motivo = opcoes.motivo ?? "erro_tecnico";
  const aguardando = motivo === "em_preparacao";
  const precisaSuporte = motivo === "reserva_travada" || motivo === "metodo_indisponivel";
  const conteudo: Record<MotivoPagamentoIndisponivel, { titulo: string; texto: string; detalhe: string }> = {
    erro_tecnico: {
      titulo: "Não conseguimos abrir o pagamento",
      texto:
        "Seu pedido está guardado com o número acima e nada foi cobrado. Tente novamente em instantes.",
      detalhe: "Se o erro continuar, use o link do pedido para falar com a equipe sem criar outro pedido.",
    },
    em_preparacao: {
      titulo: "Estamos preparando seu pagamento",
      texto:
        "Seu pedido está guardado. Aguarde um instante; para sua segurança, não criamos uma segunda cobrança.",
      detalhe: "A página tenta novamente sozinha por alguns segundos. Você também pode tentar manualmente.",
    },
    reserva_travada: {
      titulo: "Pagamento em análise pela equipe",
      texto:
        "Seu pedido está guardado, mas esta tentativa demorou mais que o esperado. Para sua segurança, não abrimos outra cobrança automaticamente.",
      detalhe: "Fale com a equipe informando o número do pedido para liberarmos o pagamento com segurança.",
    },
    metodo_indisponivel: {
      titulo: "Método de pagamento indisponível",
      texto:
        "Seu pedido está guardado e nada foi cobrado. O método de pagamento não está disponível neste momento.",
      detalhe: "Tente novamente em instantes ou fale com a equipe pelo link do pedido.",
    },
    internacional_indisponivel: {
      titulo: "Pagamento internacional indisponível",
      texto:
        "Seu pedido está guardado, mas ainda não conseguimos abrir pagamento para este destino com segurança.",
      detalhe: "Preço, frete e país precisam estar ativos antes de cobrar um pedido internacional.",
    },
    link_bloqueado: {
      titulo: "Link de pagamento bloqueado",
      texto:
        "Seu pedido está guardado e nada foi cobrado. O link retornado pelo gateway não passou pela validação de segurança.",
      detalhe: "Tente novamente em instantes ou fale com a equipe pelo link do pedido.",
    },
  };
  const estado = conteudo[motivo];

  return (
    <main
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-5 px-6 pb-16 text-center"
      style={{ paddingTop: HEADER_HEIGHT_PX + 64 }}
    >
      <span className="eyebrow-ink">Pedido {numeroPedido}</span>
      <h1 className="font-display text-3xl text-ink">{estado.titulo}</h1>
      <p className="text-ink/70">{estado.texto}</p>
      <p className="rounded-lg border border-sand bg-paper/70 px-4 py-3 text-sm text-ink/65">
        {estado.detalhe}
      </p>
      <AutoRetryPagamento ativo={aguardando} />
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <a
          href={`/checkout/pagamento?pedido=${accessToken}`}
          className="inline-flex min-h-toque items-center justify-center rounded-xl bg-gold-metal px-5 py-3 font-semibold text-ink shadow-[0_8px_20px_-10px_rgb(var(--gold-rgb)_/_0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-glow-gold"
        >
          Tentar novamente
        </a>
        <a
          href={`/pedido/${accessToken}`}
          className="inline-flex min-h-toque items-center justify-center rounded-xl border border-ink/25 bg-paper/40 px-5 py-3 font-semibold text-ink shadow-[inset_0_1px_0_rgb(255_255_255_/_0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-deep hover:bg-paper hover:shadow-soft"
        >
          Ver meu pedido
        </a>
      </div>
      {precisaSuporte ? (
        <p className="text-sm text-ink/60">
          No link do pedido, use o atendimento com o número do pedido já identificado.
        </p>
      ) : null}
    </main>
  );
}
