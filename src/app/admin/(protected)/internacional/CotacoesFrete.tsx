"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatarValorNaMoeda } from "@/lib/internacional/moeda";
import {
  criarCotacaoInternacionalAction,
  desativarCotacaoInternacionalAction,
} from "./actions";

const PAISES_INTL: Array<{ iso: string; nome: string; moeda: string }> = [
  { iso: "US", nome: "Estados Unidos", moeda: "USD" },
  { iso: "PT", nome: "Portugal", moeda: "EUR" },
  { iso: "GB", nome: "Reino Unido", moeda: "GBP" },
  { iso: "AU", nome: "Austrália", moeda: "AUD" },
  { iso: "CA", nome: "Canadá", moeda: "CAD" },
];

interface Cotacao {
  id: string;
  country: string;
  carrier: string;
  serviceName: string;
  currency: string;
  priceCents: number;
  maxWeightG: number | null;
  etaDiasMin: number | null;
  etaDiasMax: number | null;
  quotedAt: string;
  validUntil: string;
  ativa: boolean;
  notes: string | null;
}

/**
 * Cotações manuais de frete internacional — a fila do que a DHL cotou.
 *
 * A cotação EXPIRA (valid_until): o checkout ignora cotação vencida e o
 * país fecha sozinho até entrar uma nova. É o desenho combinado na
 * estrutura §2 — melhor país fechado que frete de mês passado. O peso vai
 * em GRAMAS, como todo o sistema.
 */
export function CotacoesFrete({ cotacoes }: { cotacoes: Cotacao[] }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    country: "US",
    serviceName: "",
    valor: "",
    maxWeightG: "",
    etaMin: "",
    etaMax: "",
    quotedAt: hoje,
    validUntil: "",
    notes: "",
  });
  const [estado, setEstado] = useState<"parado" | "salvando">("parado");
  const [erro, setErro] = useState<string | null>(null);

  const moedaDoPais =
    PAISES_INTL.find((p) => p.iso === form.country)?.moeda ?? "USD";

  async function criar() {
    setErro(null);
    const numero = Number(form.valor.replace(",", "."));
    if (!Number.isFinite(numero) || numero <= 0) {
      setErro("Informe o valor do frete na moeda do país.");
      return;
    }
    setEstado("salvando");
    const resultado = await criarCotacaoInternacionalAction({
      country: form.country,
      carrier: "DHL",
      serviceName: form.serviceName || "DHL Express",
      currency: moedaDoPais,
      priceCents: Math.round(numero * 100),
      maxWeightG: form.maxWeightG ? Number(form.maxWeightG) : null,
      etaDiasMin: form.etaMin ? Number(form.etaMin) : null,
      etaDiasMax: form.etaMax ? Number(form.etaMax) : null,
      quotedAt: form.quotedAt,
      validUntil: form.validUntil,
      notes: form.notes.trim() === "" ? null : form.notes,
    });
    setEstado("parado");
    if ("error" in resultado) setErro(resultado.error);
  }

  const input =
    "min-h-toque rounded-md border border-sand bg-paper px-2 py-1 text-sm text-ink";

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl text-ink">Frete internacional — cotações</h2>
        <p className="mt-1 text-sm text-ink/70">
          O checkout usa a cotação ATIVA mais recente dentro da validade, na moeda do
          país. Vencida = país fechado até cadastrar outra. Peso em gramas.
        </p>
      </div>

      <div className="rounded-lg border border-sand bg-paper p-4">
        <h3 className="text-sm font-medium text-ink">Nova cotação (DHL)</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            País
            <select
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              className={input}
            >
              {PAISES_INTL.map((p) => (
                <option key={p.iso} value={p.iso}>
                  {p.nome} ({p.moeda})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Serviço
            <input
              value={form.serviceName}
              onChange={(e) => setForm((f) => ({ ...f, serviceName: e.target.value }))}
              placeholder="DHL Express Worldwide"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Valor ({moedaDoPais})
            <input
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              inputMode="decimal"
              placeholder="0.00"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Peso máx. (g)
            <input
              value={form.maxWeightG}
              onChange={(e) => setForm((f) => ({ ...f, maxWeightG: e.target.value }))}
              inputMode="numeric"
              placeholder="500"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Prazo mín. (dias úteis)
            <input
              value={form.etaMin}
              onChange={(e) => setForm((f) => ({ ...f, etaMin: e.target.value }))}
              inputMode="numeric"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Prazo máx.
            <input
              value={form.etaMax}
              onChange={(e) => setForm((f) => ({ ...f, etaMax: e.target.value }))}
              inputMode="numeric"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Cotada em
            <input
              type="date"
              value={form.quotedAt}
              onChange={(e) => setForm((f) => ({ ...f, quotedAt: e.target.value }))}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Válida até
            <input
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
              className={input}
            />
          </label>
        </div>
        <label className="mt-3 flex flex-col gap-1 text-xs text-ink/70">
          Observações
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Ex.: cotação do balcão, seguro incluso até X"
            className={input}
          />
        </label>
        <div className="mt-3 flex items-center gap-3">
          <Button type="button" onClick={criar} disabled={estado === "salvando"}>
            {estado === "salvando" ? "Salvando…" : "Cadastrar cotação"}
          </Button>
          {erro ? <span className="text-xs text-red-700">{erro}</span> : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-sand bg-paper">
        <table className="w-full border-collapse text-left text-sm text-ink">
          <thead>
            <tr className="border-b border-sand text-xs text-ink/60">
              <th className="px-3 py-2">País</th>
              <th className="px-3 py-2">Serviço</th>
              <th className="px-3 py-2">Valor</th>
              <th className="px-3 py-2">Validade</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cotacoes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-sm text-ink/60">
                  Nenhuma cotação cadastrada — todos os países internacionais estão
                  fechados por falta de frete.
                </td>
              </tr>
            ) : (
              cotacoes.map((c) => <LinhaCotacao key={c.id} cotacao={c} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LinhaCotacao({ cotacao }: { cotacao: Cotacao }) {
  const [desativando, setDesativando] = useState(false);
  const hoje = new Date().toISOString().slice(0, 10);
  const vencida = cotacao.validUntil < hoje;

  return (
    <tr className="border-b border-sand/60 last:border-0">
      <td className="px-3 py-2">{cotacao.country}</td>
      <td className="px-3 py-2">
        {cotacao.carrier} · {cotacao.serviceName}
        {cotacao.maxWeightG ? (
          <span className="text-xs text-ink/50"> · até {cotacao.maxWeightG} g</span>
        ) : null}
      </td>
      <td className="px-3 py-2">{formatarValorNaMoeda(cotacao.priceCents, cotacao.currency)}</td>
      <td className="px-3 py-2 text-xs">
        {cotacao.quotedAt} → {cotacao.validUntil}
      </td>
      <td className="px-3 py-2 text-xs">
        {!cotacao.ativa ? (
          <span className="text-ink/50">desativada</span>
        ) : vencida ? (
          <span className="font-medium text-amber-800">VENCIDA</span>
        ) : (
          <span className="text-moss">vigente</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {cotacao.ativa ? (
          <button
            type="button"
            disabled={desativando}
            onClick={async () => {
              setDesativando(true);
              await desativarCotacaoInternacionalAction(cotacao.id);
              setDesativando(false);
            }}
            className="text-xs text-ink/60 underline"
          >
            desativar
          </button>
        ) : null}
      </td>
    </tr>
  );
}
