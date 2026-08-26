"use client";

import { Button } from "@/components/ui/Button";

// Editor de faixas de `quantity_discount_rules` — extraído de
// src/app/admin/(protected)/produtos/ProductForm.tsx (26/08/2026) para o
// módulo /admin/precos (visão consolidada por produto) usar exatamente a
// mesma UI de linha, em vez de reimplementar o mesmo grid de inputs numa
// tela nova. Controlado por fora (rules + onChange) — quem chama decide
// onde o estado mora (ProductForm.tsx dentro do formulário grande; a tela
// de preços dentro do seu próprio form menor).

export interface DiscountRuleRow {
  key: string;
  id?: string;
  minQty: string;
  mode: "preco" | "percentual";
  unitPriceReais: string;
  discountPercent: string;
  label: string;
  // yyyy-mm-dd (formato de <input type="date">) ou "" para "sem limite".
  startsAt: string;
  endsAt: string;
  sortOrder: string;
  isActive: boolean;
}

export function novaChaveRegra(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `linha-${Date.now()}-${Math.random()}`;
}

export function novaRegraDesconto(proximaOrdem = 0): DiscountRuleRow {
  return {
    key: novaChaveRegra(),
    minQty: "",
    mode: "percentual",
    unitPriceReais: "",
    discountPercent: "",
    label: "",
    startsAt: "",
    endsAt: "",
    sortOrder: String(proximaOrdem),
    isActive: true,
  };
}

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";
const selectClass = inputClass;

export interface DiscountRulesEditorProps {
  rules: DiscountRuleRow[];
  onChange: (rules: DiscountRuleRow[]) => void;
}

export function DiscountRulesEditor({ rules, onChange }: DiscountRulesEditorProps) {
  function atualizar(key: string, patch: Partial<DiscountRuleRow>) {
    onChange(rules.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function remover(key: string) {
    onChange(rules.filter((r) => r.key !== key));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-ink">Desconto por quantidade</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange([...rules, novaRegraDesconto(rules.length)])}
        >
          Adicionar regra
        </Button>
      </div>

      {rules.length === 0 ? <p className="text-sm text-ink/60">Nenhuma regra de desconto cadastrada.</p> : null}

      <div className="flex flex-col gap-4">
        {rules.map((regra) => (
          <div key={regra.key} className="grid grid-cols-2 gap-3 rounded-md border border-sand p-4 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm text-ink">
              Quantidade mínima
              <input
                type="number"
                min="1"
                step="1"
                required
                value={regra.minQty}
                onChange={(e) => atualizar(regra.key, { minQty: e.target.value })}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-ink">
              Tipo de desconto
              <select
                value={regra.mode}
                onChange={(e) => atualizar(regra.key, { mode: e.target.value as DiscountRuleRow["mode"] })}
                className={selectClass}
              >
                <option value="percentual">Percentual</option>
                <option value="preco">Preço unitário fixo</option>
              </select>
            </label>

            {regra.mode === "percentual" ? (
              <label className="flex flex-col gap-1 text-sm text-ink">
                Desconto (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={regra.discountPercent}
                  onChange={(e) => atualizar(regra.key, { discountPercent: e.target.value })}
                  className={inputClass}
                />
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-sm text-ink">
                Preço unitário (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={regra.unitPriceReais}
                  onChange={(e) => atualizar(regra.key, { unitPriceReais: e.target.value })}
                  className={inputClass}
                />
              </label>
            )}

            <label className="flex flex-col gap-1 text-sm text-ink">
              Rótulo (opcional)
              <input
                value={regra.label}
                onChange={(e) => atualizar(regra.key, { label: e.target.value })}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-ink">
              Vigência — início (opcional)
              <input
                type="date"
                value={regra.startsAt}
                onChange={(e) => atualizar(regra.key, { startsAt: e.target.value })}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-ink">
              Vigência — fim (opcional)
              <input
                type="date"
                value={regra.endsAt}
                onChange={(e) => atualizar(regra.key, { endsAt: e.target.value })}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-ink">
              Ordem
              <input
                type="number"
                min="0"
                step="1"
                value={regra.sortOrder}
                onChange={(e) => atualizar(regra.key, { sortOrder: e.target.value })}
                className={inputClass}
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={regra.isActive}
                onChange={(e) => atualizar(regra.key, { isActive: e.target.checked })}
                className="h-5 w-5"
              />
              Ativa
            </label>

            <div className="flex items-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => remover(regra.key)}>
                Remover regra
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
