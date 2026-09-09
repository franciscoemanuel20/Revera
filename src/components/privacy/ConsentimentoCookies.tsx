"use client";

import { Suspense, useEffect, useState } from "react";
import { Pixels } from "@/components/tracking/Pixels";
import { PageViewTracker } from "@/components/tracking/PageViewTracker";

const CHAVE_CONSENTIMENTO = "revera-cookies-opcionais-v1";

export function ConsentimentoCookies({ rastreamentoAtivo }: { rastreamentoAtivo: boolean }) {
  const [consentimento, setConsentimento] = useState<"aceito" | "recusado" | null>(null);

  useEffect(() => {
    const salvo = window.localStorage.getItem(CHAVE_CONSENTIMENTO);
    if (salvo === "aceito" || salvo === "recusado") setConsentimento(salvo);
  }, []);

  const medir = rastreamentoAtivo && consentimento === "aceito";
  function decidir(valor: "aceito" | "recusado") {
    window.localStorage.setItem(CHAVE_CONSENTIMENTO, valor);
    setConsentimento(valor);
  }

  return (
    <>
      <Pixels ativo={medir} />
      <Suspense fallback={null}>
        <PageViewTracker ativo={medir} />
      </Suspense>
      {consentimento === null ? (
        <aside className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-xl rounded-lg border border-sand bg-paper p-5 shadow-xl" aria-label="Preferências de cookies">
          <p className="font-semibold text-ink">Sua privacidade</p>
          <p className="mt-1 text-sm leading-6 text-ink/75">Usamos cookies necessários para a loja funcionar. Cookies opcionais da Meta e do Google só são ativados se você aceitar.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => decidir("aceito")} className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper">Aceitar opcionais</button>
            <button type="button" onClick={() => decidir("recusado")} className="rounded-md border border-ink/25 px-4 py-2 text-sm font-semibold text-ink">Recusar</button>
            <a href="/cookies" className="self-center text-sm underline text-ink/70">Saiba mais</a>
          </div>
        </aside>
      ) : null}
    </>
  );
}
