import "server-only";

import { ShippingUnavailable } from "../provider";
import type { DhlAmbiente, DhlQuote, DhlQuoteRequest } from "./types";

const DHL_TIMEOUT_MS = 15_000;
const DHL_SANDBOX_BASE = "https://express.api.dhl.com/mydhlapi/test";
const DHL_PRODUCTION_BASE = "https://express.api.dhl.com/mydhlapi";

function valorEnv(nome: string): string | null {
  const v = process.env[nome]?.trim();
  return v ? v : null;
}

export function modoDhl(): DhlAmbiente {
  const bruto = valorEnv("DHL_AMBIENTE") ?? valorEnv("DHL_ENV") ?? valorEnv("DHL_SANDBOX");
  if (!bruto) {
    throw new ShippingUnavailable(
      "DHL_AMBIENTE não definida — use 'sandbox' enquanto a produção não for aprovada."
    );
  }
  const v = bruto.toLowerCase();
  if (["sandbox", "test", "teste", "1", "true", "sim"].includes(v)) return "sandbox";
  if (["producao", "produção", "production", "prod", "0", "false", "nao", "não"].includes(v)) {
    return "producao";
  }
  throw new ShippingUnavailable(
    `DHL_AMBIENTE irreconhecível (${bruto.length} caracteres) — use 'sandbox' ou 'producao'.`
  );
}

export function baseDhl(): string {
  const custom = valorEnv("DHL_API_BASE_URL");
  if (custom) return custom.replace(/\/+$/, "");
  return modoDhl() === "sandbox" ? DHL_SANDBOX_BASE : DHL_PRODUCTION_BASE;
}

export function exigirAmbienteDhlParaTransacao(acao: string): void {
  const modo = modoDhl();
  if (modo === "sandbox") return;
  const vercel = process.env.VERCEL_ENV;
  if (process.env.NODE_ENV !== "production" || vercel === "preview") {
    throw new ShippingUnavailable(
      `${acao} na DHL de produção cria transação real. Só é permitido em ambiente de produção.`
    );
  }
  if (valorEnv("DHL_PRODUCTION_APPROVED") !== "1") {
    throw new ShippingUnavailable(
      `${acao} na DHL de produção bloqueado: DHL_PRODUCTION_APPROVED precisa ser 1.`
    );
  }
}

function credenciais(): { key: string; secret: string } {
  const key = valorEnv("DHL_MYDHL_API_KEY") ?? valorEnv("DHL_API_KEY");
  const secret = valorEnv("DHL_MYDHL_API_SECRET") ?? valorEnv("DHL_API_SECRET");
  if (!key || !secret) {
    throw new ShippingUnavailable("Credenciais DHL ausentes no ambiente.");
  }
  return { key, secret };
}

function authHeader(): string {
  const { key, secret } = credenciais();
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

function kg(gramas: number): number {
  if (!Number.isFinite(gramas) || gramas <= 0) {
    throw new ShippingUnavailable("Peso DHL inválido — informe gramas positivos.");
  }
  return Number((gramas / 1000).toFixed(3));
}

function cm(valor: number, campo: string): number {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new ShippingUnavailable(`${campo} DHL inválido — informe centímetros positivos.`);
  }
  return Number(valor.toFixed(1));
}

function centavosParaUnidade(centavos: number): number {
  if (!Number.isFinite(centavos) || centavos <= 0) {
    throw new ShippingUnavailable("Valor declarado DHL inválido.");
  }
  return Number((Math.round(centavos) / 100).toFixed(2));
}

function dataDhl(v: string): Date {
  return new Date(v.replace(/GMT([+-]\d{2}):?(\d{2})$/, "$1:$2"));
}

function diasEntre(inicio: string, fim: string | null): number | null {
  if (!fim) return null;
  const a = dataDhl(inicio);
  const b = dataDhl(fim);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86_400_000));
}

