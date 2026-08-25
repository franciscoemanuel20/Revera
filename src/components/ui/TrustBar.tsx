export interface TrustBarItem {
  label: string;
}

const ITENS_PADRAO: TrustBarItem[] = [
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
