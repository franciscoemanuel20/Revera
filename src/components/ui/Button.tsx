import type { ButtonHTMLAttributes } from "react";

// Esqueleto — três variantes cobrem o que a loja precisa por enquanto
// (CTA de compra, ação secundária, ação discreta em admin). Estado de
// loading/disabled fica para quando a rota de checkout existir de verdade.
type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

// primary usa texto PRETO sobre o dourado, não branco: dourado (#c9b45f)
// com branco dá ~1,9:1 de contraste — ilegível e reprovado em WCAG. Com
// o preto da marca dá ~9:1. Além de acessível, é o que faz o botão ler
// como "placa dourada", que é o gesto da logo.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-gold text-ink hover:bg-gold-light",
  secondary: "bg-transparent text-ink border border-ink hover:bg-sand",
  ghost: "bg-transparent text-ink hover:bg-sand",
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
      className={`min-h-toque min-w-toque rounded-md font-body font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    />
  );
}
