"use client";

export interface VariantOption {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface VariantSelectorProps {
  label: string;
  options: VariantOption[];
  selectedId: string | null;
  onChange: (id: string) => void;
}

// Genérico de propósito — serve para tamanho, comprimento ou qualquer
// outra dimensão de product_variants que não seja cor (que tem componente
// próprio, ColorSelector, porque cor precisa de swatch visual).
export function VariantSelector({ label, options, selectedId, onChange }: VariantSelectorProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selecionado = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              disabled={option.disabled}
              aria-pressed={selecionado}
              onClick={() => onChange(option.id)}
              className={`min-h-toque rounded-md border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                selecionado
                  ? "border-copper bg-copper text-paper"
                  : "border-sand text-ink hover:border-copper"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
