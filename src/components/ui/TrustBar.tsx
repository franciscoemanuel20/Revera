export interface TrustBarItem {
  label: string;
}

// EXPORTADO só para o teste comparar contra `REGISTRO["trustbar.item1"|2].padrao`
// (src/lib/conteudo/registro/trustbar.ts) e pegar as duas listas divergindo.
//
// Desde 06/09/2026 o registro é a fonte de verdade — home e produto sempre
// passam `items` vindo de lá. Isto continua existindo como a última rede: um
// caller novo que esqueça de passar `items` ainda mostra os selos certos, em
// vez de uma lista vazia.
export const ITENS_PADRAO: TrustBarItem[] = [
  { label: "Teste de qualidade antes do envio" },
  { label: "7 dias úteis de garantia" },
];

// Único lugar do design system que usa --moss (ver src/styles/tokens.css):
// selo de confiança/garantia, nunca cor de botão ou link. Os dois itens
// padrão vêm direto do fato de garantia dado pelo Francisco (mesmo texto
// de seeds/faq.json, pergunta "Como funciona a garantia?") — não invente
// item novo aqui sem confirmar o fato primeiro.
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
