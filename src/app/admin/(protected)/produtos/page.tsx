import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminTable, type AdminTableColumn } from "@/components/ui/AdminTable";
import { Button } from "@/components/ui/Button";
import { formatarBRL } from "@/lib/format/money";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

const COLUNAS: AdminTableColumn[] = [
  { key: "nome", label: "Produto" },
  { key: "status", label: "Status" },
  { key: "variantes", label: "Variantes" },
  { key: "preco", label: "Preço" },
  { key: "destaque", label: "Destaque" },
];

// Lista de produtos do admin. Enquanto a migration 00000000000002 não for
// aplicada no projeto real, esta consulta só devolve produtos com
// status='active' (é a única policy de SELECT que existe hoje em
// products) — não é bug desta tela, é RLS fazendo o que a migration
// antiga já promete até a nova ser aplicada.
export default async function ProdutosPage() {
  const supabase = await createClient();
  const { data: produtos, error } = await supabase
    .from("products")
    .select("id, name, status, is_featured, product_variants(price_cents)")
    .order("sort_order", { ascending: true });

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl text-ink">Produtos</h1>
        <p className="text-sm text-red-700">
          Não foi possível carregar os produtos. Se isto persistir, confira se a
          migration de policies de admin já foi aplicada no Supabase.
        </p>
      </div>
    );
  }

  const linhas = (produtos ?? []).map((produto) => {
    const variantes = (produto.product_variants ?? []) as Array<{ price_cents: number | null }>;
    const precos = variantes.map((v) => v.price_cents).filter((p): p is number => p != null);
    const faixaPreco =
      precos.length === 0
        ? "—"
        : Math.min(...precos) === Math.max(...precos)
          ? formatarBRL(Math.min(...precos))
          : `${formatarBRL(Math.min(...precos))} – ${formatarBRL(Math.max(...precos))}`;

    return {
      nome: (
        <Link href={`/admin/produtos/${produto.id}`} className="font-medium text-ink underline decoration-gold decoration-2 underline-offset-4 hover:decoration-gold-deep">
          {produto.name}
        </Link>
      ),
      status: STATUS_LABEL[produto.status] ?? produto.status,
      variantes: variantes.length,
      preco: faixaPreco,
      destaque: produto.is_featured ? "Sim" : "Não",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Produtos</h1>
        <Link href="/admin/produtos/novo">
          <Button>Novo produto</Button>
        </Link>
      </div>

      <AdminTable columns={COLUNAS} rows={linhas} emptyMessage="Nenhum produto cadastrado ainda." />
    </div>
  );
}
