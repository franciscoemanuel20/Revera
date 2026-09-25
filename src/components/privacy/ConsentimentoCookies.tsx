"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Pixels } from "@/components/tracking/Pixels";
import { PageViewTracker } from "@/components/tracking/PageViewTracker";
import { SITE_COPY, localeFromPath, localizePath, type SiteLocale } from "@/lib/i18n/site";

const CHAVE_CONSENTIMENTO = "revera-cookies-opcionais-v1";

export function ConsentimentoCookies({
  locale,
  rastreamentoAtivo,
}: {
  locale?: SiteLocale;
  rastreamentoAtivo: boolean;
}) {
  const [consentimento, setConsentimento] = useState<"aceito" | "recusado" | null>(null);
  const pathname = usePathname();
  const localeAtual = locale ?? localeFromPath(pathname ?? "/") ?? "pt";
  const t = SITE_COPY[localeAtual].cookies;

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
        <aside className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-xl rounded-lg border border-sand bg-paper p-5 shadow-xl" aria-label={t.aria}>
          <p className="font-semibold text-ink">{t.titulo}</p>
          <p className="mt-1 text-sm leading-6 text-ink/75">{t.texto}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => decidir("aceito")} className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper">{t.aceitar}</button>
            <button type="button" onClick={() => decidir("recusado")} className="rounded-md border border-ink/25 px-4 py-2 text-sm font-semibold text-ink">{t.recusar}</button>
            <a href={localizePath("/cookies", localeAtual)} className="self-center text-sm underline text-ink/70">{t.saibaMais}</a>
          </div>
        </aside>
      ) : null}
    </>
  );
}
