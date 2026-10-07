"use client";

import { useState } from "react";
import { gerarEnvioDhlAction } from "./gerar-envio-dhl";

export function GerarEtiquetaDhl({ orderId, disabled }: { orderId: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  return <div className="rounded-md border border-sand p-3 text-sm">
    <p className="font-medium">Gerar etiqueta DHL</p>
    <p className="mb-3 text-xs text-ink/60">Cria remessa, guia e documentos. Coleta só é solicitada quando habilitada. A comunicação ao cliente fica preparada, sem envio automático.</p>
    <button disabled={busy || disabled} className="rounded bg-ink px-3 py-2 text-paper disabled:opacity-50" onClick={async () => { setBusy(true); const r = await gerarEnvioDhlAction({ orderId }); setMessage("error" in r ? r.error : `Etiqueta criada. Rastreio ${r.tracking}. PayPal: ${r.paypal}.`); setBusy(false); }}>{busy ? "Gerando…" : "Gerar etiqueta DHL"}</button>
    {message ? <p className="mt-2 text-xs text-ink/70">{message}</p> : null}
  </div>;
}
