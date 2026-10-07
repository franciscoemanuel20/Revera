import type { ReactNode } from "react";
import Link from "next/link";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { localizePath, type SiteLocale } from "@/lib/i18n/site";

/**
 * Moldura das páginas legais. Até 07/10/2026 os rótulos ("Informações
 * legais", "Última atualização", "Veja também") saíam em português também
 * nas versões EN/ES/FR/DE; agora seguem o idioma da página.
 */
const MOLDURA: Record<SiteLocale, { sobre: string; atualizado: string; vejaTambem: string; links: Record<string, string> }> = {
  pt: { sobre: "Informações legais", atualizado: "Última atualização", vejaTambem: "Veja também", links: { "/privacidade": "Política de Privacidade", "/termos": "Termos de Uso", "/cookies": "Política de Cookies", "/devolucao": "Devolução", "/aviso-legal": "Aviso legal" } },
  en: { sobre: "Legal information", atualizado: "Last updated", vejaTambem: "See also", links: { "/privacidade": "Privacy Policy", "/termos": "Terms of Use", "/cookies": "Cookie Policy", "/devolucao": "Returns", "/aviso-legal": "Legal notice" } },
  es: { sobre: "Información legal", atualizado: "Última actualización", vejaTambem: "Consulta también", links: { "/privacidade": "Política de privacidad", "/termos": "Términos de uso", "/cookies": "Política de cookies", "/devolucao": "Devoluciones", "/aviso-legal": "Aviso legal" } },
  fr: { sobre: "Informations légales", atualizado: "Dernière mise à jour", vejaTambem: "Voir aussi", links: { "/privacidade": "Politique de confidentialité", "/termos": "Conditions d’utilisation", "/cookies": "Politique relative aux cookies", "/devolucao": "Retours", "/aviso-legal": "Mentions légales" } },
  de: { sobre: "Rechtliche Hinweise", atualizado: "Zuletzt aktualisiert", vejaTambem: "Siehe auch", links: { "/privacidade": "Datenschutzerklärung", "/termos": "Nutzungsbedingungen", "/cookies": "Cookie-Richtlinie", "/devolucao": "Widerrufsbelehrung", "/aviso-legal": "Impressum" } },
};

export function PaginaLegal({ titulo, atualizadoEm, locale = "pt", children }: {
  titulo: string;
  atualizadoEm: string;
  locale?: SiteLocale;
  children: ReactNode;
}) {
  const m = MOLDURA[locale];
  const links = Object.entries(m.links);
  return (
    <main
      className="mx-auto w-full max-w-3xl px-6 pb-16 text-ink"
      style={{ paddingTop: HEADER_HEIGHT_PX + 40 }}
    >
      <p className="eyebrow-ink">{m.sobre}</p>
      <h1 className="mt-2 font-display text-4xl">{titulo}</h1>
      <p className="mt-3 text-sm text-ink/60">{m.atualizado}: {atualizadoEm}</p>
      <div className="mt-10 space-y-8 leading-7 text-ink/80">{children}</div>
      <p className="mt-12 border-t border-sand pt-6 text-sm text-ink/65">
        {m.vejaTambem}:{" "}
        {links.map(([href, rotulo], i) => (
          <span key={href}>
            <Link className="underline hover:text-ink" href={localizePath(href, locale)}>{rotulo}</Link>
            {i < links.length - 1 ? " · " : "."}
          </span>
        ))}
      </p>
    </main>
  );
}
