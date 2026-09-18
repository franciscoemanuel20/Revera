import "server-only";
import type {
  CabecalhosWebhook,
  ConfirmedPayment,
  PaymentCharge,
  PaymentProvider,
  PaymentResult,
  WebhookHint,
} from "./provider";
import { AmbiguousChargeError, TIMEOUT_CRIACAO_MS } from "./provider";
import { ambienteAtual } from "@/lib/config/ambiente";

/**
 * Adapter do Asaas Checkout hospedado.
 *
 * Contrato oficial consultado em 12/09/2026:
 * - POST /v3/checkouts cria a sessão hospedada, mas NÃO confirma pagamento.
 * - O link público é https://asaas.com/checkoutSession/show?id=<id>.
 * - A confirmação financeira deve vir por webhook/API; callback de navegador
 *   não é confirmação.
 *
 * Mantemos a disciplina do fluxo atual: webhook/callback só dá pistas, e quem
 * autoriza `payment_status = paid` é `confirmPayment()` consultando o Asaas.
 */

const API_PRODUCAO = "https://api.asaas.com/v3";
const CHECKOUT_PRODUCAO = "https://asaas.com/checkoutSession/show";
const CHECKOUT_EXPIRA_MINUTOS_PADRAO = 60;

function apiBase(): string {
  const override = process.env.ASAAS_API_BASE?.trim();
  if (override) {
    if (ambienteAtual() === "producao") {
      throw new Error("ASAAS_API_BASE não é permitida em produção.");
    }
    return override.replace(/\/$/, "");
  }
  return API_PRODUCAO;
}

function checkoutBase(): string {
  const override = process.env.ASAAS_CHECKOUT_BASE?.trim();
  if (override) {
    if (ambienteAtual() === "producao") {
      throw new Error("ASAAS_CHECKOUT_BASE não é permitida em produção.");
    }
    return override.replace(/\/$/, "");
  }
  return CHECKOUT_PRODUCAO;
}

function minutosParaExpirarCheckout(): number {
  const bruto = process.env.ASAAS_CHECKOUT_EXPIRA_MINUTOS?.trim();
  if (!bruto) return CHECKOUT_EXPIRA_MINUTOS_PADRAO;
  const minutos = Number(bruto);
  if (!Number.isFinite(minutos)) return CHECKOUT_EXPIRA_MINUTOS_PADRAO;
  return Math.min(1440, Math.max(10, Math.trunc(minutos)));
}

function requireApiKey(): string {
  const token = process.env.ASAAS_API_KEY?.trim();
  if (!token) throw new Error("ASAAS_API_KEY ausente.");
  return token;
}

function valorDecimal(centavos: number): number {
  return Math.round(centavos) / 100;
}

function telefoneSemRuido(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digitos = phone.replace(/\D/g, "");
  return digitos || undefined;
}

function soDigitos(valor: string | undefined | null): string | undefined {
  if (!valor) return undefined;
  const digitos = valor.replace(/\D/g, "");
  return digitos || undefined;
}

function textoOuNada(valor: string | undefined | null): string | undefined {
  const limpo = valor?.trim();
  return limpo || undefined;
}

function limitarTexto(valor: string | undefined | null, maximo: number): string | undefined {
  const limpo = textoOuNada(valor);
  return limpo ? limpo.slice(0, maximo) : undefined;
}

type AsaasCheckoutCriado = {
  id?: string;
  link?: string;
  status?: string;
  externalReference?: string;
};

type AsaasWebhookConfig = {
  id?: string;
  name?: string;
  url?: string;
  email?: string;
  hasAuthToken?: boolean;
  enabled?: boolean;
  interrupted?: boolean;
  events?: string[];
};

type AsaasPayment = {
  id?: string;
  checkoutSession?: string;
  externalReference?: string;
  status?: string;
  value?: number;
  netValue?: number;
  billingType?: string;
  installmentNumber?: number;
};

type AsaasWebhook = {
  id?: unknown;
  event?: unknown;
  checkout?: {
    id?: unknown;
    externalReference?: unknown;
  };
  payment?: AsaasPayment;
};

const STATUS_PAGO = new Set(["RECEIVED", "CONFIRMED"]);
const STATUS_CHECKOUT_ENCERRADO = new Set(["EXPIRED", "CANCELED", "CANCELLED"]);
const EVENTOS_CHECKOUT_OBRIGATORIOS = ["CHECKOUT_PAID", "CHECKOUT_CANCELED", "CHECKOUT_EXPIRED"];
const NOME_WEBHOOK_CHECKOUT = "Revera - Checkout produção";

export class AsaasProvider implements PaymentProvider {
  readonly name = "asaas";

