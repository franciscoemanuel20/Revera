import "server-only";
import { ambienteAtual } from "@/lib/config/ambiente";
import type {
  CabecalhosWebhook,
  ConfirmedPayment,
  PaymentCharge,
  PaymentProvider,
  PaymentResult,
  WebhookHint,
} from "./provider";
import { AmbiguousChargeError, TIMEOUT_CRIACAO_MS } from "./provider";

const MOEDAS_PAYPAL = new Set(["USD", "EUR", "GBP", "AUD", "CAD"]);

function paypalEnv(): "live" | "sandbox" {
  const env = process.env.PAYPAL_ENV?.trim().toLowerCase();
  if (env === "sandbox" || env === "live") return env;
  return ambienteAtual() === "producao" ? "live" : "sandbox";
}

function apiBase(): string {
  return paypalEnv() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function requireClientId(): string {
  const id = process.env.PAYPAL_CLIENT_ID?.trim();
  if (!id) throw new Error("PAYPAL_CLIENT_ID ausente — PayPal internacional não configurado.");
  return id;
}

function requireClientSecret(): string {
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("PAYPAL_CLIENT_SECRET ausente — PayPal internacional não configurado.");
  return secret;
}

function assertAmbientePermitido() {
  const env = paypalEnv();
  const ambiente = ambienteAtual();
  if (ambiente === "producao" && env !== "live") {
    throw new Error("PAYPAL_ENV=sandbox recusado em produção.");
  }
  if (ambiente !== "producao" && env === "live") {
    throw new Error("PAYPAL_ENV=live recusado fora de produção.");
  }
}

function valorPayPal(cents: number): string {
  return (cents / 100).toFixed(2);
}

function urlCheckoutPayPalSegura(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (ambienteAtual() === "producao") return u.hostname === "www.paypal.com";
    return u.hostname === "www.paypal.com" || u.hostname === "www.sandbox.paypal.com";
  } catch {
    return false;
  }
}

interface OrdemPayPal {
  id?: string;
  status?: string;
  links?: Array<{ href?: string; rel?: string }>;
  purchase_units?: Array<{
    custom_id?: string;
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: { currency_code?: string; value?: string };
        seller_receivable_breakdown?: {
          gross_amount?: { currency_code?: string; value?: string };
        };
      }>;
    };
  }>;
}

interface EventoPayPal {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    invoice_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
    purchase_units?: OrdemPayPal["purchase_units"];
    amount?: { currency_code?: string; value?: string };
  };
}

export class PayPalProvider implements PaymentProvider {
  readonly name = "paypal";

  private token: { accessToken: string; expiresAt: number } | null = null;

  async disponivel(): Promise<boolean> {
    try {
      await this.accessToken();
      return true;
    } catch {
      return false;
    }
  }

  private async accessToken(): Promise<string> {
    assertAmbientePermitido();
    requireClientId();
    requireClientSecret();

    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.accessToken;
    }