export function montarPayloadDhlRating(input: DhlQuoteRequest): Record<string, unknown> {
  const accountNumber = input.accountNumber ?? valorEnv("DHL_ACCOUNT_NUMBER");
  return {
    customerDetails: {
      shipperDetails: {
        postalCode: input.origin.postalCode ?? undefined,
        cityName: input.origin.cityName,
        countryCode: input.origin.countryCode,
        provinceCode: input.origin.provinceCode ?? undefined,
        addressLine1: input.origin.addressLine1 ?? undefined,
      },
      receiverDetails: {
        postalCode: input.destination.postalCode ?? undefined,
        cityName: input.destination.cityName,
        countryCode: input.destination.countryCode,
        provinceCode: input.destination.provinceCode ?? undefined,
        addressLine1: input.destination.addressLine1 ?? undefined,
      },
    },
    accounts: accountNumber ? [{ typeCode: "shipper", number: accountNumber }] : undefined,
    plannedShippingDateAndTime: input.plannedShippingDate,
    unitOfMeasurement: "metric",
    isCustomsDeclarable: true,
    monetaryAmount: [
      {
        typeCode: "declaredValue",
        value: centavosParaUnidade(input.declaredValueCents),
        currency: input.currency,
      },
    ],
    packages: [
      {
        weight: kg(input.packageInfo.weightGrams),
        dimensions: {
          length: cm(input.packageInfo.lengthCm, "Comprimento"),
          width: cm(input.packageInfo.widthCm, "Largura"),
          height: cm(input.packageInfo.heightCm, "Altura"),
        },
      },
    ],
  };
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function primeiroTexto(...valores: unknown[]): string | null {
  for (const v of valores) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function primeiroNumero(...valores: unknown[]): number | null {
  for (const v of valores) {
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function precoTotalProdutoDhl(produto: Record<string, unknown>): { price: number; currency: string } | null {
  const totalPrice = produto.totalPrice;
  const entradas = Array.isArray(totalPrice) ? totalPrice : [totalPrice];

  for (const entrada of entradas) {
    const total = asRecord(entrada);
    const price = primeiroNumero(total.price, total.priceValue);
    const currency = primeiroTexto(total.currency, total.priceCurrency);
    if (price !== null && currency) return { price, currency };
  }

  const price = primeiroNumero(produto.totalPrice);
  const currency = primeiroTexto(produto.currency);
  return price !== null && currency ? { price, currency } : null;
}

export function interpretarDhlRates(resposta: unknown, plannedShippingDate: string): DhlQuote[] {
  const raiz = asRecord(resposta);
  const produtos = Array.isArray(raiz.products) ? raiz.products : [];
  return produtos.flatMap((produto): DhlQuote[] => {
    const p = asRecord(produto);
    const productCode = primeiroTexto(p.productCode, p.localProductCode);
    const productName = primeiroTexto(p.productName, p.localProductName);
    const total = precoTotalProdutoDhl(p);
    if (!productCode || !productName || !total) return [];

    const delivery = asRecord(p.deliveryCapabilities);
    const deliveryDate = primeiroTexto(
      delivery.estimatedDeliveryDateAndTime,
      delivery.deliveryDateAndTime,
      p.deliveryDate
    );

    return [
      {
        productCode,
        productName,
        currency: total.currency,
        priceCents: Math.round(total.price * 100),
        etaDays: diasEntre(plannedShippingDate, deliveryDate),
        deliveryDate,
        raw: produto,
      },
    ];
  });
}

export class MyDhlProvider {
  readonly name = "dhl";

  async quote(input: DhlQuoteRequest): Promise<DhlQuote[]> {
    exigirAmbienteDhlParaTransacao("consultar cotação");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DHL_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${baseDhl()}/rates`, {
        method: "POST",
        headers: {
          Authorization: authHeader(),
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(montarPayloadDhlRating(input)),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (e) {
      throw new ShippingUnavailable(`DHL não respondeu à cotação: ${e}`);
    } finally {
      clearTimeout(timeout);
    }

    const texto = await response.text();
    if (!response.ok) {
      throw new ShippingUnavailable(`DHL rates → HTTP ${response.status}: ${texto.slice(0, 300)}`);
    }

    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new ShippingUnavailable(`DHL devolveu resposta não-JSON: ${texto.slice(0, 200)}`);
    }

    const cotacoes = interpretarDhlRates(json, input.plannedShippingDate);
    if (cotacoes.length === 0) {
      throw new ShippingUnavailable("DHL não retornou produtos cotáveis para este envio.");
    }
    return cotacoes;
  }
}
