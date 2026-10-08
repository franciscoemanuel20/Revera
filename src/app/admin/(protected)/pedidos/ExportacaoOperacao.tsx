"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DocumentoExportacao, ItemExportacao, PacoteExportacao } from "@/lib/internacional/processo-exportacao";
import { anexarDocumentoExportacaoAction, conferirDocumentoExportacaoAction,
  reconciliarModoInvoiceLegadoAction, reconciliarReservaDhlAction, salvarItemExportacaoAction, salvarPacoteExportacaoAction } from "./exportacao-actions";
import { reconciliarGuiaDhlAction } from "./envio-dhl";

type Doc = DocumentoExportacao & { url: string | null };
const tipos = [
  ["nfe", "NF-e de exportação"], ["invoice", "Commercial Invoice"], ["declaration", "Declaração aduaneira"],
] as const;
export function ExportacaoOperacao({ orderId, moeda, linhas, itens, facts, pacote, documentos, reservaDhl, invoiceMode, guideFinal, bloqueiosEtiqueta,
  bloqueiosDespacho }: { orderId: string; linhas: { id: string; nome: string; quantity: number }[];
  moeda: string;
  itens: ItemExportacao[]; facts: Array<{ order_item_id: string; ncm: string; hs_code: string; country_of_origin: string;
    net_weight_g: number; length_cm: number; width_cm: number; height_cm: number }>;
  pacote: PacoteExportacao | null; documentos: Doc[];
  reservaDhl: { status: string | null; updated_at: string | null } | null;
  invoiceMode: string | null;
  guideFinal: boolean;
  bloqueiosEtiqueta: string[]; bloqueiosDespacho: string[] }) {
  const router = useRouter();
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function executar(fn: () => Promise<{ ok: true } | { error: string }>) {
    setBusy(true); const r = await fn(); setBusy(false);
    setAviso("error" in r ? r.error : "Salvo. Reconfira as pendências abaixo.");
    if ("ok" in r) router.refresh();
  }
  return <section className="flex flex-col gap-5 rounded-lg border border-sand p-4 print:hidden">
    <h2 className="font-display text-lg">Preparar exportação</h2>
    <p className="text-sm text-ink/70">Registre apenas dados medidos ou validados. Cada arquivo fica privado e precisa de conferência antes do despacho.</p>
    {aviso ? <p role="status" className="rounded bg-sand p-2 text-sm">{aviso}</p> : null}
    {invoiceMode === null && reservaDhl && ["label_created", "registrado_manual", "creation_unknown"].includes(reservaDhl.status ?? "") ?
      <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">
        <p>Esta remessa antiga não tem modo de invoice registrado. Confira a Commercial Invoice e seu arquivo antes de fixar a origem para o pedido.</p>
        <button disabled={busy} onClick={() => void executar(() => reconciliarModoInvoiceLegadoAction({ orderId }))}
          className="mt-2 rounded border border-ink px-3 py-2 disabled:opacity-50">Fixar modo pela invoice conferida</button>
      </div> : null}
    {reservaDhl?.status === "creating" ? <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">
      <p>Há uma tentativa DHL em andamento desde {reservaDhl.updated_at ? new Date(reservaDhl.updated_at).toLocaleString("pt-BR") : "horário desconhecido"}. Se ela não terminou, aguarde 15 minutos e reconcilie. A operação vai liberar apenas a reserva comprovadamente não enviada; qualquer chamada incerta exigirá consulta no MyDHL antes de registrar a guia.</p>
      <button disabled={busy} onClick={() => void executar(() => reconciliarReservaDhlAction({ orderId }))}
        className="mt-2 rounded border border-ink px-3 py-2 disabled:opacity-50">Reconciliar tentativa parada</button>
    </div> : null}
    {reservaDhl?.status === "creation_unknown" ? <form className="grid gap-2 rounded border border-amber-400 bg-amber-50 p-3 text-sm"
      onSubmit={ev => { ev.preventDefault(); const f = new FormData(ev.currentTarget); f.set("orderId", orderId);
        void executar(() => reconciliarGuiaDhlAction(f)); }}>
      <strong>Resposta DHL incerta</strong>
      <p>Consulte o MyDHL pelo identificador deste pedido. Se a remessa existir, registre a mesma guia confirmada com comprovante da consulta. Nenhuma nova remessa será criada por esta ação.</p>
      <label>AWB confirmado<input required name="awb" inputMode="numeric" className="ml-2 rounded border border-sand p-2" /></label>
      <label>Referência da consulta MyDHL<input required name="lookupReference" className="ml-2 rounded border border-sand p-2" /></label>
      <label>Comprovante PDF ou imagem<input required name="file" type="file" accept="application/pdf,image/png,image/jpeg" className="ml-2" /></label>
      <button disabled={busy} className="w-fit rounded bg-ink px-3 py-2 text-white disabled:opacity-50">Reconciliar guia confirmada</button>
    </form> : null}
    <div className="grid gap-3">
      <h3 className="font-medium">Itens do pedido</h3>
      {linhas.map(l => { const i = itens.find(x => x.order_item_id === l.id); const fact = facts.find(x => x.order_item_id === l.id); return <form key={l.id}
        className="grid gap-2 rounded border border-sand p-3 md:grid-cols-3" onSubmit={ev => { ev.preventDefault(); const f = new FormData(ev.currentTarget);
          void executar(() => salvarItemExportacaoAction({ orderId, itemId: l.id, ncm: f.get("ncm"), hsCode: f.get("hs"),
            origin: String(f.get("origin") ?? "").toUpperCase(), descriptionEn: f.get("description"),
            netWeightG: Number(f.get("weight")), customsValueCents: Math.round(Number(f.get("customs")) * 100),
            fiscalValueBrlCents: Math.round(Number(f.get("brl")) * 100), fxRate: Number(f.get("rate")),
            fxSource: f.get("source"), fxDate: f.get("date") })); }}>
        <p className="text-sm font-medium md:col-span-3">{l.nome} · {l.quantity} un.</p>
        {fact ? <p className="text-xs text-ink/70 md:col-span-3">Fatos confirmados: {fact.net_weight_g} g líquidos por unidade; dimensões do item {fact.length_cm} × {fact.width_cm} × {fact.height_cm} cm. A embalagem final continua pendente até ser medida.</p> : null}
        {[["ncm","NCM (8 dígitos)",i?.ncm ?? fact?.ncm],["hs","HS Code",i?.hs_code ?? fact?.hs_code],["origin","Origem ISO",i?.country_of_origin ?? fact?.country_of_origin],
          ["description","Descrição em inglês",i?.description_en],["weight","Peso líquido por unidade (g)",i?.net_weight_g ?? fact?.net_weight_g],
          ["customs",`Valor aduaneiro da linha (${moeda})`,i ? (i.customs_value_cents / 100).toFixed(2) : ""],
          ["brl","Valor fiscal da linha (R$)",i ? (i.fiscal_value_brl_cents / 100).toFixed(2) : ""],
          ["rate",`Taxa BRL por ${moeda}`,i?.fx_rate_brl_per_unit],["source","Fonte da taxa validada",i?.fx_source],
          ["date","Data da taxa (AAAA-MM-DD)",i?.fx_date]].map(([key,label,value]) =>
          <label key={key} className="flex flex-col gap-1 text-xs">{label}<input required name={key as string} defaultValue={value ?? ""}
            className="min-h-10 rounded border border-sand p-2" /></label>)}
        <button disabled={busy} className="rounded bg-ink px-3 py-2 text-sm text-white disabled:opacity-50">Validar item</button>
      </form>; })}
    </div>
    <form className="grid gap-2 rounded border border-sand p-3 md:grid-cols-4" onSubmit={ev => { ev.preventDefault(); const f = new FormData(ev.currentTarget);
      void executar(() => salvarPacoteExportacaoAction({ orderId, grossWeightG: Number(f.get("weight")),
        lengthCm: Number(f.get("length")), widthCm: Number(f.get("width")), heightCm: Number(f.get("height")),
        incoterm: f.get("incoterm") })); }}>
      <h3 className="font-medium md:col-span-4">Embalagem final medida</h3>
      {[["weight","Peso bruto (g)",pacote?.gross_weight_g],["length","Comprimento (cm)",pacote?.length_cm],
        ["width","Largura (cm)",pacote?.width_cm],["height","Altura (cm)",pacote?.height_cm]].map(([key,label,value]) =>
        <label key={key} className="flex flex-col gap-1 text-xs">{label}<input required type="number" min="0.01" step="any" name={key as string}
          defaultValue={value ?? ""} className="min-h-10 rounded border border-sand p-2" /></label>)}
      <label className="flex flex-col gap-1 text-xs">Incoterm validado para este pedido
        <select required name="incoterm" defaultValue={pacote?.incoterm ?? ""} className="min-h-10 rounded border border-sand p-2">
          <option value="">Selecione após validação fiscal</option><option value="DAP">DAP</option><option value="DDP">DDP</option>
        </select>
      </label>
      <button disabled={busy} className="rounded bg-ink px-3 py-2 text-sm text-white disabled:opacity-50 md:col-span-4">Registrar medição</button>
    </form>
    <div className="grid gap-3">
      <h3 className="font-medium">Documentos</h3>
      {tipos.map(([kind,label]) => { const d = documentos.find(x => x.kind === kind); return <div key={kind} className="rounded border border-sand p-3">
        <p className="text-sm font-medium">{label}: {d ? `${d.status} · ${d.reference}` : "não anexado"}</p>
        {kind === "nfe" && !d ? <p className="mt-2 text-xs text-ink/70">Emita pela Focus NFe na etapa acima. XML e DANFE serão guardados no storage privado e o DANFE aparecerá aqui para conferência.</p> : null}
        {d?.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-sm underline">Abrir arquivo privado para conferência</a> : null}
        {d?.status === "pending" ? <div className="mt-2 flex gap-2">
          <button disabled={busy || !d.url} onClick={() => void executar(() => conferirDocumentoExportacaoAction({ orderId, kind, aprovado: true }))}
            className="rounded border border-ink px-3 py-2 text-sm">Conferi e aprovo</button>
          <button disabled={busy} onClick={() => void executar(() => conferirDocumentoExportacaoAction({ orderId, kind, aprovado: false }))}
            className="rounded border border-red-300 px-3 py-2 text-sm">Rejeitar</button>
        </div> : null}
        {kind === "invoice" && invoiceMode === "api" && !guideFinal ? <p className="mt-2 text-xs text-ink/60">Para uma nova guia, anexe e confira uma Commercial Invoice externa antes da DHL. A recuperação pela API continua disponível para remessas antigas.</p> : null}
        {kind !== "nfe" && d?.status !== "verified" ? <form className="mt-3 grid gap-2 md:grid-cols-3" onSubmit={ev => { ev.preventDefault();
          const f = new FormData(ev.currentTarget); f.set("orderId", orderId); f.set("kind", kind);
          void executar(() => anexarDocumentoExportacaoAction(f)); }}>
          {kind === "invoice" && invoiceMode === "api" && guideFinal ? <>
            <input type="hidden" name="source" value="dhl" />
            <label className="flex flex-col gap-1 text-xs md:col-span-3">Referência da consulta MyDHL+
              <input required name="myDhlReference" className="min-h-10 rounded border border-sand p-2" /></label>
            <label className="flex items-center gap-2 text-xs md:col-span-3"><input required type="checkbox" name="myDhlConfirmed" value="yes" />Confirmei que este PDF é a Commercial Invoice desta guia no MyDHL+.</label>
          </> : null}
          <label className="flex flex-col gap-1 text-xs">Referência do documento
            <input required name="reference" className="min-h-10 rounded border border-sand p-2" /></label>
          {kind === "declaration" ? <label className="flex flex-col gap-1 text-xs">Regime<select name="regime" required className="min-h-10 rounded border border-sand p-2">
            <option value="">Selecione</option><option value="DRE">DRE</option><option value="DUE">DU-E</option></select></label> : null}
          <label className="flex flex-col gap-1 text-xs">Arquivo PDF ou imagem<input required name="file" type="file" accept="application/pdf,image/png,image/jpeg" className="min-h-10 text-xs" /></label>
          <button disabled={busy} className="rounded bg-ink px-3 py-2 text-sm text-white">Anexar para conferência</button>
        </form> : null}
      </div>; })}
    </div>
    <div className="rounded bg-sand/50 p-3 text-sm"><strong>Para criar etiqueta:</strong> {bloqueiosEtiqueta.length ? bloqueiosEtiqueta.join(" ") : "Dados mínimos conferidos."}</div>
    <div className="rounded bg-sand/50 p-3 text-sm"><strong>Para despachar:</strong> {bloqueiosDespacho.length ? bloqueiosDespacho.join(" ") : "Documentação e guia conferidas."}</div>
  </section>;
}
