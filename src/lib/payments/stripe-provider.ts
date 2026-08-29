import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ambienteAtual } from "@/lib/config/ambiente";
import type {
  CabecalhosWebhook,
  ConfirmedPayment,
  PaymentCharge,
  PaymentProvider,
  PaymentResult,
  WebhookHint,
} from "./provider";

/**
 * Adapter da Stripe — Checkout Session hospedada, para pedidos
 * INTERNACIONAIS (USD/EUR/GBP/AUD/CAD). O Brasil continua na InfinitePay.
 *
 * Fatos da documentação oficial que sustentam este arquivo (lidos em
 * 28/08/2026, docs.stripe.com/currencies e docs.stripe.com/webhooks):
 *
 *  - Conta Stripe BRASILEIRA pode COBRAR cartão estrangeiro em outras
 *    moedas (USD etc.) e LIQUIDA em BRL. Cartão emitido no Brasil é
 *    obrigado a processar em BRL — mas esse cliente compra pela
 *    InfinitePay, então o caso nem chega aqui.
 *  - O webhook da Stripe é ASSINADO: header `Stripe-Signature: t=...,v1=...`,
 *    HMAC-SHA256 de `${t}.${corpo}` com o signing secret (whsec_...) usado
 *    como chave, corpo cru em UTF-8 sem retoque. Tolerância de tempo
 *    recomendada: 5 minutos (replay protection).
 *  - Valores em unidade mínima da moeda; as seis moedas deste sistema têm
 *    todas duas casas — mesma convenção dos nossos *_cents.
 *
 * Diferente da InfinitePay, aqui a assinatura EXISTE e é validada em
 * parseWebhookHint. A reconfirmação por chamada de saída (confirmPayment)
 * continua acontecendo mesmo assim — verificação a mais nunca torna o
 * fluxo menos seguro, e mantém as duas portas idênticas entre gateways.
 */

const MOEDAS_STRIPE = new Set(["USD", "EUR", "GBP", "AUD", "CAD"]);

/** Tolerância de relógio para o timestamp assinado — recomendação da doc. */
const TOLERANCIA_SEGUNDOS = 300;

function apiBase(): string {
  const override = process.env.STRIPE_API_BASE?.trim();
  if (override) {
    // O override existe para UMA coisa: apontar o staging para um dublê de
    // teste local (fake Stripe) e provar o fluxo de ponta a ponta sem
    // credencial. Em produção isso seria um desvio de dinheiro — recusado.
    if (ambienteAtual() === "producao") {
      throw new Error("STRIPE_API_BASE não é permitida em produção.");
    }
    return override.replace(/\/$/, "");
  }
  return "https://api.stripe.com";
}

function requireSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY ausente — pagamento internacional não configurado.");
  }
  const ambiente = ambienteAtual();
  const ehLive = key.includes("_live_") || key.startsWith("sk_live");
  // Chave LIVE fora de produção cobraria cartão de verdade num ambiente de
  // teste; chave TEST em produção aprovaria "compra" sem dinheiro entrar.
  // As duas direções são fail-closed.
  if (ehLive && ambiente !== "producao") {
    throw new Error("STRIPE_SECRET_KEY live recusada fora de produção.");
  }
  if (!ehLive && ambiente === "producao") {
    throw new Error("STRIPE_SECRET_KEY de teste recusada em produção.");
  }
  return key;
}

function requireWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET ausente — webhook da Stripe não verificável.");
  }
  return secret;
}

/**
 * Serializa no formato form-encoded aninhado que a API da Stripe espera
 * (`line_items[0][price_data][currency]=usd`). Só o que este adapter usa —
 * não é um encoder genérico.
 */
