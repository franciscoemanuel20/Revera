"use client";

import { useState } from "react";
import { salvarConfiguracaoFocusAction } from "./focus-settings-actions";

type Settings = { cfop: string | null; natureza_operacao: string | null; tributacao: string | null;
  regime_exportacao: string | null; serie: string | null; numeracao: string | null;
  emitente_confirmado: boolean; contador_validou: boolean };

export function ConfiguracaoFocus({ settings }: { settings: Settings | null }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const fields = [
    ["cfop", "CFOP — proprietário + contador"], ["natureza_operacao", "Natureza da operação — contador"],
    ["tributacao", "Código ICMS/CSOSN de cada item — contador"], ["regime_exportacao", "Texto exato para informações adicionais do fisco sobre exportação — contador"],
    ["serie", "Série da NF-e — contador"], ["numeracao", "Estratégia de numeração — contador"],
  ] as const;
  return <section className="rounded-lg border border-sand p-4 text-sm">
    <h2 className="font-display text-lg">Configuração fiscal Focus NFe</h2>
    <p className="mt-2">Dados objetivos dos produtos ficam no snapshot de cada pedido. Os campos abaixo aguardam confirmação do proprietário e validação do contador. Nenhuma emissão é liberada enquanto faltarem.</p>
    <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={async ev => {
      ev.preventDefault(); const f = new FormData(ev.currentTarget); setBusy(true);
      const r = await salvarConfiguracaoFocusAction({
        ...Object.fromEntries(fields.map(([key]) => [key, String(f.get(key) ?? "")])),
        emitente_confirmado: f.get("emitente_confirmado") === "on",
        contador_validou: f.get("contador_validou") === "on",
      });
      setMessage("error" in r ? r.error : "Configuração salva."); setBusy(false);
    }}>
      {fields.map(([key, label]) => <label key={key} className="flex flex-col gap-1">{label}
        <input name={key} defaultValue={settings?.[key] ?? ""} className="rounded border border-sand p-2" />
      </label>)}
      <label className="flex items-center gap-2"><input type="checkbox" name="emitente_confirmado" defaultChecked={settings?.emitente_confirmado ?? false} />Dados do emitente confirmados pelo proprietário</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="contador_validou" defaultChecked={settings?.contador_validou ?? false} />Configuração fiscal validada pelo contador</label>
      <button disabled={busy} className="rounded bg-ink px-3 py-2 text-paper disabled:opacity-50">Salvar configuração</button>
    </form>
    <p role="status" className="mt-2">{message}</p>
  </section>;
}
