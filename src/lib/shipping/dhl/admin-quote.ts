import "server-only";

import { ShippingUnavailable } from "../provider";
import { ehMoedaSuportada, type Moeda } from "@/lib/internacional/moeda";
import { regraDoPais } from "@/lib/internacional/paises";
import { MyDhlProvider, modoDhl } from "./mydhl-provider";
import type { DhlQuote, DhlQuoteRequest } from "./types";

const ORIGEM_PADRAO = {
  countryCode: "BR",
  postalCode: "12216530",
  cityName: "Sao Jose dos Campos",
  provinceCode: "SP",
  addressLine1: "Rua Siria 71",
};

export interface CotacaoDhlOperacionalInput {
  country: string;
  postalCode?: string | null;
  cityName: string;
  provinceCode?: string | null;
  addressLine1?: string | null;
  currency: string;
  declaredValueCents: number;
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  plannedShippingDate?: string | null;
}

export interface CotacaoDhlOperacionalResultado {
  ok: true;
  ambiente: "sandbox" | "producao";
  destino: {
    country: string;
    cityName: string;
    postalCode: string | null;
  };
  currency: Moeda;
  quotes: DhlQuote[];
}

export function planejadaPadrao(): string {
  // A coleta sai de São José dos Campos. O calendário do servidor (UTC na
  // Vercel) já está no dia seguinte após 21h no Brasil e não pode defini-la.
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  // UTC é usado apenas para aritmética do calendário já convertido da origem.
  const data = new Date(Date.UTC(valor("year"), valor("month") - 1, valor("day")));
  do {
    data.setUTCDate(data.getUTCDate() + 1);
  } while (data.getUTCDay() === 0 || data.getUTCDay() === 6);
  // Feriados/disponibilidade final continuam sendo validados pela DHL.
  return `${data.toISOString().slice(0, 10)}T10:00:00GMT-03:00`;
}

function inteiroPositivo(v: number, campo: string): number {
  if (!Number.isFinite(v) || v <= 0) {
    throw new ShippingUnavailable(`${campo} precisa ser maior que zero para cotar na DHL.`);
  }
  return Math.round(v);
}

export function montarRequestDhlOperacional(input: CotacaoDhlOperacionalInput): DhlQuoteRequest {
  const country = input.country.trim().toUpperCase();
  const regra = regraDoPais(country);
  if (!regra || country === "BR") {
    throw new ShippingUnavailable("Destino DHL precisa ser um país internacional suportado.");
  }
  if (!input.cityName.trim()) {
    throw new ShippingUnavailable("Cidade de destino é obrigatória para cotar na DHL.");
  }
  const currency = input.currency.trim().toUpperCase();
  if (!ehMoedaSuportada(currency) || currency === "BRL") {
    throw new ShippingUnavailable("Cotação DHL internacional precisa usar moeda estrangeira suportada.");
  }
  const postalCode = input.postalCode?.trim() || null;
  if (regra.exigeCodigoPostal !== false && !postalCode) {
    throw new ShippingUnavailable(`Código postal é obrigatório para ${regra.nomePt}.`);
  }

  return {
    origin: ORIGEM_PADRAO,
    destination: {
      countryCode: country,
      postalCode,
      cityName: input.cityName.trim(),
      provinceCode: input.provinceCode?.trim() || null,
      addressLine1: input.addressLine1?.trim() || null,
    },
    currency,
    declaredValueCents: inteiroPositivo(input.declaredValueCents, "Valor declarado"),
    packageInfo: {
      weightGrams: inteiroPositivo(input.weightGrams, "Peso"),
      lengthCm: inteiroPositivo(input.lengthCm, "Comprimento"),
      widthCm: inteiroPositivo(input.widthCm, "Largura"),
      heightCm: inteiroPositivo(input.heightCm, "Altura"),
    },
    plannedShippingDate: input.plannedShippingDate?.trim() || planejadaPadrao(),
  };
}

export async function cotarDhlOperacional(
  input: CotacaoDhlOperacionalInput
): Promise<CotacaoDhlOperacionalResultado> {
  const request = montarRequestDhlOperacional(input);
  const provider = new MyDhlProvider();
  const quotes = await provider.quote(request);
  return {
    ok: true,
    ambiente: modoDhl(),
    destino: {
      country: request.destination.countryCode,
      cityName: request.destination.cityName,
      postalCode: request.destination.postalCode ?? null,
    },
    currency: request.currency as Moeda,
    quotes,
  };
}
