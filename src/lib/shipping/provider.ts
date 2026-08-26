/**
 * Contrato de frete — mesmo raciocínio de src/lib/payments/provider.ts: a
 * rota de cotação/checkout depende só desta interface, nunca do SuperFrete
 * direto. Cálculo de frete real é linha que não se cruza fora da conversa
 * principal (afeta preço final cobrado do cliente).
 */

export interface ShippingOrigin {
  cep: string;
}

export interface ShippingDestination {
  cep: string;
}

export interface ShippingPackageInfo {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface ShippingQuote {
  /**
   * Código do serviço na plataforma (PAC=1, SEDEX=2, …). Guardado porque a
   * etiqueta precisa ser criada COM O MESMO serviço que o cliente pagou —
   * recotar na hora do despacho daria outro preço e outra transportadora.
   */
  serviceId: number;
  serviceName: string;
  carrier: string;
  priceCents: number;
  etaDays: number;
  /**
   * O seguro deste serviço cobre o valor declarado inteiro?
   *
   * A peça da Reverá vale R$ 1.600 e há transportadora com teto de R$ 1.500.
   * Uma cotação R$ 3 mais barata que deixa R$ 100 descobertos não é mais
   * barata — é risco transferido para a operação sem ninguém perceber. Quem
   * escolhe (melhorOpcao) descarta o que não cobre; o campo existe para que
   * a informação não se perca no caminho até lá.
   */
  coversInsurance: boolean;
  /**
   * A API devolve erro POR SERVIÇO — um indisponível não derruba os outros.
   * Guardado para o painel da equipe poder mostrar o motivo.
   */
  error?: string;
}

/**
 * Endereço completo do destinatário. Diferente de ShippingDestination (que
 * só tem CEP, o suficiente para cotar): para EMITIR a etiqueta a
 * transportadora exige o endereço inteiro e o documento.
 */
export interface ShipmentRecipient {
  name: string;
  document: string;
  cep: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  email?: string | null;
  phone?: string | null;
}

// Dados mínimos de pedido que o provider precisa para gerar etiqueta —
// deliberadamente não é o tipo `orders` inteiro da migration, só o que a
// cotação/postagem exige, para não acoplar este contrato ao schema do banco.
export interface ShippableOrder {
  orderId: string;
  /** O número que o cliente conhece (REV-XXXXXXXX) — vai na etiqueta. */
  orderNumber: string;
  recipient: ShipmentRecipient;
  packageInfo: ShippingPackageInfo;
  /** O serviço que o cliente JÁ PAGOU. Não se recota no despacho. */
  serviceId: number;
  declaredValueCents: number;
}

export interface ShipmentResult {
  providerShipmentId: string;
  status: string;
  trackingCode?: string | null;
  labelUrl?: string | null;
  carrier?: string | null;
}

export interface ShipmentStatus {
  status: string;
  trackingCode: string | null;
  carrier: string | null;
}

export interface ShippingProvider {
  readonly name: string;
  quote(
    origin: ShippingOrigin,
    destination: ShippingDestination,
    packageInfo: ShippingPackageInfo,
    declaredValueCents: number
  ): Promise<ShippingQuote[]>;
  /**
   * Cria a etiqueta E paga com o saldo da carteira, numa operação só.
   *
   * Os dois passos andam juntos de propósito: o código de rastreio só existe
   * depois do pagamento da etiqueta, então parar no meio deixaria um pedido
   * com etiqueta criada, sem rastreio e sem ninguém saber por quê.
   */
  createShipment(order: ShippableOrder): Promise<ShipmentResult>;
  getShipmentStatus(providerShipmentId: string): Promise<ShipmentStatus>;
  getLabelUrl(providerShipmentId: string): Promise<string | null>;
}

/**
 * A plataforma não respondeu, ou respondeu erro. Tipo próprio (e não Error
 * genérico) para quem chama poder distinguir "o frete está indisponível
 * agora" de "o código quebrou" — são reações diferentes.
 */
export class ShippingUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShippingUnavailable";
  }
}
