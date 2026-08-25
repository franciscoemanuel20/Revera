"use client";
import { useState } from "react";
import { Button } from "./Button";
import type { ShippingQuote } from "@/lib/shipping/provider";

export interface ShippingCalculatorProps {
  onCalculate: (cep: string) => Promise<ShippingQuote[]>;
}

// Presentational — não importa src/lib/shipping/index.ts direto (isso é
// coisa de route handler / server component). Recebe onCalculate de fora,
// que hoje deve vir de uma rota que chama getShippingProvider().quote()
// (mock por enquanto, ver src/lib/shipping/mock-provider.ts).
export function ShippingCalculator({ onCalculate }: ShippingCalculatorProps) {
  const [cep, setCep] = useState("");
  const [quotes, setQuotes] = useState<ShippingQuote[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function calcular() {
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await onCalculate(cep);
      setQuotes(resultado);
    } catch {
      setErro("Não foi possível calcular o frete agora.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={cep}
          onChange={(e) => setCep(e.target.value)}
          placeholder="00000-000"
          inputMode="numeric"
          maxLength={9}
          className="min-h-toque flex-1 rounded-md border border-sand px-3 text-ink"
        />
        <Button type="button" onClick={calcular} disabled={carregando || cep.length < 8}>
          {carregando ? "Calculando…" : "Calcular"}
        </Button>
      </div>
      {erro ? <p className="text-sm text-red-600">{erro}</p> : null}
      {quotes ? (
        <ul className="flex flex-col gap-2">
          {quotes.map((quote) => (
            <li key={`${quote.carrier}-${quote.serviceName}`} className="flex justify-between text-sm text-ink">
              <span>{quote.serviceName}</span>
              <span>
                {(quote.priceCents / 100).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}{" "}
                · {quote.etaDays} dias úteis
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
