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
  /**
   * Moeda da COBRANÇA (ISO 4217, maiúscula) — a mesma gravada em
   * orders.currency. Cada adapter decide o que aceita: a InfinitePay só
   * processa BRL e RECUSA qualquer outra na criação (melhor falhar antes de
   * cobrar do que cobrar na moeda errada); a Stripe cobra na moeda do
   * mercado. Nunca converter aqui — conversão é decisão comercial, não do
   * adapter.
   */
  currency: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  /** para onde o gateway devolve o cliente depois de pagar */
  redirectUrl: string;
  /** para onde o gateway avisa que algo aconteceu */
  webhookUrl: string;
  items: Array<{ description: string; quantity: number; priceCents: number }>;
  /**
   * Idioma da TELA do gateway, quando ele souber respeitar.
   *
   * Vem do país de entrega, como todo o resto do checkout — e não do
   * navegador. Um brasileiro comprando para a filha nos EUA lê o checkout
   * em inglês e o campo de endereço em inglês; a tela da Stripe voltar a
   * ser em português no meio do caminho pareceria outro site.
   *
   * Opcional porque nem todo adapter tem onde aplicar: a InfinitePay é
   * brasileira e não recebe idioma.
   */
  locale?: string;
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
/**
 * O que o aviso PEDE que seja feito. "pagamento" é o caso clássico (vá
 * confirmar se foi pago). "reembolso" existe porque um gateway que avisa
 * charge.refunded NÃO pode passar pelo caminho de confirmação: o pagamento
 * original continua constando como bem-sucedido no gateway, e confirmar de
 * novo marcaria como pago um pedido que acabou de ser estornado.
 * "ignorar" registra o evento (auditoria + idempotência) e para — para os
 * muitos eventos que um gateway manda e não mudam pedido nenhum.
 */
export type TipoDeAviso = "pagamento" | "reembolso" | "ignorar";

/** Superfície mínima dos cabeçalhos HTTP que um adapter pode precisar ler. */
export interface CabecalhosWebhook {
  get(nome: string): string | null;
}

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
  /**
   * O que fazer com o aviso. Ausente = "pagamento", que é o comportamento
   * histórico — os adapters antigos não precisam mudar.
   */
  kind?: TipoDeAviso;
}

/** Resultado de uma verificação ATIVA junto ao gateway. É isto que vale. */
export interface ConfirmedPayment {
  paid: boolean;
  /** quanto o gateway diz que foi efetivamente pago, em centavos */
  paidAmountCents: number | null;
  /**
   * Em QUAL moeda o gateway diz que foi pago (ISO 4217, maiúscula), ou null
   * quando o gateway não informa. Com mais de uma moeda no sistema, comparar
   * só o número deixaria passar "pagou 770 USD num pedido de 770 BRL" — e
   * vice-versa. Quem compara é confirmarPagamento(), contra orders.currency.
   */
  currency: string | null;
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
   *
   * `cabecalhos` existe para gateway que ASSINA o webhook (a Stripe manda a
   * assinatura no header Stripe-Signature): o adapter valida a assinatura
   * aqui dentro e devolve null quando ela não confere — a rota nem fica
   * sabendo que existia um corpo. Adapters sem assinatura ignoram o
   * parâmetro.
   */
  parseWebhookHint(rawBody: string, cabecalhos?: CabecalhosWebhook): WebhookHint | null;

  /**
   * Pergunta ao gateway, por chamada de saída, se aquele pedido foi pago.
   * É a ÚNICA coisa que autoriza marcar um pedido como pago.
   */
  confirmPayment(hint: WebhookHint): Promise<ConfirmedPayment>;
}
