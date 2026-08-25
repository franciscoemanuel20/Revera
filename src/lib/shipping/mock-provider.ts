import type {
  ShippableOrder,
  ShipmentResult,
  ShippingDestination,
  ShippingOrigin,
  ShippingPackageInfo,
  ShippingProvider,
  ShippingQuote,
} from "./provider";

/**
 * Provider MOCK — cotação fake determinística (mesmo CEP de destino
 * sempre devolve o mesmo preço/prazo), sem chamar o SuperFrete. Usado
 * enquanto SUPERFRETE_TOKEN não existir de verdade (ver .env.example).
 *
 * O "determinístico" aqui é deliberadamente grosseiro: preço e prazo
 * variam só pelo último dígito do CEP, só para a tela de checkout ter
 * algo plausível para mostrar em desenvolvimento — não é fórmula de
 * frete real e não deve virar uma por acidente.
 */
export class MockShippingProvider implements ShippingProvider {
  async quote(
    _origin: ShippingOrigin,
    destination: ShippingDestination,
    _packageInfo: ShippingPackageInfo
  ): Promise<ShippingQuote[]> {
    const lastDigit = Number(destination.cep.replace(/\D/g, "").slice(-1) || "0");

    return [
      {
        serviceName: "PAC (mock)",
        carrier: "mock-carrier",
        priceCents: 1990 + lastDigit * 100,
        etaDays: 5 + lastDigit,
      },
      {
        serviceName: "SEDEX (mock)",
        carrier: "mock-carrier",
        priceCents: 3490 + lastDigit * 150,
        etaDays: 2 + Math.floor(lastDigit / 3),
      },
    ];
  }

  async createShipment(order: ShippableOrder): Promise<ShipmentResult> {
    return {
      providerShipmentId: `mock_${order.orderId}`,
      trackingCode: `MOCKBR${order.orderId.replace(/-/g, "").slice(0, 10).toUpperCase()}`,
      labelUrl: `/admin/etiquetas/mock-${order.orderId}.pdf`,
    };
  }
}
