import type { ReactNode } from "react";

export interface BeneficioCardProps {
  icone: ReactNode;
  titulo: string;
  texto: string;
}

/**
 * Cartão da grade "Por que a Reverá" (08/09/2026) — ícone + título + texto
 * curto, sobre fundo claro. Sem biblioteca de ícones: o projeto não tinha
 * nenhuma antes desta entrega (só o SVG inline de BotaoWhatsAppHome.tsx), e
 * três ícones de traço simples não justificam a dependência nova. `icone`
 * recebe o `<svg>` pronto de quem monta a grade, então este componente não
 * precisa saber nada sobre o desenho de cada um.
 */
export function BeneficioCard({ icone, titulo, texto }: BeneficioCardProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-sand bg-paper p-6 text-center shadow-soft">
      <span className="text-gold-deep" aria-hidden="true">
        {icone}
      </span>
      <h3 className="font-display text-lg text-ink">{titulo}</h3>
      <p className="text-sm text-ink/70">{texto}</p>
    </div>
  );
}
