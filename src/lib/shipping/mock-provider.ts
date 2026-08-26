import type {
  ShippableOrder,
  ShipmentResult,
  ShipmentStatus,
  ShippingDestination,
  ShippingOrigin,
  ShippingPackageInfo,
  ShippingProvider,
  ShippingQuote,
} from "./provider";

/**
 * Provider MOCK — cotação fake determinística (mesmo CEP de destino sempre
 * devolve o mesmo preço/prazo), sem chamar a SuperFrete. Usado enquanto
 * SUPERFRETE_TOKEN não existir de verdade (ver .env.example).
 *
 * O "determinístico" aqui é deliberadamente grosseiro: preço e prazo variam
 * só pelo último dígito do CEP, só para a tela de checkout ter algo plausível
 * para mostrar em desenvolvimento — não é fórmula de frete real e não deve
 * virar uma por acidente.
 *
 * Os `serviceId` são os códigos REAIS da SuperFrete (PAC=1, SEDEX=2), e
 * `coversInsurance` é sempre true porque os dois serviços simulados aqui são
 * justamente os que cobrem o valor da peça. Assim o caminho exercitado em
 * desenvolvimento é o mesmo de produção — inclusive a escolha da opção.
 */
export class MockShippingProvider implements ShippingProvider {
  readonly name = "mock";

  async quote(
    _origin: ShippingOrigin,
    destination: ShippingDestination,
    _packageInfo: ShippingPackageInfo,
    _declaredValueCents: number
  ): Promise<ShippingQuote[]> {
    const lastDigit = Number(destination.cep.replace(/\D/g, "").slice(-1) || "0");

    return [
      {
        serviceId: 1,
        serviceName: "PAC (simulado)",
        carrier: "Correios",
        priceCents: 1990 + lastDigit * 100,
        etaDays: 5 + lastDigit,
        coversInsurance: true,
      },
      {
        serviceId: 2,
        serviceName: "SEDEX (simulado)",
        carrier: "Correios",
        priceCents: 3490 + lastDigit * 150,
        etaDays: 2 + Math.floor(lastDigit / 3),
        coversInsurance: true,
      },
    ];
  }

  async createLabel(order: ShippableOrder): Promise<ShipmentResult> {
    // Nasce `pending` e sem rastreio, igual à de verdade — assim o caminho
    // exercitado em desenvolvimento é o mesmo de produção.
    return {
      providerShipmentId: `mock_${order.orderId}`,
      status: "pending",
      trackingCode: null,
      carrier: "Correios",
      labelUrl: null,
    };
  }

  async payLabel(_providerShipmentId: string): Promise<void> {
    // Nada a debitar: no mock não existe carteira.
  }

  async getShipmentStatus(providerShipmentId: string): Promise<ShipmentStatus> {
    return {
      status: "released",
      trackingCode: `MOCKBR${providerShipmentId.replace(/\W/g, "").slice(0, 10).toUpperCase()}`,
      carrier: "Correios",
    };
  }

  async getLabelUrl(_providerShipmentId: string): Promise<string | null> {
    // Não existe PDF de mentira para imprimir — devolver null é honesto, e a
    // tela do admin já trata "sem etiqueta ainda".
    return null;
  }
}
