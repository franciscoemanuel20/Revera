/**
 * Contrato de pagamento — checkout e webhook dependem só desta interface,
 * nunca de um provider específico. Trocar de gateway não pode exigir tocar
 * em rota nem em UI, só em src/lib/payments/*.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE CONTRATO NÃO TEM `verifyWebhookSignature`
 * ---------------------------------------------------------------------------
 * A versão anterior deste arquivo assumia o padrão comum: o gateway assina o
 * corpo do webhook (HMAC) e o servidor valida a assinatura. Ao ler a
 * documentação real da InfinitePay (26/08/2026,
 * https://www.infinitepay.io/checkout-documentacao) ficou claro que **o
 * webhook deles não é assinado** — não há HMAC, nem token, nem segredo
 * compartilhado. Qualquer pessoa que descubra a URL do webhook poderia
 * enviar um POST dizendo "pedido X foi pago".
 *
 * Num e-commerce isso é grave duas vezes: marcaria pedido como pago sem
 * dinheiro ter entrado, e dispararia o evento Purchase do Meta Pixel em
 * cima de uma venda que não existe — envenenando a otimização das campanhas.
 *
 * A solução é inverter a confiança: **o webhook não é uma fonte de verdade,
 * é só um aviso**. Ele diz "olhe o pedido X"; quem responde "foi pago mesmo,
 * e o valor foi Y" é uma chamada de SAÍDA nossa para o gateway
 * (`payment_check`, no caso da InfinitePay). Só o resultado dessa chamada
 * marca um pedido como pago.
 *
 * Por isso a interface tem `parseWebhookHint` (extrai as pistas do aviso) e
 * `confirmPayment` (vai perguntar ao gateway), em vez de validar assinatura.
 * Um gateway que ASSINE o webhook continua encaixando aqui: o adapter dele
 * pode validar a assinatura dentro de `parseWebhookHint` e, se quiser,
 * ainda assim reconfirmar em `confirmPayment` — verificação a mais nunca
 * torna o fluxo menos seguro.
 */

export interface PaymentCharge {
  /** id interno do pedido (orders.id) — vira o `order_nsu` do gateway */
  orderId: string;
  /** número legível do pedido, para o cliente reconhecer na fatura */
  orderNumber: string;
  amountCents: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  /** para onde o gateway devolve o cliente depois de pagar */
  redirectUrl: string;
  /** para onde o gateway avisa que algo aconteceu */
  webhookUrl: string;
  items: Array<{ description: string; quantity: number; priceCents: number }>;
}

export interface PaymentResult {
  /** id do pagamento no gateway, quando ele já devolve um */
  providerPaymentId: string | null;
  /** URL hospedada onde o cliente efetivamente paga */
  checkoutUrl: string;
}

/**
 * Pistas extraídas do webhook. Deliberadamente NÃO inclui "status": o aviso
 * não tem autoridade para dizer se foi pago — ver comentário no topo.
 */
export interface WebhookHint {
  /** nosso orders.id, devolvido pelo gateway */
  orderId: string;
  /** id da transação no gateway — usado na reconfirmação e na idempotência */
  transactionId: string | null;
  /** identificador da fatura no gateway, quando existir */
  invoiceSlug: string | null;
  /**
   * Chave de idempotência do evento. Dois webhooks com a mesma chave são o
   * mesmo evento e devem ser processados uma vez só (a tabela
   * payment_events tem unique (provider, provider_event_id)).
   */
  eventId: string;
}

/** Resultado de uma verificação ATIVA junto ao gateway. É isto que vale. */
export interface ConfirmedPayment {
  paid: boolean;
  /** quanto o gateway diz que foi efetivamente pago, em centavos */
  paidAmountCents: number | null;
  method: string | null;
  installments: number | null;
  /** resposta crua, guardada em payments.raw_response para auditoria */
  raw: unknown;
}

export interface PaymentProvider {
  /** nome curto do provider, gravado em payments.provider */
  readonly name: string;

  createCharge(charge: PaymentCharge): Promise<PaymentResult>;

  /**
   * Lê o corpo do webhook e extrai as pistas. Devolve null se o corpo não
   * for reconhecível — nesse caso a rota responde 400 sem tocar em pedido.
   */
  parseWebhookHint(rawBody: string): WebhookHint | null;

  /**
   * Pergunta ao gateway, por chamada de saída, se aquele pedido foi pago.
   * É a ÚNICA coisa que autoriza marcar um pedido como pago.
   */
  confirmPayment(hint: WebhookHint): Promise<ConfirmedPayment>;
}
