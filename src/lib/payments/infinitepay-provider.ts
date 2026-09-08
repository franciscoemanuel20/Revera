import "server-only";
import type {
  ConfirmedPayment,
  PaymentCharge,
  PaymentProvider,
  PaymentResult,
  WebhookHint,
} from "./provider";
import { AmbiguousChargeError, TIMEOUT_CRIACAO_MS } from "./provider";

/**
 * Adapter da InfinitePay — Checkout hospedado (link de pagamento).
 *
 * Endpoints conforme a documentação oficial lida em 26/08/2026
 * (https://www.infinitepay.io/checkout-documentacao). NÃO invente endpoint
 * novo aqui: se precisar de algo que não está abaixo, leia a doc de novo.
 *
 *   POST https://api.checkout.infinitepay.io/links          -> cria o link
 *   POST https://api.checkout.infinitepay.io/payment_check  -> confirma pagamento
 *
 * Autenticação: a InfinitePay identifica a conta pelo `handle` (a
 * "InfiniteTag", sem o "$") enviado no corpo — não há chave secreta nem
 * Bearer token nesta API. Como consequência, o handle NÃO é segredo
 * criptográfico: ele identifica, não autentica. É mais uma razão para a
 * confirmação de pagamento nunca depender do que chega no webhook.
 */

const BASE = "https://api.checkout.infinitepay.io";

function requireHandle(): string {
  const handle = process.env.INFINITEPAY_HANDLE;
  if (!handle) {
    throw new Error(
      "INFINITEPAY_HANDLE ausente. É a InfiniteTag da conta, sem o '$'."
    );
  }
  // Se alguém colar com o "$", limpa em vez de quebrar em produção.
  return handle.replace(/^\$/, "");
}

export class InfinitePayProvider implements PaymentProvider {
  readonly name = "infinitepay";