export function formEncode(obj: Record<string, unknown>, prefixo = ""): string[] {
  const pares: string[] = [];
  for (const [chave, valor] of Object.entries(obj)) {
    if (valor === undefined || valor === null) continue;
    const nome = prefixo ? `${prefixo}[${chave}]` : chave;
    if (Array.isArray(valor)) {
      valor.forEach((item, i) => {
        pares.push(...formEncode(item as Record<string, unknown>, `${nome}[${i}]`));
      });
    } else if (typeof valor === "object") {
      pares.push(...formEncode(valor as Record<string, unknown>, nome));
    } else {
      pares.push(`${encodeURIComponent(nome)}=${encodeURIComponent(String(valor))}`);
    }
  }
  return pares;
}

/**
 * Verificação da assinatura do webhook, sem SDK.
 *
 * signed_payload = `${t}.${corpo cru}`; HMAC-SHA256 com o signing secret
 * (a string whsec_... inteira, como o Dashboard mostra); comparação em
 * tempo constante; timestamp dentro da tolerância (replay protection).
 * Exportada para os testes atacarem diretamente.
 */
export function assinaturaConfere(
  rawBody: string,
  header: string | null,
  secret: string,
  agoraSegundos = Math.floor(Date.now() / 1000)
): boolean {
  if (!header) return false;

  let t: string | null = null;
  const v1s: string[] = [];
  for (const parte of header.split(",")) {
    const [k, v] = parte.trim().split("=", 2);
    if (k === "t" && v) t = v;
    if (k === "v1" && v) v1s.push(v);
  }
  if (!t || v1s.length === 0) return false;

  const timestamp = Number(t);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(agoraSegundos - timestamp) > TOLERANCIA_SEGUNDOS) return false;

  const esperada = createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  const esperadaBuf = Buffer.from(esperada, "utf8");
  // Qualquer v1 válida confere (a Stripe manda mais de uma durante rotação
  // de segredo). timingSafeEqual exige buffers do mesmo tamanho.
  return v1s.some((v1) => {
    const buf = Buffer.from(v1, "utf8");
    return buf.length === esperadaBuf.length && timingSafeEqual(buf, esperadaBuf);
  });
}

interface SessaoStripe {
  id?: string;
  object?: string;
  client_reference_id?: string | null;
  payment_status?: string;
  status?: string;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
  url?: string | null;
}

/**
 * De um locale BCP-47 nosso para o que a Stripe aceita.
 *
 * A lista da Stripe não é a lista do Intl: ela conhece "pt-BR" e "pt", mas
 * não "en-AU" nem "en-CA" — manda-se "en". Locale que ela não conhece faz a
 * criação da sessão FALHAR, então o desconhecido vira "auto", que é o
 * comportamento de antes deste campo existir.
 */
