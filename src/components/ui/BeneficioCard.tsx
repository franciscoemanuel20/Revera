import type { ReactNode } from "react";

export interface BeneficioCardProps {
  icone: ReactNode;
  titulo: string;
  texto: string;
}

/**
 * Cartão da grade "Por que a Reverá" (08/09/2026) — ícone + título + texto
 * curto, sobre fundo claro. Sem biblioteca de ícones: três ícones de traço
 * simples não justificam a dependência nova. `icone`
 * recebe o `<svg>` pronto de quem monta a grade, então este componente não
 * precisa saber nada sobre o desenho de cada um.
 */
export function BeneficioCard({ icone, titulo, texto }: BeneficioCardProps) {
  return (
    <div className="group relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-sand bg-paper p-6 text-center shadow-[0_1px_0_rgb(255_255_255_/_0.9)] transition-all duration-300 hover:-translate-y-1 hover:border-gold/70 hover:shadow-soft">
      <span aria-hidden className="absolute inset-x-8 top-0 h-px bg-gold/0 transition-colors duration-300 group-hover:bg-gold/80" />
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sand/70 text-gold-deep transition-transform duration-300 group-hover:scale-105" aria-hidden="true">
        {icone}
      </span>
      <h3 className="font-display text-lg text-ink">{titulo}</h3>
      <p className="text-sm text-ink/70">{texto}</p>
    </div>
  );
}