  async createCharge(charge: PaymentCharge): Promise<PaymentResult> {
    // A InfinitePay não vende fora do Brasil (central de ajuda oficial,
    // 27/08/2026) e a API não tem campo de moeda: tudo é BRL implícito.
    // Mandar um pedido em USD para cá cobraria o número em reais — valor
    // errado numa moeda errada. Melhor recusar antes de existir cobrança.
    if (charge.currency !== "BRL") {
      throw new Error(
        `InfinitePay só processa BRL — pedido em ${charge.currency} deve ir ao provider internacional.`
      );
    }
    const body = {
      handle: requireHandle(),
      // order_nsu é o que volta no webhook — é assim que reconhecemos o
      // pedido. Mandamos o orders.id (uuid), não o número legível, porque
      // o id é a chave real e não muda.
      order_nsu: charge.orderId,
      redirect_url: charge.redirectUrl,
      webhook_url: charge.webhookUrl,
      customer: {
        name: charge.customerName,
        email: charge.customerEmail,
        phone_number: charge.customerPhone,
      },
      items: charge.items.map((item) => ({
        quantity: item.quantity,
        // preço em CENTAVOS, igual ao resto do sistema — não converter.
        price: item.priceCents,
        description: item.description,
      })),
    };

    // Fora do try de validação acima: só a CHAMADA DE REDE em si é ambígua.
    // Ver AmbiguousChargeError — se o fetch falhar aqui, não sabemos se a
    // InfinitePay chegou a criar o link do outro lado.
    //
    // `signal` com teto (achado do Codex, 08/09/2026): sem ele, uma resposta
    // realmente lenta deixava esta chamada pendurada por tempo indefinido —
    // e a idade mínima antes de liberar uma reserva travada
    // (liberarReservaTravadaAction) virava suposição, não garantia. Abortar
    // aqui é só mais um jeito de "não sabemos se criou" — cai no mesmo
    // AmbiguousChargeError de qualquer outra falha de rede.
    let res: Response;
    try {
      res = await fetch(`${BASE}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_CRIACAO_MS),
      });
    } catch (erro) {
      console.error("[infinitepay] falha de rede ao criar link", erro);
      throw new AmbiguousChargeError(
        "Falha de rede ao criar o link de pagamento.",
        { cause: erro }
      );
    }

    if (!res.ok) {
      // `res.ok` false é uma resposta HTTP que CHEGOU — o gateway recebeu a
      // requisição e respondeu que não criou nada. Erro CERTO, não ambíguo.
      // Não vaza corpo de erro do gateway para o cliente — só para o log.
      const detalhe = await res.text().catch(() => "");
      console.error("[infinitepay] falha ao criar link", res.status, detalhe);
      throw new Error("Não foi possível iniciar o pagamento.");
    }

    // `res.ok` já nos diz que a InfinitePay respondeu 2xx — ou seja, JÁ
    // CRIOU o link. Se a leitura do corpo falhar agora (conexão caiu no
    // meio da resposta), a ambiguidade muda de figura mas não desaparece:
    // sabemos que existe um link, só não sabemos qual é a URL dele. O
    // tratamento correto em src/app/checkout/pagamento/page.tsx é o mesmo
    // da falha de rede (não apagar a reserva) — por isso cai no mesmo
    // AmbiguousChargeError.
    let data: { url?: string; slug?: string };
    try {
      data = (await res.json()) as { url?: string; slug?: string };
    } catch (erro) {
      console.error("[infinitepay] falha ao ler corpo da resposta (link já pode existir)", erro);
      throw new AmbiguousChargeError(
        "A InfinitePay respondeu, mas a leitura da resposta falhou.",
        { cause: erro }
      );
    }
    if (!data.url) {
      // 2xx SEM a URL não é o mesmo tipo de certeza que um 4xx/5xx (achado
      // do Codex, 08/09/2026): o gateway disse "OK" — ele pode muito bem ter
      // criado o link e só devolvido um corpo incompleto (bug do lado dele,
      // resposta truncada). Não temos como afirmar que nada foi criado, e
      // apagar a reserva aqui tem o mesmo risco da falha de rede.
      console.error("[infinitepay] resposta 2xx sem url — gateway pode ter criado o link mesmo assim", data);
      throw new AmbiguousChargeError("A InfinitePay respondeu OK, mas sem o endereço do link de pagamento.");
    }

    return {
      // A criação do link ainda não tem transação; o id real aparece no
      // webhook (transaction_nsu). Guardamos o slug quando vier.
      providerPaymentId: data.slug ?? null,
      checkoutUrl: data.url,
    };
  }

  parseWebhookHint(rawBody: string): WebhookHint | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const p = parsed as {
      order_nsu?: unknown;
      transaction_nsu?: unknown;
      invoice_slug?: unknown;
    };

    // order_nsu é o nosso orders.id. Sem ele não há o que verificar.
    if (typeof p.order_nsu !== "string" || p.order_nsu.length === 0) {
      return null;
    }

    const transactionId =
      typeof p.transaction_nsu === "string" ? p.transaction_nsu : null;
    const invoiceSlug =
      typeof p.invoice_slug === "string" ? p.invoice_slug : null;

    return {
      orderId: p.order_nsu,
      transactionId,
      invoiceSlug,
      // Chave de idempotência: a transação é o mais específico que existe.
      // Sem ela, cai no pedido — pior granularidade, mas ainda impede
      // processar duas vezes o mesmo pedido já confirmado.
      eventId: transactionId ?? `order:${p.order_nsu}`,
    };
  }

  async confirmPayment(hint: WebhookHint): Promise<ConfirmedPayment> {
    const res = await fetch(`${BASE}/payment_check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: requireHandle(),
        order_nsu: hint.orderId,
        transaction_nsu: hint.transactionId,
        slug: hint.invoiceSlug,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      // Não conseguir verificar NÃO é o mesmo que "não foi pago": devolver
      // paid=false aqui é o comportamento seguro (não marca como pago), e a
      // rota responde 400 para a InfinitePay reenviar o aviso depois.
      const detalhe = await res.text().catch(() => "");
      console.error("[infinitepay] payment_check falhou", res.status, detalhe);
      throw new Error("Não foi possível verificar o pagamento no gateway.");
    }

    const data = (await res.json()) as {
      success?: boolean;
      paid?: boolean;
      paid_amount?: number;
      amount?: number;
      capture_method?: string;
      installments?: number;
    };

    return {
      paid: data.success === true && data.paid === true,
      // A API não devolve moeda porque só existe uma: a conta InfinitePay
      // opera exclusivamente em BRL. Declarar aqui (em vez de null) liga a
      // conferência de moeda em confirmarPagamento() também para o fluxo
      // nacional.
      currency: "BRL",
      paidAmountCents:
        typeof data.paid_amount === "number"
          ? data.paid_amount
          : typeof data.amount === "number"
            ? data.amount
            : null,
      method: typeof data.capture_method === "string" ? data.capture_method : null,
      installments:
        typeof data.installments === "number" ? data.installments : null,
      raw: data,
    };
  }
}