export function localeDaStripe(locale: string | undefined): string {
  if (!locale) return "auto";
  const l = locale.toLowerCase();
  if (l === "pt-br") return "pt-BR";
  if (l.startsWith("pt")) return "pt";
  if (l.startsWith("en")) return "en";
  // A Stripe conhece "es" e "es-419"; "es-ES" ela NÃO aceita, e locale que
  // ela não conhece faz a criação da sessão falhar — não é degradação
  // silenciosa, é o pagamento que não abre. Por isso manda-se "es" seco.
  if (l.startsWith("es")) return "es";
  return "auto";
}

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe";

  private async chamar(caminho: string, init?: { method?: string; body?: string }) {
    const res = await fetch(`${apiBase()}${caminho}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${requireSecretKey()}`,
        ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: init?.body,
      cache: "no-store",
    });
    return res;
  }

  async createCharge(charge: PaymentCharge): Promise<PaymentResult> {
    if (!MOEDAS_STRIPE.has(charge.currency)) {
      // BRL incluído: cartão brasileiro é obrigado a processar em BRL e o
      // caminho dele é a InfinitePay. Chegar aqui com BRL é erro de rota.
      throw new Error(`Stripe não é o provider para ${charge.currency} nesta loja.`);
    }

    const somaItens = charge.items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
    if (somaItens !== charge.amountCents) {
      // As linhas SÃO o valor cobrado na Stripe (não existe amount separado
      // no modo payment com line_items). Se divergem do total do pedido, um
      // dos dois está errado — e descobrir agora é barato; descobrir na
      // fatura do cliente, não.
      throw new Error(
        `Linhas somam ${somaItens} e o pedido diz ${charge.amountCents} — cobrança abortada.`
      );
    }

    const moedaMinuscula = charge.currency.toLowerCase();
    const body = formEncode({
      mode: "payment",
      client_reference_id: charge.orderId,
      /**
       * Sem isto a Stripe usa "auto" — o idioma do NAVEGADOR. Um comprador
       * com o Chrome em português que escolheu entrega nos EUA leria o
       * checkout inteiro em inglês e a tela de pagar em português.
       *
       * A Stripe aceita "en", "pt-BR", "pt" e afins; locale desconhecido é
       * recusado com erro na criação da sessão, por isso só mandamos o que
       * a tabela de países produz.
       */
      locale: localeDaStripe(charge.locale),
      // O sucesso volta para a página do pedido (porta 2) com o id da
      // sessão — {CHECKOUT_SESSION_ID} é preenchido pela própria Stripe.
      success_url: `${charge.redirectUrl}${charge.redirectUrl.includes("?") ? "&" : "?"}cs={CHECKOUT_SESSION_ID}`,
      cancel_url: charge.redirectUrl,
      customer_email: charge.customerEmail,
      metadata: { order_id: charge.orderId, order_number: charge.orderNumber },
      // O PaymentIntent herda a referência: é por ela que um evento de
      // refund (que só conhece o PaymentIntent) reencontra o pedido.
      payment_intent_data: { metadata: { order_id: charge.orderId } },
      line_items: charge.items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: moedaMinuscula,
          unit_amount: item.priceCents,
          product_data: { name: item.description },
        },
      })),
    }).join("&");

    const res = await this.chamar("/v1/checkout/sessions", { method: "POST", body });
    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      // Log sem corpo de requisição (não tem segredo, mas tem dado de
      // cliente) e sem chave — só status e resposta de erro da Stripe.
      console.error("[stripe] falha ao criar sessão", res.status, detalhe.slice(0, 500));
      throw new Error("Não foi possível iniciar o pagamento.");
    }

    const sessao = (await res.json()) as SessaoStripe;
    if (!sessao.id || !sessao.url) {
      console.error("[stripe] sessão sem id/url");
      throw new Error("Não foi possível iniciar o pagamento.");
    }

    return { providerPaymentId: sessao.id, checkoutUrl: sessao.url };
  }

  parseWebhookHint(rawBody: string, cabecalhos?: CabecalhosWebhook): WebhookHint | null {
    // Sem assinatura válida não existe evento — nem para log de conteúdo.
    let secret: string;
    try {
      secret = requireWebhookSecret();
    } catch (erro) {
      console.error("[stripe] webhook recebido sem STRIPE_WEBHOOK_SECRET configurado", erro);
      return null;
    }
    if (!assinaturaConfere(rawBody, cabecalhos?.get("stripe-signature") ?? null, secret)) {
      return null;
    }

    let evento: {
      id?: string;
      type?: string;
      data?: { object?: SessaoStripe & { metadata?: Record<string, string> | null } };
    };
    try {
      evento = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (typeof evento.id !== "string" || typeof evento.type !== "string") return null;

    const objeto = evento.data?.object ?? {};

    // Sessão de checkout: a referência do pedido vem de client_reference_id
    // (com fallback na metadata, que também mandamos).
    const orderIdDaSessao =
      (typeof objeto.client_reference_id === "string" && objeto.client_reference_id) ||
      objeto.metadata?.order_id ||
      null;

    switch (evento.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        if (!orderIdDaSessao) return null;
        // completed com payment_status "unpaid" é pagamento assíncrono ainda
        // em curso — o evento async_payment_* dirá o desfecho. Registrar e
        // esperar; confirmar agora só gastaria uma ida ao gateway para ouvir
        // "ainda não".
        const aguardando =
          evento.type === "checkout.session.completed" && objeto.payment_status === "unpaid";
        return {
          orderId: orderIdDaSessao,
          transactionId: typeof objeto.id === "string" ? objeto.id : null,
          invoiceSlug: null,
          eventId: evento.id,
          kind: aguardando ? "ignorar" : "pagamento",
        };
      }

      case "charge.refunded": {
        const orderIdDoRefund = objeto.metadata?.order_id ?? null;
        if (!orderIdDoRefund) return null;
        return {
          orderId: orderIdDoRefund,
          transactionId: typeof objeto.payment_intent === "string" ? objeto.payment_intent : null,
          invoiceSlug: null,
          eventId: evento.id,
          kind: "reembolso",
        };
      }

      default: {
        // Evento assinado e legítimo que não muda pedido nenhum
        // (payment_intent.created, charge.succeeded, session.expired...).
        // Registrado para auditoria, nada executado.
        return {
          orderId: orderIdDaSessao ?? "",
          transactionId: null,
          invoiceSlug: null,
          eventId: evento.id,
          kind: "ignorar",
        };
      }
    }
  }

  async confirmPayment(hint: WebhookHint): Promise<ConfirmedPayment> {
    // Caminho 1 — temos o id da sessão (webhook, retorno com ?cs=, ou a
    // linha pending de payments): retrieve direto, que é forte e imediato.
    if (hint.transactionId?.startsWith("cs_")) {
      const res = await this.chamar(
        `/v1/checkout/sessions/${encodeURIComponent(hint.transactionId)}`
      );
      if (!res.ok) {
        const detalhe = await res.text().catch(() => "");
        console.error("[stripe] retrieve da sessão falhou", res.status, detalhe.slice(0, 300));
        throw new Error("Não foi possível verificar o pagamento no gateway.");
      }
      const sessao = (await res.json()) as SessaoStripe;

      // A sessão precisa SER do pedido. Uma sessão paga de outro pedido
      // (id vazado, replay de outro cliente) não confirma nada aqui.
      const referencia = sessao.client_reference_id ?? sessao.metadata?.order_id ?? null;
      if (referencia !== hint.orderId) {
        return {
          paid: false,
          paidAmountCents: null,
          currency: null,
          method: null,
          installments: null,
          raw: { motivo: "sessão não pertence ao pedido", sessao: sessao.id },
        };
      }

      return {
        paid: sessao.payment_status === "paid",
        paidAmountCents: typeof sessao.amount_total === "number" ? sessao.amount_total : null,
        currency: typeof sessao.currency === "string" ? sessao.currency.toUpperCase() : null,
        method: "stripe_checkout",
        installments: null,
        raw: sessao,
      };
    }

    // Caminho 2 — sem id de sessão (porta 2 sem ?cs= e sem linha pending):
    // busca o PaymentIntent pela metadata que gravamos na criação. A Search
    // API tem consistência eventual (~1 min); se ainda não indexou, devolve
    // "não pago" e a outra porta confirma em seguida.
    const query = `metadata['order_id']:'${hint.orderId.replace(/'/g, "")}'`;
    const res = await this.chamar(`/v1/payment_intents/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[stripe] search de payment_intents falhou", res.status, detalhe.slice(0, 300));
      throw new Error("Não foi possível verificar o pagamento no gateway.");
    }
    const busca = (await res.json()) as {
      data?: Array<{
        id?: string;
        status?: string;
        amount_received?: number;
        currency?: string;
        metadata?: Record<string, string>;
      }>;
    };
    const pago = (busca.data ?? []).find(
      (pi) => pi.status === "succeeded" && pi.metadata?.order_id === hint.orderId
    );

    if (!pago) {
      return {
        paid: false,
        paidAmountCents: null,
        currency: null,
        method: null,
        installments: null,
        raw: { motivo: "nenhum PaymentIntent succeeded para o pedido", total: busca.data?.length ?? 0 },
      };
    }

    return {
      paid: true,
      paidAmountCents: typeof pago.amount_received === "number" ? pago.amount_received : null,
      currency: typeof pago.currency === "string" ? pago.currency.toUpperCase() : null,
      method: "stripe_checkout",
      installments: null,
      raw: pago,
    };
  }
}
