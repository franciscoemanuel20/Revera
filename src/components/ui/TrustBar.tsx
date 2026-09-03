import { CHAVES_TRUSTBAR, TRUSTBAR } from "@/lib/conteudo/registro/trustbar";

export interface TrustBarItem {
  label: string;
}

// O padrão da barra vem do registro (registro/trustbar.ts), a MESMA fonte que
// o painel edita — não uma cópia à mão. Assim, se a home ou a página de
// produto renderizarem a TrustBar sem passar `items` (fallback), o texto
// mostrado é idêntico ao `padrao` do registro, e não existe risco de as duas
// cópias divergirem. O texto vem do fato de garantia do Francisco (mesmo texto
// de seeds/faq.json) — para mudar o item, edite o registro, não invente aqui.
const ITENS_PADRAO: TrustBarItem[] = CHAVES_TRUSTBAR.map((chave) => ({
  label: TRUSTBAR[chave].padrao,
}));

// Único lugar do design system que usa --moss (ver src/styles/tokens.css):
// selo de confiança/garantia, nunca cor de botão ou link. As duas páginas que
// usam a barra (home e produto) passam `items` já editados pelo painel via
// itensDaTrustBar(); o padrão acima só entra se alguém renderizar sem props.
export function TrustBar({ items = ITENS_PADRAO }: { items?: TrustBarItem[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-moss">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span aria-hidden="true">✓</span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
