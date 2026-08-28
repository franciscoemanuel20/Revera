"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatarValorNaMoeda } from "@/lib/internacional/moeda";
import { salvarPrecosInternacionaisAction } from "./actions";

const MOEDAS_INTL = ["USD", "EUR", "GBP", "AUD", "CAD"] as const;

interface VarianteComPrecos {
  id: string;
  sku: string;
  nomeProduto: string;
  precoBRLCents: number;
  precos: Array<{ moeda: string; priceCents: number; ativo: boolean }>;
}

/**
 * Edição de preço por mercado, uma variante por vez.
 *
 * A tela fala em UNIDADES da moeda ("650.00"); a Server Action recebe
 * CENTAVOS inteiros — a conversão acontece no submit, com validação de
 * número. Campo vazio significa "sem preço nesse mercado" (linha
 * desativada, mercado bloqueado para a variante), que é o estado honesto
 * enquanto o Francisco não decidir o valor.
 */
export function PrecosInternacionais({ variantes }: { variantes: VarianteComPrecos[] }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl text-ink">Preço por mercado</h2>
        <p className="mt-1 text-sm text-ink/70">
          Vazio = mercado fechado para a peça (aparece como &quot;preço não configurado&quot;
          no checkout). O preço brasileiro fica em Produtos, como sempre.
        </p>
      </div>
      {variantes.map((v) => (
        <LinhaVariante key={v.id} variante={v} />
      ))}
    </section>
  );
}

function LinhaVariante({ variante }: { variante: VarianteComPrecos }) {
  const ativosPorMoeda = new Map(
    variante.precos.filter((p) => p.ativo).map((p) => [p.moeda, p.priceCents])
  );
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const moeda of MOEDAS_INTL) {
      const cents = ativosPorMoeda.get(moeda);
      inicial[moeda] = cents != null ? (cents / 100).toFixed(2) : "";
    }
    return inicial;
  });
  const [estado, setEstado] = useState<"parado" | "salvando" | "salvo" | "erro">("parado");
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function salvar() {
    const precos: Record<string, number | null> = {};
    for (const moeda of MOEDAS_INTL) {
      const bruto = valores[moeda]?.trim() ?? "";
      if (bruto === "") {
        precos[moeda] = null;
        continue;
      }
      const numero = Number(bruto.replace(",", "."));
      if (!Number.isFinite(numero) || numero <= 0) {
        setEstado("erro");
        setMensagem(`Valor inválido em ${moeda}.`);
        return;
      }
      precos[moeda] = Math.round(numero * 100);
    }

    setEstado("salvando");
    setMensagem(null);
    const resultado = await salvarPrecosInternacionaisAction({
      variantId: variante.id,
      precos,
    });
    if ("error" in resultado) {
      setEstado("erro");
      setMensagem(resultado.error);
    } else {
      setEstado("salvo");
    }
  }

  return (
    <div className="rounded-lg border border-sand bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium text-ink">{variante.nomeProduto}</span>{" "}
          <span className="text-xs text-ink/60">{variante.sku}</span>
        </div>
        <span className="text-xs text-ink/60">
          Brasil: {variante.precoBRLCents > 0 ? formatarValorNaMoeda(variante.precoBRLCents, "BRL") : "sem preço"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {MOEDAS_INTL.map((moeda) => (
          <label key={moeda} className="flex flex-col gap-1 text-xs text-ink/70">
            {moeda}
            <input
              value={valores[moeda] ?? ""}
              onChange={(e) => {
                setValores((atual) => ({ ...atual, [moeda]: e.target.value }));
                setEstado("parado");
              }}
              inputMode="decimal"
              placeholder="—"
              className="min-h-toque rounded-md border border-sand bg-paper px-2 py-1 text-sm text-ink"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" onClick={salvar} disabled={estado === "salvando"}>
          {estado === "salvando" ? "Salvando…" : "Salvar preços"}
        </Button>
        {estado === "salvo" ? <span className="text-xs text-moss">Salvo.</span> : null}
        {estado === "erro" && mensagem ? (
          <span className="text-xs text-red-700">{mensagem}</span>
        ) : null}
      </div>
    </div>
  );
}
