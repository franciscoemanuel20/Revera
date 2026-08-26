"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { DiscountLadder } from "@/components/ui/DiscountLadder";
import { DiscountRulesEditor, type DiscountRuleRow } from "@/components/admin/DiscountRulesEditor";
import { reaisParaCentavos } from "@/lib/format/money";
import { salvarPrecosProdutoAction } from "../actions";

export interface PrecosFormProps {
  productId: string;
  basePriceCents: number;
  initialRules: DiscountRuleRow[];
}

// Mesma conta de preço que a vitrine usa (applyQuantityDiscount, dentro de
// DiscountLadder — ver comentário daquele componente) alimentada com o
// estado AINDA NÃO salvo desta tela: a prévia abaixo do editor mostra o
// efeito de "o que eu estou digitando agora", não o que já está no banco.
// currentQuantity usa a maior quantidade mínima entre as regras ativas —
// só para garantir que alguma faixa apareça destacada na prévia; não é uma
// simulação de carrinho de cliente de verdade.
export function PrecosForm({ productId, basePriceCents, initialRules }: PrecosFormProps) {
  const router = useRouter();
  const [rules, setRules] = useState<DiscountRuleRow[]>(initialRules);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const regrasParaPreview = rules
    .filter((r) => r.isActive && r.minQty.trim())
    .map((r) => ({
      minQty: Number(r.minQty),
      unitPriceCents: r.mode === "preco" && r.unitPriceReais.trim() ? reaisParaCentavos(Number(r.unitPriceReais)) : null,
      discountPercent: r.mode === "percentual" && r.discountPercent.trim() ? Number(r.discountPercent) : null,
      isActive: true,
      label: r.label.trim() || null,
    }));
  const maiorMinQty = regrasParaPreview.reduce((maior, r) => Math.max(maior, r.minQty), 1);

  async function handleSalvar() {
    setErro(null);
    setSucesso(false);
    setSalvando(true);

    const resultado = await salvarPrecosProdutoAction({
      productId,
      discountRules: rules.map((r) => ({
        id: r.id,
        minQty: Number(r.minQty || "0"),
        unitPriceCents:
          r.mode === "preco" && r.unitPriceReais.trim() ? reaisParaCentavos(Number(r.unitPriceReais)) : null,
        discountPercent:
          r.mode === "percentual" && r.discountPercent.trim() ? Number(r.discountPercent) : null,
        label: r.label.trim() ? r.label : null,
        startsAt: r.startsAt.trim() ? new Date(r.startsAt).toISOString() : null,
        endsAt: r.endsAt.trim() ? new Date(r.endsAt).toISOString() : null,
        sortOrder: Number(r.sortOrder || "0"),
        isActive: r.isActive,
      })),
    });

    setSalvando(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    setSucesso(true);
    router.refresh();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8 pb-16">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      {sucesso ? <Toast message="Preços salvos." variant="success" onClose={() => setSucesso(false)} /> : null}

      {basePriceCents > 0 && regrasParaPreview.length > 0 ? (
        <div className="rounded-lg border border-sand p-4">
          <DiscountLadder
            basePriceCents={basePriceCents}
            currentQuantity={maiorMinQty}
            rules={regrasParaPreview}
          />
        </div>
      ) : null}

      <DiscountRulesEditor rules={rules} onChange={setRules} />

      <div>
        <Button type="button" onClick={handleSalvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar preços"}
        </Button>
      </div>
    </div>
  );
}
