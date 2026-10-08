"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { consultarFocusNfeAction, emitirFocusNfeAction, liberarReservaFocusNaoEnviadaAction,
  salvarValoresFocusAction } from "./focus-nfe-actions";
import { prepararComunicacaoEnvioAction } from "./comunicacao-envio-actions";
import type { ShippingEmailLocale } from "@/lib/internacional/email-envio";
import type { FiscalAmounts } from "@/lib/fiscal/focus-validation";

type FocusRow = { environment: string; status: string; reference: string; number: string | null;
  series: string | null; access_key: string | null; rejection_reason: string | null;
  xml_storage_path: string | null; danfe_storage_path: string | null; consultation_attempts: number };

export function FocusNfeOperacao({ orderId, focus, blockers, emissionEnabled, docs, guideFinal, emailDraft,
  amounts, orderMoney }: {
  orderId: string; focus: FocusRow | null; blockers: string[]; emissionEnabled: boolean;
  docs: Array<{ kind: string; status: string }>; guideFinal: boolean;
  emailDraft: { locale: string; subject: string; body: string } | null;
  amounts: FiscalAmounts | null;
  orderMoney: { currency: string; shippingCents: number; discountCents: number };
}) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""); const [payload, setPayload] = useState("");
  const [locale, setLocale] = useState<ShippingEmailLocale>("en");
  const verified = (kind: string) => docs.some(d => d.kind === kind && d.status === "verified");
  const steps = [
    ["Conferir dados do destinatário", blockers.some(x => x.includes("destinatário")) ? "WAITING_FOR_OWNER" : "Conferir no pedido"],
    ["Conferir snapshot dos produtos", blockers.some(x => x.includes("snapshot")) ? "WAITING_FOR_OWNER" : "Conferir abaixo"],
    ["Informar pacote final", blockers.some(x => x.includes("peso bruto")) ? "WAITING_FOR_OWNER" : "Medido"],
    ["Emitir NF-e", focus ? "Solicitada; não emitir novamente" : blockers.length ? "Bloqueada: ver pendências" : "Disponível com confirmação"],
    ["Acompanhar autorização", focus?.status ?? "Aguarda emissão"],
    ["Conferir XML e DANFE", focus?.xml_storage_path && focus?.danfe_storage_path ? "Recuperados em storage privado" : "Aguarda autorização e download"],
    ["Conferir Commercial Invoice e DRE/DU-E", verified("invoice") && verified("declaration") ? "Conferidos" : "Aguarda documentos conferidos"],
    ["Gerar etiqueta DHL", guideFinal ? "Guia criada" : verified("nfe") && verified("invoice") && verified("declaration") ? "Confira bloqueios abaixo" : "Bloqueada pelos documentos"],
    ["Registrar rastreamento", guideFinal ? "Guia disponível; conferir PayPal abaixo" : "Aguarda guia"],
    ["Preparar comunicação ao cliente", emailDraft ? `Rascunho ${emailDraft.locale} pronto; não enviado` : guideFinal ? "Preparar; não enviar automaticamente" : "Aguarda guia"],
  ];
  async function run(fn: () => Promise<{ ok: true; message: string } | { error: string }>) {
    setBusy(true); try { const r = await fn(); setMessage("error" in r ? r.error : r.message);
      if ("ok" in r) router.refresh(); } finally { setBusy(false); }
  }
  return <section className="rounded-lg border border-sand p-4 text-sm print:hidden">
    <h2 className="font-display text-lg">Sequência fiscal e envio internacional</h2>
    <ol className="mt-3 list-decimal space-y-1 pl-5">{steps.map(([title, state]) =>
      <li key={title}><strong>{title}</strong> — {state}</li>)}</ol>
    {blockers.length || !emissionEnabled ? <div className="mt-3 rounded border border-amber-400 bg-amber-50 p-3">
      <strong>WAITING_FOR_OWNER</strong><ul className="mt-1 list-disc pl-5">{blockers.map(b => <li key={b}>{b}</li>)}</ul>
      {!emissionEnabled ? <p>A emissão Focus está desabilitada neste ambiente.</p> : null}
    </div> : null}
    {!focus ? <form className="mt-4 grid gap-2 rounded border border-sand p-3 md:grid-cols-3" onSubmit={ev => {
      ev.preventDefault(); const f = new FormData(ev.currentTarget);
      const cents = (key: string) => Math.round(Number(f.get(key)) * 100);
      void run(() => salvarValoresFocusAction({ orderId, accountantConfirmed: f.get("accountantConfirmed") === "on",
        shippingTreatment: f.get("shippingTreatment"), discountTreatment: f.get("discountTreatment"),
        fxRate: Number(f.get("fxRate")), fxSource: f.get("fxSource"), fxDate: f.get("fxDate"),
        freight: cents("freight"), discount: cents("discount"), insurance: cents("insurance"),
        other: cents("other"), ii: cents("ii"), ipi: cents("ipi"), services: cents("services"),
        icmsRelief: cents("icmsRelief"), icmsSt: cents("icmsSt") }));
    }}>
      <h3 className="font-medium md:col-span-3">Valores fiscais deste pedido</h3>
      <p className="md:col-span-3">Frete no pedido: {orderMoney.shippingCents / 100} {orderMoney.currency}; desconto no pedido: {orderMoney.discountCents / 100} {orderMoney.currency}. Informe o tratamento aprovado pelo contador e a conversão para BRL. Zero deve ser preenchido explicitamente quando aplicável.</p>
      <label>Frete na NF-e<select required name="shippingTreatment" defaultValue={amounts?.shipping_treatment ?? ""} className="w-full rounded border border-sand p-2"><option value="">Selecione</option><option value="included">Incluir frete convertido</option><option value="excluded">Excluir por orientação fiscal</option></select></label>
      <label>Desconto na NF-e<select required name="discountTreatment" defaultValue={amounts?.discount_treatment ?? ""} className="w-full rounded border border-sand p-2"><option value="">Selecione</option><option value="included_in_items">Já refletido nos itens</option><option value="separate" disabled={orderMoney.discountCents > 0}>Separado, somente se o pedido não teve desconto</option></select></label>
      <label>Câmbio BRL por {orderMoney.currency}<input required type="number" name="fxRate" min="0.00000001" step="any" defaultValue={amounts?.fx_rate_brl_per_order_unit ?? ""} className="w-full rounded border border-sand p-2" /></label>
      <label>Fonte do câmbio<input required name="fxSource" defaultValue={amounts?.fx_source ?? ""} className="w-full rounded border border-sand p-2" /></label>
      <label>Data do câmbio<input required type="date" name="fxDate" defaultValue={amounts?.fx_date ?? ""} className="w-full rounded border border-sand p-2" /></label>
      {([[
        "freight","Frete BRL",amounts?.freight_brl_cents], ["discount","Desconto BRL",amounts?.discount_brl_cents],
        ["insurance","Seguro BRL",amounts?.insurance_brl_cents], ["other","Outras despesas BRL",amounts?.other_brl_cents],
        ["ii","Imposto de importação BRL",amounts?.ii_brl_cents], ["ipi","IPI BRL",amounts?.ipi_brl_cents],
        ["services","Serviços BRL",amounts?.services_brl_cents], ["icmsRelief","ICMS desonerado BRL",amounts?.icms_relief_brl_cents],
        ["icmsSt","ICMS ST BRL",amounts?.icms_st_brl_cents],
      ] as const).map(([key,label,value]) => <label key={key}>{label}<input required type="number" name={key} min="0" step="0.01"
        defaultValue={value === undefined ? "" : (value / 100).toFixed(2)} className="w-full rounded border border-sand p-2" /></label>)}
      <label className="flex items-center gap-2 md:col-span-3"><input required type="checkbox" name="accountantConfirmed" />Confirmo que o contador validou os componentes, o câmbio e o tratamento do frete e desconto.</label>
      <button disabled={busy} className="rounded bg-ink px-3 py-2 text-paper disabled:opacity-50 md:col-span-3">Salvar valores fiscais aprovados</button>
    </form> : null}
    {focus ? <div className="mt-3 rounded bg-sand/50 p-3">
      <p>Focus {focus.environment}: {focus.status}. Referência {focus.reference}.</p>
      {focus.access_key ? <p>Chave: {focus.access_key}. Número: {focus.number ?? "—"}; série: {focus.series ?? "—"}.</p> : null}
      {focus.rejection_reason ? <p>Motivo: {focus.rejection_reason}</p> : null}
      <p>Consultas: {focus.consultation_attempts}. XML: {focus.xml_storage_path ? "privado" : "pendente"}; DANFE: {focus.danfe_storage_path ? "privado" : "pendente"}.</p>
      {focus.xml_storage_path ? <a className="mr-3 underline" href={`/api/admin/focus-nfe/${orderId}/xml`}>Baixar XML autenticado</a> : null}
      {focus.danfe_storage_path ? <a className="underline" href={`/api/admin/focus-nfe/${orderId}/danfe`}>Baixar DANFE autenticado</a> : null}
      {focus.status === "reserved_unsent" ? <button disabled={busy} onClick={() => {
        if (window.confirm("Confirmo que o POST Focus não começou e quero liberar esta reserva para reconferir o pedido."))
          void run(() => liberarReservaFocusNaoEnviadaAction({ orderId, confirmed: true }));
      }} className="mt-2 rounded border border-ink px-3 py-2 disabled:opacity-50">Liberar reserva não enviada</button>
        : <button disabled={busy} onClick={() => void run(() => consultarFocusNfeAction({ orderId }))}
          className="mt-2 rounded border border-ink px-3 py-2 disabled:opacity-50">Consultar Focus e recuperar documentos</button>}
    </div> : <div className="mt-3 grid gap-2">
      <label className="flex flex-col gap-1">JSON completo da NF-e revisado pelo contador para este pedido
        <textarea value={payload} onChange={e => setPayload(e.target.value)} rows={6}
          placeholder="Cole o payload fiscal Focus validado para este pedido" className="rounded border border-sand p-2 font-mono text-xs" />
      </label>
      <p className="text-xs text-ink/70">O sistema confere CFOP, série, NCM, quantidades e valores contra o snapshot. A ação cria documento fiscal real no ambiente configurado.</p>
      <button disabled={busy || !emissionEnabled || blockers.length > 0 || !payload.trim()} onClick={() => {
        if (!window.confirm("Confirmo a emissão de NF-e para este pedido no ambiente configurado. Em produção, isto cria documento fiscal real e não poderá ser repetido.")) return;
        void run(() => emitirFocusNfeAction({ orderId, confirmed: true, payloadJson: payload }));
      }} className="w-fit rounded bg-ink px-3 py-2 text-paper disabled:opacity-50">Emitir NF-e com confirmação</button>
    </div>}
    {message ? <p role="status" className="mt-2 rounded bg-sand p-2">{message}</p> : null}
    {guideFinal ? <div className="mt-4 rounded border border-sand p-3">
      <h3 className="font-medium">Comunicação localizada</h3>
      {emailDraft ? <><p className="mt-1">{emailDraft.subject}</p><p className="mt-1 whitespace-pre-wrap">{emailDraft.body}</p>
        <p className="mt-1 text-xs">Rascunho privado. Nenhum e-mail foi enviado.</p></> : <div className="mt-2 flex flex-wrap items-center gap-2">
        <label>Idioma do cliente <select value={locale} onChange={e => setLocale(e.target.value as ShippingEmailLocale)} className="rounded border border-sand p-2">
          <option value="pt">Português</option><option value="en">English</option><option value="es">Español</option>
          <option value="fr">Français</option><option value="de">Deutsch</option>
        </select></label>
        <button disabled={busy} onClick={() => void run(() => prepararComunicacaoEnvioAction({ orderId, locale }))}
          className="rounded border border-ink px-3 py-2 disabled:opacity-50">Preparar rascunho sem enviar</button>
      </div>}
    </div> : null}
  </section>;
}
