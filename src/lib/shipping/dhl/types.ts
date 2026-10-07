export type DhlAmbiente = "sandbox" | "producao";

export interface DhlParty {
  countryCode: string;
  postalCode?: string | null;
  cityName: string;
  provinceCode?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
}

export interface DhlPackageInfo {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface DhlQuoteRequest {
  origin: DhlParty;
  destination: DhlParty;
  packageInfo: DhlPackageInfo;
  declaredValueCents: number;
  currency: string;
  plannedShippingDate: string;
  accountNumber?: string | null;
}

export interface DhlQuote {
  productCode: string;
  productName: string;
  currency: string;
  priceCents: number;
  etaDays: number | null;
  deliveryDate: string | null;
  raw: unknown;
}

export interface DhlShipmentLineItem {
  description: string;
  quantity: number;
  valueCents: number;
  weightGrams: number;
  hsCode: string;
  originCountry: string;
}

export interface DhlShipmentRequest {
  orderId: string;
  productCode: string;
  plannedShippingDate: string;
  currency: string;
  declaredValueCents: number;
  packageInfo: DhlPackageInfo;
  shipper: DhlParty & { legalName: string; contactName: string; taxId: string; phone: string; email: string };
  receiver: DhlParty & { name: string; phone: string; email: string };
  lineItems: DhlShipmentLineItem[];
  requestPickup: boolean;
}

export interface DhlShipmentResult {
  shipmentId: string;
  trackingNumber: string;
  labelBase64: string | null;
  documents: Array<{ typeCode: string | null; contentBase64: string }>;
  raw: unknown;
}