  async createCharge(charge: PaymentCharge): Promise<PaymentResult> {
    if (charge.currency !== "BRL") {
      throw new Error(
        `Asaas nacional só processa BRL — pedido em ${charge.currency} deve ir ao provider internacional.`
      );
    }

    const items = itensComAjusteDeTotal(charge);

    const body = {
      billingTypes: ["PIX", "CREDIT_CARD"],
      chargeTypes: ["DETACHED"],
      minutesToExpire: minutosParaExpirarCheckout(),
      externalReference: charge.orderId,
      callback: {
        successUrl: charge.redirectUrl,
        cancelUrl: charge.redirectUrl,
        expiredUrl: charge.redirectUrl,
      },
      customerData: {
        name: limitarTexto(charge.customerName, 30),
        email: charge.customerEmail,
        cpfCnpj: soDigitos(charge.customerDocument),
        phone: telefoneSemRuido(charge.customerPhone),
        address: textoOuNada(charge.customerAddress?.street),
        addressNumber: textoOuNada(charge.customerAddress?.number),
        complement: textoOuNada(charge.customerAddress?.complement),
        province: textoOuNada(charge.customerAddress?.neighborhood),
        postalCode: soDigitos(charge.customerAddress?.postalCode),
      },
      items,
    };

    await exigirWebhookConfigurado(charge.webhookUrl);

    let res: Response;
    try {
      res = await fetch(`${apiBase()}/checkouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: requireApiKey(),
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_CRIACAO_MS),
      });
    } catch (erro) {
      console.error("[asaas] falha de rede ao criar checkout", erro);
      throw new AmbiguousChargeError(
        "Falha de rede ao criar o checkout de pagamento.",
        { cause: erro }
      );
    }

    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[asaas] falha ao criar checkout", res.status, detalhe);
      if (res.status >= 500) {
        throw new AmbiguousChargeError(
          `O Asaas respondeu ${res.status} ao criar o checkout — pode ter criado mesmo assim.`
        );
      }
      throw new Error("Não foi possível iniciar o pagamento.");
    }

    let data: AsaasCheckoutCriado;
    try {
      data = (await res.json()) as AsaasCheckoutCriado;
    } catch (erro) {
      console.error("[asaas] falha ao ler corpo da resposta (checkout já pode existir)", erro);
      throw new AmbiguousChargeError(
        "O Asaas respondeu, mas a leitura da resposta falhou.",
        { cause: erro }
      );
    }

    if (!data.id) {
      console.error("[asaas] resposta 2xx sem id — checkout pode ter sido criado mesmo assim", data);
      throw new AmbiguousChargeError("O Asaas respondeu OK, mas sem o id do checkout.");
    }

    return {
      providerPaymentId: data.id,
      checkoutUrl: data.link ?? `${checkoutBase()}?id=${encodeURIComponent(data.id)}`,
    };
  }

  parseWebhookHint(rawBody: string, cabecalhos?: CabecalhosWebhook): WebhookHint | null {
    const tokenEsperado = process.env.ASAAS_WEBHOOK_AUTH_TOKEN?.trim();
    if (!tokenEsperado || cabecalhos?.get("asaas-access-token") !== tokenEsperado) {
      return null;
    }

    let parsed: AsaasWebhook;
    try {
      parsed = JSON.parse(rawBody) as AsaasWebhook;
    } catch {
      return null;
    }

    const checkoutId =
      typeof parsed.checkout?.id === "string"
        ? parsed.checkout.id
        : typeof parsed.payment?.checkoutSession === "string"
          ? parsed.payment.checkoutSession
          : null;
    const orderId =
      typeof parsed.checkout?.externalReference === "string"
        ? parsed.checkout.externalReference
        : typeof parsed.payment?.externalReference === "string"
          ? parsed.payment.externalReference
          : null;

    if (!checkoutId || !orderId) return null;

    const evento = typeof parsed.event === "string" ? parsed.event : "asaas.event";
    const eventId =
      typeof parsed.id === "string"
        ? parsed.id
        : [evento, checkoutId, parsed.payment?.id].filter(Boolean).join(":");

    const kind =
      evento === "CHECKOUT_PAID"
        ? "pagamento"
        : evento === "CHECKOUT_CANCELED" || evento === "CHECKOUT_EXPIRED"
          ? "checkout_expirado"
          : "ignorar";

    return {
      orderId,
      transactionId: checkoutId,
      invoiceSlug: typeof parsed.payment?.id === "string" ? parsed.payment.id : null,
      eventId,
      kind,
    };
  }

  async confirmPayment(hint: WebhookHint): Promise<ConfirmedPayment> {
    const params = new URLSearchParams();
    if (hint.invoiceSlug) {
      return this.confirmarPagamentoPorId(hint.invoiceSlug, hint);
    }
    if (hint.transactionId) params.set("checkoutSession", hint.transactionId);
    else params.set("externalReference", hint.orderId);
    params.set("limit", "10");

    const res = await fetch(`${apiBase()}/payments?${params.toString()}`, {
      method: "GET",
      headers: { access_token: requireApiKey() },
      cache: "no-store",
    });

    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[asaas] consulta de pagamentos falhou", res.status, detalhe);
      throw new Error("Não foi possível verificar o pagamento no Asaas.");
    }

    const data = (await res.json()) as { data?: AsaasPayment[] };
    const pagamentos = Array.isArray(data.data) ? data.data : [];
    const pagamento =
      pagamentos.find((p) => pagamentoPertenceAoPedido(p, hint) && STATUS_PAGO.has(p.status ?? "")) ??
      pagamentos.find((p) => pagamentoPertenceAoPedido(p, hint));

    return confirmarPorObjeto(pagamento);
  }

  private async confirmarPagamentoPorId(paymentId: string, hint: WebhookHint): Promise<ConfirmedPayment> {
    const res = await fetch(`${apiBase()}/payments/${encodeURIComponent(paymentId)}`, {
      method: "GET",
      headers: { access_token: requireApiKey() },
      cache: "no-store",
    });

    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[asaas] consulta de pagamento por id falhou", res.status, detalhe);
      throw new Error("Não foi possível verificar o pagamento no Asaas.");
    }

    const pagamento = (await res.json()) as AsaasPayment;
    if (!pagamentoPertenceAoPedido(pagamento, hint)) {
      console.error("[asaas] pagamento retornado não pertence ao pedido informado", {
        orderId: hint.orderId,
        transactionId: hint.transactionId,
        paymentId,
        externalReference: pagamento.externalReference,
        checkoutSession: pagamento.checkoutSession,
      });
      return {
        paid: false,
        paidAmountCents: null,
        currency: "BRL",
        method: null,
        installments: null,
        raw: { pagamento, recusado: "referencia_divergente" },
      };
    }

    return confirmarPorObjeto(pagamento);
  }

  async confirmCheckoutExpired(hint: WebhookHint): Promise<boolean> {
    if (!hint.transactionId) return false;

    const res = await fetch(`${apiBase()}/checkouts/${encodeURIComponent(hint.transactionId)}`, {
      method: "GET",
      headers: { access_token: requireApiKey() },
      cache: "no-store",
    });

    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      console.error("[asaas] consulta de checkout falhou", res.status, detalhe);
      throw new Error("Não foi possível verificar o checkout no Asaas.");
    }

    const checkout = (await res.json()) as AsaasCheckoutCriado;
    return (
      checkout.id === hint.transactionId &&
      checkout.externalReference === hint.orderId &&
      STATUS_CHECKOUT_ENCERRADO.has(checkout.status ?? "")
    );
  }
}

function itensComAjusteDeTotal(charge: PaymentCharge) {
  const items = charge.items.flatMap((item, indice) =>
    Array.from({ length: item.quantity }, (_, unidade) => ({
      externalReference:
        item.quantity === 1
          ? `${charge.orderId}:${indice + 1}`
          : `${charge.orderId}:${indice + 1}.${unidade + 1}`,
      name: item.description.slice(0, 30),
      description: item.description.slice(0, 500),
      quantity: 1,
      valueCents: item.priceCents,
    }))
  );

  const totalItensCents = charge.items.reduce(
    (total, item) => total + item.priceCents * item.quantity,
    0
  );
  const diferencaCents = totalItensCents - charge.amountCents;
  if (diferencaCents < 0) {
    throw new Error("Total do pedido maior que as linhas do checkout Asaas.");
  }
  let descontoRestanteCents = diferencaCents;
  for (let indice = items.length - 1; indice >= 0 && descontoRestanteCents > 0; indice -= 1) {
    const item = items[indice];
    if (!item) continue;
    const abatimentoCents = Math.min(item.valueCents - 1, descontoRestanteCents);
    item.valueCents -= abatimentoCents;
    descontoRestanteCents -= abatimentoCents;
  }

  if (descontoRestanteCents > 0) {
    throw new Error("Desconto do pedido maior que as linhas do checkout Asaas.");
  }

  return items.map(({ valueCents, ...item }) => ({
    ...item,
    value: valorDecimal(valueCents),
  }));
}

async function exigirWebhookConfigurado(webhookUrl: string): Promise<void> {
  const apiKey = requireApiKey();
  const res = await fetch(`${apiBase()}/webhooks`, {
    method: "GET",
    headers: { access_token: apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_CRIACAO_MS),
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    console.error("[asaas] não foi possível consultar webhooks", res.status, detalhe);
    throw new Error("Não foi possível verificar o webhook do Asaas.");
  }

  const data = (await res.json()) as { data?: AsaasWebhookConfig[] };
  const webhooks = Array.isArray(data.data) ? data.data : [];
  const esperado = webhooks.find((webhook) => webhook.url === webhookUrl);

  if (esperado && webhookAtivo(esperado)) return;

  const recuperado = esperado
    ? await reativarWebhook(apiKey, esperado, webhookUrl)
    : await criarWebhook(apiKey, webhookUrl);

  if (!recuperado) {
    throw new Error(
      "Webhook do Asaas não configurado para este ambiente. Configure CHECKOUT_PAID, CHECKOUT_CANCELED e CHECKOUT_EXPIRED antes de vender."
    );
  }
}

function webhookAtivo(webhook: AsaasWebhookConfig): boolean {
  const eventos = new Set(webhook.events ?? []);
  return (
    webhook.enabled === true &&
    webhook.interrupted !== true &&
    webhook.hasAuthToken !== false &&
    EVENTOS_CHECKOUT_OBRIGATORIOS.every((evento) => eventos.has(evento))
  );
}

function webhookEmail(): string {
  return (
    process.env.ASAAS_WEBHOOK_EMAIL?.trim() ||
    process.env.REVERA_ALERT_EMAIL_TO?.split(",")[0]?.trim() ||
    "francisshield@gmail.com"
  );
}

function webhookAuthToken(): string {
  const token = process.env.ASAAS_WEBHOOK_AUTH_TOKEN?.trim();
  if (!token) {
    throw new Error("ASAAS_WEBHOOK_AUTH_TOKEN ausente — webhook do Asaas não verificável.");
  }
  return token;
}

function eventosWebhook(eventosAtuais?: string[]): string[] {
  return Array.from(new Set([...(eventosAtuais ?? []), ...EVENTOS_CHECKOUT_OBRIGATORIOS]));
}

function corpoWebhook(
  webhookUrl: string,
  nome?: string,
  email?: string,
  eventosAtuais?: string[]
) {
  return {
    name: nome?.trim() || NOME_WEBHOOK_CHECKOUT,
    url: webhookUrl,
    email: email?.trim() || webhookEmail(),
    enabled: true,
    interrupted: false,
    authToken: webhookAuthToken(),
    events: eventosWebhook(eventosAtuais),
  };
}

async function reativarWebhook(
  apiKey: string,
  webhook: AsaasWebhookConfig,
  webhookUrl: string
): Promise<boolean> {
  if (!webhook.id) return false;
  const res = await fetch(`${apiBase()}/webhooks/${encodeURIComponent(webhook.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", access_token: apiKey },
    body: JSON.stringify(corpoWebhook(webhookUrl, webhook.name, webhook.email, webhook.events)),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_CRIACAO_MS),
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    console.error("[asaas] falha ao reativar webhook de checkout", res.status, detalhe);
    return false;
  }
  return true;
}

async function criarWebhook(apiKey: string, webhookUrl: string): Promise<boolean> {
  const res = await fetch(`${apiBase()}/webhooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", access_token: apiKey },
    body: JSON.stringify(corpoWebhook(webhookUrl)),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_CRIACAO_MS),
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    console.error("[asaas] falha ao criar webhook de checkout", res.status, detalhe);
    return false;
  }
  return true;
}

function pagamentoPertenceAoPedido(pagamento: AsaasPayment, hint: WebhookHint): boolean {
  if (hint.transactionId && pagamento.checkoutSession !== hint.transactionId) return false;
  if (!hint.transactionId && pagamento.externalReference !== hint.orderId) return false;
  return true;
}

function confirmarPorObjeto(pagamento: AsaasPayment | undefined): ConfirmedPayment {
  if (!pagamento) {
    return {
      paid: false,
      paidAmountCents: null,
      currency: "BRL",
      method: null,
      installments: null,
      raw: { encontrado: false },
    };
  }

  const valor = typeof pagamento.value === "number" ? pagamento.value : null;

  return {
    paid: STATUS_PAGO.has(pagamento.status ?? ""),
    paidAmountCents: valor == null ? null : Math.round(valor * 100),
    currency: "BRL",
    method: typeof pagamento.billingType === "string" ? pagamento.billingType.toLowerCase() : null,
    installments:
      typeof pagamento.installmentNumber === "number" ? pagamento.installmentNumber : null,
    raw: pagamento,
  };
}
