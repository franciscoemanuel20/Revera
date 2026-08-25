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
  serviceName: string;
  carrier: string;
  priceCents: number;
  etaDays: number;
}

// Dados mínimos de pedido que o provider precisa para gerar etiqueta —
// deliberadamente não é o tipo `orders` inteiro da migration, só o que a
// cotação/postagem exige, para não acoplar este contrato ao schema do banco.
export interface ShippableOrder {
  orderId: string;
  destination: ShippingDestination;
  packageInfo: ShippingPackageInfo;
}

export interface ShipmentResult {
  providerShipmentId: string;
  trackingCode?: string;
  labelUrl?: string;
}

export interface ShippingProvider {
  quote(
    origin: ShippingOrigin,
    destination: ShippingDestination,
    packageInfo: ShippingPackageInfo
  ): Promise<ShippingQuote[]>;
  createShipment(order: ShippableOrder): Promise<ShipmentResult>;
}