    const credenciais = Buffer.from(`${requireClientId()}:${requireClientSecret()}`).toString("base64");
    const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credenciais}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[paypal] falha ao obter token", res.status, detalhe.slice(0, 300));
      throw new Error("Não foi possível autenticar no PayPal.");
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error("PayPal não retornou access_token.");
    this.token = {
      accessToken: json.access_token,
      expiresAt: Date.now() + ((json.expires_in ?? 300) - 30) * 1000,
    };
    return json.access_token;
  }

  private async chamar(caminho: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }) {
    const token = await this.accessToken();
    return fetch(`${apiBase()}${caminho}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: init?.signal,
    });
  }

  async createCharge(charge: PaymentCharge): Promise<PaymentResult> {
    if (!MOEDAS_PAYPAL.has(charge.currency)) {
      throw new Error(`PayPal internacional não está habilitado para ${charge.currency}.`);
    }

    const somaItens = charge.items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
    if (somaItens !== charge.amountCents) {
      throw new Error(
        `Linhas somam ${somaItens} e o pedido diz ${charge.amountCents} — cobrança PayPal abortada.`
      );
    }

    assertAmbientePermitido();
    requireClientId();
    requireClientSecret();

    let res: Response;
    try {
      res = await this.chamar("/v2/checkout/orders", {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_CRIACAO_MS),
        body: {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: charge.orderId,
              custom_id: charge.orderId,
              invoice_id: charge.orderNumber,
              description: `Pedido ${charge.orderNumber} - Revera`,
              amount: {
                currency_code: charge.currency,
                value: valorPayPal(charge.amountCents),
              },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: "Revera",
                locale: localePayPal(charge.locale),
                landing_page: "LOGIN",
                shipping_preference: "NO_SHIPPING",
                user_action: "PAY_NOW",
                return_url: charge.redirectUrl,
                cancel_url: charge.redirectUrl,
              },
            },
          },
        },
      });
    } catch (erro) {
      console.error("[paypal] falha de rede ao criar order", erro);
      throw new AmbiguousChargeError("Falha de rede ao criar a ordem PayPal.", { cause: erro });
    }

    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[paypal] falha ao criar order", res.status, detalhe.slice(0, 500));
      if (res.status >= 500) {
        throw new AmbiguousChargeError(
          `PayPal respondeu ${res.status} ao criar order — pode ter criado mesmo assim.`
        );
      }
      throw new Error("Não foi possível iniciar o pagamento no PayPal.");
    }

    let ordem: OrdemPayPal;
    try {
      ordem = (await res.json()) as OrdemPayPal;
    } catch (erro) {
      throw new AmbiguousChargeError("PayPal respondeu, mas a leitura da order falhou.", {
        cause: erro,
      });
    }

    const checkoutUrl = ordem.links?.find((l) => l.rel === "approve")?.href;
    if (!ordem.id || !checkoutUrl || !urlCheckoutPayPalSegura(checkoutUrl)) {
      throw new AmbiguousChargeError("PayPal respondeu sem link de aprovação seguro.");
    }

    return { providerPaymentId: ordem.id, checkoutUrl };
  }

  parseWebhookHint(rawBody: string, _cabecalhos?: CabecalhosWebhook): WebhookHint | null {
    let evento: EventoPayPal;
    try {
      evento = JSON.parse(rawBody) as EventoPayPal;
    } catch {
      return null;
    }
    if (!evento.id || !evento.event_type) return null;

    if (evento.event_type === "CHECKOUT.ORDER.APPROVED") {
      const orderId = evento.resource?.purchase_units?.[0]?.custom_id ?? evento.resource?.custom_id;
      const paypalOrderId = evento.resource?.id;
      if (!orderId || !paypalOrderId) return null;
      return {
        orderId,
        transactionId: paypalOrderId,
        invoiceSlug: null,
        eventId: evento.id,
        kind: "pagamento",
      };
    }

    if (evento.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const orderId = evento.resource?.custom_id ?? "";
      const paypalOrderId = evento.resource?.supplementary_data?.related_ids?.order_id;
      if (!paypalOrderId) return null;
      return {
        orderId,
        transactionId: paypalOrderId,
        invoiceSlug: evento.resource?.id ?? null,
        eventId: evento.id,
        kind: "pagamento",
      };
    }

    return {
      orderId: evento.resource?.custom_id ?? "",
      transactionId: evento.resource?.id ?? null,
      invoiceSlug: null,
      eventId: evento.id,
      kind: "ignorar",
    };
  }

  async confirmPayment(hint: WebhookHint): Promise<ConfirmedPayment> {
    if (!hint.transactionId) {
      return {
        paid: false,
        paidAmountCents: null,
        currency: null,
        method: null,
        installments: null,
        raw: { motivo: "sem order id PayPal" },
      };
    }

    let ordem = await this.buscarOrdem(hint.transactionId);
    if (ordem.purchase_units?.[0]?.custom_id !== hint.orderId) {
      return {
        paid: false,
        paidAmountCents: null,
        currency: null,
        method: null,
        installments: null,
        raw: { motivo: "order PayPal não pertence ao pedido", ordem: ordem.id },
      };
    }

    if (ordem.status === "APPROVED") {
      ordem = await this.capturarOrdem(hint.transactionId);
    }

    const captura = ordem.purchase_units?.[0]?.payments?.captures?.find(
      (c) => c.status === "COMPLETED"
    );
    const amount = captura?.amount ?? captura?.seller_receivable_breakdown?.gross_amount;
    return {
      paid: ordem.status === "COMPLETED" && captura?.status === "COMPLETED",
      paidAmountCents: amount?.value ? Math.round(Number(amount.value) * 100) : null,
      currency: amount?.currency_code?.toUpperCase() ?? null,
      method: "paypal",
      installments: null,
      raw: ordem,
    };
  }

  private async buscarOrdem(orderId: string): Promise<OrdemPayPal> {
    const res = await this.chamar(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[paypal] retrieve da order falhou", res.status, detalhe.slice(0, 300));
      throw new Error("Não foi possível verificar o pagamento no PayPal.");
    }
    return (await res.json()) as OrdemPayPal;
  }

  private async capturarOrdem(orderId: string): Promise<OrdemPayPal> {
    const res = await this.chamar(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      body: {},
    });
    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[paypal] captura da order falhou", res.status, detalhe.slice(0, 300));
      throw new Error("Não foi possível capturar o pagamento no PayPal.");
    }
    return (await res.json()) as OrdemPayPal;
  }
}

function localePayPal(locale: string | undefined): string {
  const l = locale?.toLowerCase() ?? "";
  if (l.startsWith("es")) return "es-ES";
  if (l.startsWith("pt")) return "pt-BR";
  return "en-US";
}

export { urlCheckoutPayPalSegura };
