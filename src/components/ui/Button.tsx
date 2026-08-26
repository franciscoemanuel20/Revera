import type { ButtonHTMLAttributes } from "react";

// Esqueleto — três variantes cobrem o que a loja precisa por enquanto
// (CTA de compra, ação secundária, ação discreta em admin). Estado de
// loading/disabled fica para quando a rota de checkout existir de verdade.
type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

// primary usa texto PRETO sobre o dourado, não branco: dourado (#c9b45f)
// com branco dá ~1,9:1 de contraste — ilegível e reprovado em WCAG. Com
// o preto da marca dá ~9:1. Isso NÃO mudou na camada visual de 25/08/2026 —
// só o fundo deixou de ser bg-gold chapado e passou a ser bg-gold-metal (o
// degradê de três tons, ver globals.css), com um brilho sutil (box-shadow,
// não animação de layout) no hover em vez de só trocar de tom sólido. É o
// que faz o botão ler como "placa dourada" da logo, não adesivo colorido.
// primary sobrescreve a base `transition-colors` (linha do botão, abaixo)
// por `transition-all`: o hover agora anima filter + box-shadow, não só
// cor, e misturar duas classes de transition-property diferentes deixaria
// o resultado dependendo da ordem de geração do Tailwind, não do que está
// escrito aqui. Um botão só, sem scroll envolvido — não é o tipo de
// animação que a regra de performance desta entrega mira (essa é sobre
// scroll, ver Reveal.tsx).
// transition-colors ficou em cada variante (não mais na string base do
// botão): primary precisa de transition-all (filter + box-shadow), e
// misturar as duas classes de transition-property na mesma string deixaria
// o resultado dependendo da ordem de geração do Tailwind.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-gold-metal text-ink transition-all duration-300 hover:brightness-105 hover:shadow-glow-gold",
  secondary: "bg-transparent text-ink border border-ink transition-colors hover:bg-sand",
  ghost: "bg-transparent text-ink transition-colors hover:bg-sand",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-3 text-base",
  lg: "px-6 py-4 text-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`min-h-toque min-w-toque rounded-md font-body font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    />
  );
}
