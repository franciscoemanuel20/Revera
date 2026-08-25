"use client";

export interface QuantitySelectorProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

// Sem estoque real ligado ainda — `max` é opcional e, se vier, só trava o
// botão de "+". A checagem contra product_variants.stock_qty de verdade
// acontece no carrinho/servidor, não aqui (componente não confia em si
// mesmo para regra de negócio).
export function QuantitySelector({ value, onChange, min = 1, max }: QuantitySelectorProps) {
  const podeDiminuir = value > min;
  const podeAumentar = max == null || value < max;

  return (
    <div className="inline-flex items-center rounded-md border border-sand">
      <button
        type="button"
        aria-label="Diminuir quantidade"
        disabled={!podeDiminuir}
        onClick={() => onChange(value - 1)}
        className="min-h-toque min-w-toque text-lg text-ink disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-8 text-center font-body text-ink" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label="Aumentar quantidade"
        disabled={!podeAumentar}
        onClick={() => onChange(value + 1)}
        className="min-h-toque min-w-toque text-lg text-ink disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
