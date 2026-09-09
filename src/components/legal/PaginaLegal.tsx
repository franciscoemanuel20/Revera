import type { ReactNode } from "react";
import Link from "next/link";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";

export function PaginaLegal({ titulo, atualizadoEm, children }: {
  titulo: string;
  atualizadoEm: string;
  children: ReactNode;
}) {
  return (
    <main
      className="mx-auto w-full max-w-3xl px-6 pb-16 text-ink"
      style={{ paddingTop: HEADER_HEIGHT_PX + 40 }}
    >
      <p className="eyebrow-ink">Informações legais</p>
      <h1 className="mt-2 font-display text-4xl">{titulo}</h1>
      <p className="mt-3 text-sm text-ink/60">Última atualização: {atualizadoEm}</p>
      <div className="mt-10 space-y-8 leading-7 text-ink/80">{children}</div>
      <p className="mt-12 border-t border-sand pt-6 text-sm text-ink/65">
        Veja também a <Link className="underline hover:text-ink" href="/privacidade">Política de Privacidade</Link>, os{" "}
        <Link className="underline hover:text-ink" href="/termos">Termos de Uso</Link> e a{" "}
        <Link className="underline hover:text-ink" href="/cookies">Política de Cookies</Link>.
      </p>
    </main>
  );
}
