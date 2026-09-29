"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatarValorNaMoeda } from "@/lib/internacional/moeda";
import {
  cotarDhlOperacionalAction,
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
  const [consulta, setConsulta] = useState({
    cityName: "New York",
    postalCode: "10001",
    provinceCode: "NY",
    addressLine1: "",
    declaredValue: "1600.00",
    weightGrams: "300",
    lengthCm: "30",
    widthCm: "20",
    heightCm: "5",
  });
  const [estadoDhl, setEstadoDhl] = useState<"parado" | "cotando">("parado");
  const [erroDhl, setErroDhl] = useState<string | null>(null);
  const [resultadoDhl, setResultadoDhl] = useState<Awaited<ReturnType<typeof cotarDhlOperacionalAction>> | null>(null);

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

  async function consultarDhl() {
    setErroDhl(null);
    setResultadoDhl(null);
    const declarado = Number(consulta.declaredValue.replace(",", "."));
    if (!Number.isFinite(declarado) || declarado <= 0) {
      setErroDhl("Informe o valor declarado para a simulação DHL.");
      return;
    }
    const numeros = {
      weightGrams: Number(consulta.weightGrams),
      lengthCm: Number(consulta.lengthCm),
      widthCm: Number(consulta.widthCm),
      heightCm: Number(consulta.heightCm),
    };
    if (Object.values(numeros).some((n) => !Number.isFinite(n) || n <= 0)) {
      setErroDhl("Peso e medidas precisam ser maiores que zero.");
      return;
    }
    setEstadoDhl("cotando");
    const resultado = await cotarDhlOperacionalAction({
      country: form.country,
      postalCode: consulta.postalCode.trim() || null,
      cityName: consulta.cityName,
      provinceCode: consulta.provinceCode.trim() || null,
      addressLine1: consulta.addressLine1.trim() || null,
      currency: moedaDoPais,
      declaredValueCents: Math.round(declarado * 100),
      ...numeros,
    });
    setEstadoDhl("parado");
    setResultadoDhl(resultado);
    if ("error" in resultado) setErroDhl(resultado.error);
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

      <div className="rounded-lg border border-sand bg-paper p-4">
        <h3 className="text-sm font-medium text-ink">Consultar DHL</h3>
        <p className="mt-1 text-xs text-ink/60">
          Diagnóstico operacional: consulta a MyDHL API e mostra opções. Não salva cotação,
          não abre país, não cria envio. Enquanto a chave de produção não for aprovada,
          mantenha DHL_AMBIENTE=sandbox.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Cidade
            <input
              value={consulta.cityName}
              onChange={(e) => setConsulta((f) => ({ ...f, cityName: e.target.value }))}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Postal
            <input
              value={consulta.postalCode}
              onChange={(e) => setConsulta((f) => ({ ...f, postalCode: e.target.value }))}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Região
            <input
              value={consulta.provinceCode}
              onChange={(e) => setConsulta((f) => ({ ...f, provinceCode: e.target.value }))}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Valor ({moedaDoPais})
            <input
              value={consulta.declaredValue}
              onChange={(e) => setConsulta((f) => ({ ...f, declaredValue: e.target.value }))}
              inputMode="decimal"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            Peso (g)
            <input
              value={consulta.weightGrams}
              onChange={(e) => setConsulta((f) => ({ ...f, weightGrams: e.target.value }))}
              inputMode="numeric"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            C (cm)
            <input
              value={consulta.lengthCm}
              onChange={(e) => setConsulta((f) => ({ ...f, lengthCm: e.target.value }))}
              inputMode="decimal"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            L (cm)
            <input
              value={consulta.widthCm}
              onChange={(e) => setConsulta((f) => ({ ...f, widthCm: e.target.value }))}
              inputMode="decimal"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/70">
            A (cm)
            <input
              value={consulta.heightCm}
              onChange={(e) => setConsulta((f) => ({ ...f, heightCm: e.target.value }))}
              inputMode="decimal"
              className={input}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-ink/70">
            Linha do endereço
            <input
              value={consulta.addressLine1}
              onChange={(e) => setConsulta((f) => ({ ...f, addressLine1: e.target.value }))}
              placeholder="Opcional para diagnóstico"
              className={input}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={consultarDhl} disabled={estadoDhl === "cotando"}>
            {estadoDhl === "cotando" ? "Consultando…" : "Consultar DHL"}
          </Button>
          {erroDhl ? <span className="text-xs text-red-700">{erroDhl}</span> : null}
        </div>
        {resultadoDhl && "ok" in resultadoDhl ? (
          <div className="mt-3 overflow-x-auto rounded-md border border-sand/80">
            <table className="w-full text-left text-xs text-ink">
              <thead>
                <tr className="border-b border-sand text-ink/60">
                  <th className="px-2 py-1">Ambiente</th>
                  <th className="px-2 py-1">Serviço</th>
                  <th className="px-2 py-1">Valor</th>
                  <th className="px-2 py-1">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {resultadoDhl.quotes.map((q) => (
                  <tr key={`${q.productCode}-${q.priceCents}`} className="border-b border-sand/60 last:border-0">
                    <td className="px-2 py-1">{resultadoDhl.ambiente}</td>
                    <td className="px-2 py-1">
                      {q.productName} <span className="text-ink/50">({q.productCode})</span>
                    </td>
                    <td className="px-2 py-1">{formatarValorNaMoeda(q.priceCents, q.currency)}</td>
                    <td className="px-2 py-1">
                      {q.etaDays == null ? "—" : `${q.etaDays} dias`}
                      {q.deliveryDate ? <span className="text-ink/50"> · {q.deliveryDate}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
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
