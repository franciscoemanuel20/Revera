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

const EVENTOS_DE_CAPTURA = new Set([
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.DECLINED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
]);

export type EstadoCapturaPayPal =
  | { estado: "concluida" }
  | { estado: "aprovada_sem_captura" }
  | { estado: "pendente"; motivo: string | null }
  | { estado: "recusada"; motivo: string | null }
  | { estado: "reembolsada" }
  | { estado: "parcialmente_reembolsada" }
  | { estado: "estornada"; motivo: string | null }
  | { estado: "desconhecida"; status: string }
  | { estado: "sem_captura"; statusOrdem: string | null }
  | { estado: "outro_pedido" };

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

// Países em que o PayPal exige estado/província (admin_area_1) no endereço.
const PAISES_COM_REGIAO_OBRIGATORIA = new Set(["US", "CA", "AU"]);

function campo(valor: string | null | undefined, max: number): string | undefined {
  const limpo = valor?.replace(/\s+/g, " ").trim();
  return limpo ? limpo.slice(0, max) : undefined;
}

/**
 * Endereço de entrega no formato do Orders v2, ou null quando falta algo.
 *
 * Por que existe (06/10/2026): a ordem era criada com NO_SHIPPING e sem
 * endereço, e o PayPal mostrava na transação "Pagamentos sem endereço de
 * entrega não são cobertos pela Proteção ao Vendedor". Produto físico enviado
 * por DHL ao exterior sem essa proteção perde qualquer disputa de "não
 * recebi".
 *
 * Endereço incompleto devolve null e a ordem segue como antes (NO_SHIPPING):
 * mandar endereço pela metade faz o PayPal recusar a ordem (422), e aí o
 * cliente não pagaria nada. Perder a proteção num caso raro é melhor que
 * perder a venda.
 */
export function enderecoEntregaPayPal(
  endereco: PaymentCharge["shippingAddress"]
): Record<string, unknown> | null {
  if (!endereco) return null;
  const pais = campo(endereco.countryCode, 2)?.toUpperCase();
  const linha1 = campo(endereco.line1, 300);
  const cidade = campo(endereco.city, 120);
  const cep = campo(endereco.postalCode, 60);
  const regiao = campo(endereco.region, 300);
  const nome = campo(endereco.recipientName, 300);
  if (!pais || !/^[A-Z]{2}$/.test(pais) || pais === "BR") return null;
  if (!linha1 || !cidade || !cep) return null;
  if (PAISES_COM_REGIAO_OBRIGATORIA.has(pais) && !regiao) return null;
  const linha2 = campo(endereco.line2, 300);
  return {
    type: "SHIPPING",
    ...(nome ? { name: { full_name: nome } } : {}),
    address: {
      address_line_1: linha1,
      ...(linha2 ? { address_line_2: linha2 } : {}),
      admin_area_2: cidade,
      ...(regiao ? { admin_area_1: regiao } : {}),
      postal_code: cep,
      country_code: pais,
    },
  };
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
        status_details?: { reason?: string } | null;
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
    links?: Array<{ href?: string; rel?: string }>;
  };
}

/**
 * Id da captura a que o evento se refere. No REFUNDED o resource é o
 * REEMBOLSO: a captura só aparece no link rel="up". Nos demais, o resource
 * é a própria captura.
 */
