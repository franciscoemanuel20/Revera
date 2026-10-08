"use client";

import { useState } from "react";
import { recuperarInvoiceDhlAction } from "./gerar-envio-dhl";

export function RecuperarInvoiceDhl({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return <div className="rounded-md border border-sand p-3 text-sm">
    <p className="font-medium">Invoice DHL</p>
    <p className="mb-3 text-xs text-ink/60">Se a guia foi criada mas a invoice não apareceu, recupere o PDF já guardado. Esta ação não cria outra remessa.</p>
    <button disabled={busy} className="rounded bg-ink px-3 py-2 text-paper disabled:opacity-50" onClick={async () => {
      setBusy(true);
      try {
        const result = await recuperarInvoiceDhlAction({ orderId });
        setMessage("error" in result ? result.error : result.message);
      } finally { setBusy(false); }
    }}>{busy ? "Recuperando…" : "Recuperar invoice DHL"}</button>
    {message ? <p className="mt-2 text-xs text-ink/70">{message}</p> : null}
  </div>;
}
