"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DocumentoExportacao, ItemExportacao, PacoteExportacao } from "@/lib/internacional/processo-exportacao";
import { anexarDocumentoExportacaoAction, conferirDocumentoExportacaoAction,
  reconciliarReservaDhlAction, salvarItemExportacaoAction, salvarPacoteExportacaoAction } from "./exportacao-actions";
import { reconciliarGuiaDhlAction } from "./envio-dhl";

type Doc = DocumentoExportacao & { url: string | null };
const tipos = [
  ["nfe", "NF-e de exportação"], ["invoice", "Commercial Invoice"], ["declaration", "Declaração aduaneira"],
] as const;
export function ExportacaoOperacao({ orderId, moeda, linhas, itens, pacote, documentos, reservaDhl, bloqueiosEtiqueta,
  bloqueiosDespacho }: { orderId: string; linhas: { id: string; nome: string; quantity: number }[];
  moeda: string;
  itens: ItemExportacao[]; pacote: PacoteExportacao | null; documentos: Doc[];
  reservaDhl: { status: string | null; updated_at: string | null } | null;
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
      {linhas.map(l => { const i = itens.find(x => x.order_item_id === l.id); return <form key={l.id}
        className="grid gap-2 rounded border border-sand p-3 md:grid-cols-3" onSubmit={ev => { ev.preventDefault(); const f = new FormData(ev.currentTarget);
          void executar(() => salvarItemExportacaoAction({ orderId, itemId: l.id, ncm: f.get("ncm"), hsCode: f.get("hs"),
            origin: String(f.get("origin") ?? "").toUpperCase(), descriptionEn: f.get("description"),
            netWeightG: Number(f.get("weight")), customsValueCents: Math.round(Number(f.get("customs")) * 100),
            fiscalValueBrlCents: Math.round(Number(f.get("brl")) * 100), fxRate: Number(f.get("rate")),
            fxSource: f.get("source"), fxDate: f.get("date") })); }}>
        <p className="text-sm font-medium md:col-span-3">{l.nome} · {l.quantity} un.</p>
        {[["ncm","NCM (8 dígitos)",i?.ncm],["hs","HS Code",i?.hs_code],["origin","Origem ISO",i?.country_of_origin],
          ["description","Descrição em inglês",i?.description_en],["weight","Peso líquido por unidade (g)",i?.net_weight_g],
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
        {d?.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-sm underline">Abrir arquivo privado para conferência</a> : null}
        {d?.status === "pending" ? <div className="mt-2 flex gap-2">
          <button disabled={busy || !d.url} onClick={() => void executar(() => conferirDocumentoExportacaoAction({ orderId, kind, aprovado: true }))}
            className="rounded border border-ink px-3 py-2 text-sm">Conferi e aprovo</button>
          <button disabled={busy} onClick={() => void executar(() => conferirDocumentoExportacaoAction({ orderId, kind, aprovado: false }))}
            className="rounded border border-red-300 px-3 py-2 text-sm">Rejeitar</button>
        </div> : null}
        {d?.status !== "verified" ? <form className="mt-3 grid gap-2 md:grid-cols-3" onSubmit={ev => { ev.preventDefault();
          const f = new FormData(ev.currentTarget); f.set("orderId", orderId); f.set("kind", kind);
          void executar(() => anexarDocumentoExportacaoAction(f)); }}>
          <label className="flex flex-col gap-1 text-xs">{kind === "nfe" ? "Chave da NF-e (44 dígitos)" : "Referência do documento"}
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