function capturaDoEvento(evento: EventoPayPal): string | null {
  const up = evento.resource?.links?.find((l) => l.rel === "up")?.href ?? "";
  const doLink = /\/captures\/([^/?#]+)/.exec(up)?.[1];
  if (doLink) return decodeURIComponent(doLink);
  return evento.event_type === "PAYMENT.CAPTURE.REFUNDED" ? null : evento.resource?.id ?? null;
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
      signal: AbortSignal.timeout(TIMEOUT_CRIACAO_MS),
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

  private async chamar(caminho: string, init?: { method?: string; body?: unknown; signal?: AbortSignal; requestId?: string }) {
    const token = await this.accessToken();
    return fetch(`${apiBase()}${caminho}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_CRIACAO_MS),
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
    // Orders v2 do PayPal expiram em 3 horas. `expiresAt` é o limite total
    // da cotação; deve restar o TTL integral do PayPal mais o teto de criação
    // para que a ordem expire antes da janela operacional da loja.
    if (!charge.expiresAt || !Number.isFinite(charge.expiresAt.getTime())) {
      throw new Error("Validade do checkout PayPal ausente ou inválida.");
    }
    const restante = charge.expiresAt.getTime() - Date.now();
    const minimo = 3 * 60 * 60_000 + TIMEOUT_CRIACAO_MS;
    const maximo = 6 * 60 * 60_000 + TIMEOUT_CRIACAO_MS + 30_000;
    if (restante < minimo || restante > maximo) {
      throw new Error("Validade do checkout PayPal incompatível com a cotação.");
    }

    assertAmbientePermitido();
    requireClientId();
    requireClientSecret();

    // Com endereço completo, o PayPal grava a entrega na transação e trava a
    // troca (SET_PROVIDED_ADDRESS): o endereço cotado na DHL é o que vale.
    const entrega = enderecoEntregaPayPal(charge.shippingAddress);

    const corpo = (comEntrega: boolean) => ({
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
          ...(comEntrega && entrega ? { shipping: entrega } : {}),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Revera",
            locale: localePayPal(charge.locale),
            landing_page: "LOGIN",
            shipping_preference: comEntrega && entrega ? "SET_PROVIDED_ADDRESS" : "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: charge.redirectUrl,
            cancel_url: charge.redirectUrl,
          },
        },
      },
    });

    const criar = async (comEntrega: boolean, recuperacao = false): Promise<Response> => {
      try {
        return await this.chamar("/v2/checkout/orders", {
          method: "POST",
          // Id próprio para a tentativa sem endereço: o PayPal guarda a
          // resposta por Request-Id, e repetir o id da tentativa recusada
          // devolveria a mesma recusa.
          requestId: recuperacao ? `${charge.orderId}:sem-entrega` : charge.orderId,
          signal: AbortSignal.timeout(TIMEOUT_CRIACAO_MS),
          body: corpo(comEntrega),
        });
      } catch (erro) {
        console.error("[paypal] falha de rede ao criar order", erro);
        throw new AmbiguousChargeError("Falha de rede ao criar a ordem PayPal.", { cause: erro });
      }
    };

    let res = await criar(Boolean(entrega));

    // Endereço recusado (4xx) NÃO pode travar a venda. O estado é texto livre
    // no checkout ("New York" em vez de "NY") e o PayPal só aceita código.
    // 4xx garante que nenhuma ordem foi criada, então tentar de novo sem
    // endereço não cobra duas vezes; perde-se só a Proteção ao Vendedor
    // nesta venda — o comportamento de antes de 06/10/2026.
    if (!res.ok && entrega && res.status >= 400 && res.status < 500) {
      const detalhe = await res.text().catch(() => "");
      console.error("[paypal] endereço recusado; criando sem entrega", res.status, detalhe.slice(0, 500));
      res = await criar(false, true);
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

    const checkoutUrl = ordem.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
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

    // Retida, recusada, reembolsada, estornada (06/10/2026). O aviso só diz
    // QUAL pedido olhar: o que fazer sai de reavaliarCapturaPayPal(), que
    // pergunta ao PayPal o estado real da captura. Até essa data esses
    // eventos caíam em "ignorar" e um estorno no PayPal deixava o pedido
    // "pago" no painel — pronto para despachar uma peça sem dinheiro.
    if (EVENTOS_DE_CAPTURA.has(evento.event_type)) {
      // Nunca null: um evento assinado que não sabemos ler vira 200 "ignorar",
      // não 400 — 400 faz o PayPal reenviar por dias.
      const orderId = evento.resource?.custom_id ?? "";
      const paypalOrderId = evento.resource?.supplementary_data?.related_ids?.order_id ?? null;
      const captura = capturaDoEvento(evento);
      if (!orderId && !paypalOrderId && !captura) {
        return { orderId: "", transactionId: null, invoiceSlug: null, eventId: evento.id, kind: "ignorar" };
      }
      return {
        orderId,
        transactionId: paypalOrderId,
        // Para o REFUNDED sem custom_id: a rota resolve o pedido pela captura.
        invoiceSlug: captura,
        eventId: evento.id,
        kind: "captura_paypal",
        eventoGateway: evento.event_type,
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

  /**
   * Estado REAL da captura de uma ordem, lido do PayPal (nunca do aviso).
   * Confere que a ordem é deste pedido antes de responder.
   */
  async estadoCaptura(
    paypalOrderId: string,
    pedidoId: string,
    opcoes?: { timeoutMs?: number }
  ): Promise<EstadoCapturaPayPal> {
    const ordem = await this.buscarOrdem(
      paypalOrderId,
      opcoes?.timeoutMs ? AbortSignal.timeout(opcoes.timeoutMs) : undefined
    );
    if (ordem.purchase_units?.[0]?.custom_id !== pedidoId) return { estado: "outro_pedido" };
    if (ordem.status === "APPROVED") return { estado: "aprovada_sem_captura" };
    const captura = ordem.purchase_units?.[0]?.payments?.captures?.[0];
    if (!captura?.status) return { estado: "sem_captura", statusOrdem: ordem.status ?? null };
    const motivo = captura.status_details?.reason ?? null;
    switch (captura.status) {
      case "COMPLETED":
        return { estado: "concluida" };
      case "PENDING":
        return { estado: "pendente", motivo };
      case "DECLINED":
      case "FAILED":
        return { estado: "recusada", motivo };
      case "REFUNDED":
        return { estado: "reembolsada" };
      case "PARTIALLY_REFUNDED":
        return { estado: "parcialmente_reembolsada" };
      case "REVERSED":
        return { estado: "estornada", motivo: captura.status };
      default:
        // Status que o PayPal venha a criar: não mexe no pedido, só avisa.
        return { estado: "desconhecida", status: captura.status };
    }
  }

  /** Pedido e ordem de uma captura (GET /v2/payments/captures/{id}). */
  async pedidoDaCaptura(captureId: string): Promise<{ orderId: string | null; paypalOrderId: string | null }> {
    const res = await this.chamar(`/v2/payments/captures/${encodeURIComponent(captureId)}`);
    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[paypal] retrieve da captura falhou", res.status, detalhe.slice(0, 300));
      throw new Error("Não foi possível ler a captura no PayPal.");
    }
    const c = (await res.json()) as {
      custom_id?: string;
      supplementary_data?: { related_ids?: { order_id?: string } };
    };
    return {
      orderId: c.custom_id ?? null,
      paypalOrderId: c.supplementary_data?.related_ids?.order_id ?? null,
    };
  }

  async verificarWebhook(rawBody: string, headers: Headers): Promise<boolean> {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
    const transmissionId = headers.get("paypal-transmission-id");
    const transmissionTime = headers.get("paypal-transmission-time");
    const transmissionSig = headers.get("paypal-transmission-sig");
    const certUrl = headers.get("paypal-cert-url");
    const authAlgo = headers.get("paypal-auth-algo");
    if (!webhookId || !transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) return false;
    const res = await this.chamar("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: {
        webhook_id: webhookId,
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        transmission_sig: transmissionSig,
        cert_url: certUrl,
        auth_algo: authAlgo,
        webhook_event: JSON.parse(rawBody),
      },
    });
    if (!res.ok) throw new Error("Não foi possível verificar a assinatura PayPal.");
    const json = (await res.json()) as { verification_status?: string };
    return json.verification_status === "SUCCESS";
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

  /**
   * Informa ao PayPal o rastreio DHL de uma ordem já paga.
   *
   * Por que existe (06/10/2026): a primeira venda internacional ficou com o
   * saldo "ainda não disponível" (retenção de vendedor novo). O PayPal libera
   * mais cedo quando a transação tem rastreio, e numa disputa de "não
   * recebi" o rastreio é a prova da entrega.
   *
   * Confere que a ordem pertence ao pedido (custom_id) antes de escrever:
   * um ID trocado não pode carimbar rastreio na venda de outro cliente.
   * `notify_payer: false` — quem avisa o cliente é a Reverá, uma vez só.
   */
  async adicionarRastreio(
    paypalOrderId: string,
    pedidoId: string,
    numeroRastreio: string
  ): Promise<{ ok: true } | { ok: false; motivo: string }> {
    const ordem = await this.buscarOrdem(paypalOrderId);
    if (ordem.purchase_units?.[0]?.custom_id !== pedidoId) {
      return { ok: false, motivo: "A ordem PayPal não pertence a este pedido." };
    }
    const captura = ordem.purchase_units?.[0]?.payments?.captures?.find(
      (c) => c.status === "COMPLETED"
    );
    if (ordem.status !== "COMPLETED" || !captura?.id) {
      return { ok: false, motivo: "O pagamento ainda não está concluído no PayPal." };
    }
    const res = await this.chamar(
      `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/track`,
      {
        method: "POST",
        requestId: `track-${paypalOrderId}-${numeroRastreio}`,
        body: {
          capture_id: captura.id,
          tracking_number: numeroRastreio,
          carrier: "DHL",
          notify_payer: false,
        },
      }
    );
    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[paypal] rastreio recusado", res.status, detalhe.slice(0, 300));
      return { ok: false, motivo: `O PayPal recusou o rastreio (HTTP ${res.status}).` };
    }
    return { ok: true };
  }

  private async buscarOrdem(orderId: string, signal?: AbortSignal): Promise<OrdemPayPal> {
    const res = await this.chamar(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, signal ? { signal } : undefined);
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
      requestId: `capture-${orderId}`,
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
