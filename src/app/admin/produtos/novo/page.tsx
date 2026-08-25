import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "../ProductForm";

// Cadastro de produto novo — mesmo ProductForm do modo edição
// (src/app/admin/produtos/[id]/page.tsx), só sem initialData. As três
// listas abaixo (tamanho/cor/grisalho) são cadastro fixo da loja — este
// escopo não inclui tela de CRUD para elas, só popular os selects daqui.
export default async function NovoProdutoPage() {
  const supabase = await createClient();

  const [{ data: sizes }, { data: colors }, { data: grayLevels }] = await Promise.all([
    supabase.from("sizes").select("id, label").order("sort_order"),
    supabase.from("colors").select("id, code, name").order("sort_order"),
    supabase.from("gray_levels").select("id, percent, label").order("sort_order"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-ink">Novo produto</h1>
      <ProductForm
        sizes={(sizes ?? []).map((s) => ({ id: s.id, label: s.label }))}
        colors={(colors ?? []).map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
        grayLevels={(grayLevels ?? []).map((g) => ({ id: g.id, label: `${g.percent}% — ${g.label}` }))}
      />
    </div>
  );
}
