export type DhlAmbiente = "sandbox" | "producao";

export interface DhlParty {
  countryCode: string;
  postalCode?: string | null;
  cityName: string;
  provinceCode?: string | null;
  addressLine1?: string | null;
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
