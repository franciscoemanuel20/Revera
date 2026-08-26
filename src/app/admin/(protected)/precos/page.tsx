import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminTable, type AdminTableColumn } from "@/components/ui/AdminTable";
import { formatarBRL } from "@/lib/format/money";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

const COLUNAS: AdminTableColumn[] = [
  { key: "nome", label: "Produto" },
  { key: "status", label: "Status" },
  { key: "faixas", label: "Faixas de desconto" },
];

// Visão consolidada de preço/desconto por produto — o formulário de
// produto (src/app/admin/(protected)/produtos/ProductForm.tsx) já edita
// `quantity_discount_rules` inline; esta tela existe para a dona bater o
// olho em todos os produtos de uma vez, sem abrir cada um. A edição de
// verdade acontece em /admin/precos/[id], que chama a mesma
// sincronizarRegrasDesconto do formulário de produto (ver
// src/lib/admin/discount-rules.ts) — nada aqui recalcula preço sozinho.
export default async function PrecosPage() {
  const supabase = await createClient();
  const { data: produtos, error } = await supabase
    .from("products")
    .select("id, name, status, quantity_discount_rules(min_qty, unit_price_cents, discount_percent, label, is_active)")
    .order("sort_order", { ascending: true });

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl text-ink">Preços</h1>
        <p className="text-sm text-red-700">
          Não foi possível carregar os produtos. Se isto persistir, confira se a migration
          00000000000005_admin_pedidos_policies.sql já foi aplicada no Supabase.
        </p>
      </div>
    );
  }

  const linhas = (produtos ?? []).map((produto) => {
    const regras = (produto.quantity_discount_rules ?? []) as Array<{
      min_qty: number;
      unit_price_cents: number | null;
      discount_percent: number | null;
      label: string | null;
      is_active: boolean;
    }>;
    const ativas = regras.filter((r) => r.is_active).sort((a, b) => a.min_qty - b.min_qty);

    return {
      nome: (
        <Link
          href={`/admin/precos/${produto.id}`}
          className="font-medium text-ink underline decoration-gold decoration-2 underline-offset-4 hover:decoration-gold-deep"
        >
          {produto.name}
        </Link>
      ),
      status: STATUS_LABEL[produto.status] ?? produto.status,
      faixas:
        ativas.length === 0 ? (
          <span className="text-ink/50">Nenhuma regra ativa</span>
        ) : (
          <span className="text-ink/80">
            {ativas
              .map((r) =>
                r.unit_price_cents != null
                  ? `${r.min_qty}+ un.: ${formatarBRL(r.unit_price_cents)} cada`
                  : `${r.min_qty}+ un.: -${r.discount_percent}%`
              )
              .join(" · ")}
          </span>
        ),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-ink">Preços</h1>
      <AdminTable columns={COLUNAS} rows={linhas} emptyMessage="Nenhum produto cadastrado ainda." />
    </div>
  );
}
