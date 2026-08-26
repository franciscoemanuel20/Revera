import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminTable, type AdminTableColumn } from "@/components/ui/AdminTable";
import { formatarBRL } from "@/lib/format/money";
import { formatarDataHora } from "@/lib/format/date";
import { STATUS_BADGE_CLASS, STATUS_LABEL, type OrderStatusValue } from "@/lib/admin/order-status";

const COLUNAS: AdminTableColumn[] = [
  { key: "codigo", label: "Pedido" },
  { key: "cliente", label: "Cliente" },
  { key: "data", label: "Data" },
  { key: "total", label: "Total" },
  { key: "status", label: "Status" },
  { key: "pagamento", label: "Pagamento" },
];

const METODO_LABEL: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão de crédito",
  boleto: "Boleto",
};

// Lista de pedidos — "o módulo mais importante" da entrega (26/08/2026).
// Filtro por status via querystring (?status=paid) em vez de estado de
// cliente: assim um link do dashboard ("Ver pedidos") já chega filtrado,
// sem precisar de JS no navegador para isso.
//
// Igual a src/app/admin/(protected)/produtos/page.tsx: enquanto a
// migration 00000000000005 não for aplicada, esta consulta volta vazia
// (RLS sem policy de admin ainda) — não é bug desta tela.
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusFiltro } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select("id, order_number, status, total_cents, created_at, customers(full_name), payments(method, status, created_at)")
    .order("created_at", { ascending: false });

  if (statusFiltro && statusFiltro in STATUS_LABEL) {
    query = query.eq("status", statusFiltro);
  }

  const { data: pedidos, error } = await query;

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl text-ink">Pedidos</h1>
        <p className="text-sm text-red-700">
          Não foi possível carregar os pedidos. Se isto persistir, confira se a migration
          00000000000005_admin_pedidos_policies.sql já foi aplicada no Supabase.
        </p>
      </div>
    );
  }

  const linhas = (pedidos ?? []).map((pedido) => {
    const cliente = pedido.customers as { full_name: string | null } | { full_name: string | null }[] | null;
    const nomeCliente = Array.isArray(cliente) ? cliente[0]?.full_name : cliente?.full_name;

    const pagamentos = (pedido.payments ?? []) as Array<{
      method: string | null;
      status: string;
      created_at: string;
    }>;
    const melhorPagamento = escolherPagamentoMaisRelevante(pagamentos);
    const status = pedido.status as OrderStatusValue;

    return {
      codigo: (
        <Link
          href={`/admin/pedidos/${pedido.id}`}
          className="font-medium text-ink underline decoration-gold decoration-2 underline-offset-4 hover:decoration-gold-deep"
        >
          {pedido.order_number}
        </Link>
      ),
      cliente: nomeCliente ?? "—",
      data: formatarDataHora(pedido.created_at),
      total: formatarBRL(pedido.total_cents),
      status: (
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[status]}`}>
          {STATUS_LABEL[status] ?? status}
        </span>
      ),
      pagamento: melhorPagamento
        ? (METODO_LABEL[melhorPagamento.method ?? ""] ?? melhorPagamento.method ?? "—")
        : "—",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-ink">Pedidos</h1>

      <div className="flex flex-wrap gap-2">
        <FiltroLink status={undefined} atual={statusFiltro} label="Todos" />
        {(Object.keys(STATUS_LABEL) as OrderStatusValue[]).map((status) => (
          <FiltroLink key={status} status={status} atual={statusFiltro} label={STATUS_LABEL[status]} />
        ))}
      </div>

      <AdminTable columns={COLUNAS} rows={linhas} emptyMessage="Nenhum pedido encontrado." />
    </div>
  );
}

function FiltroLink({ status, atual, label }: { status?: string; atual?: string; label: string }) {
  const ativo = status === atual || (status === undefined && !atual);
  return (
    <Link
      href={status ? `/admin/pedidos?status=${status}` : "/admin/pedidos"}
      className={`rounded-full border px-3 py-1.5 text-sm ${
        ativo ? "border-gold bg-gold/10 text-ink" : "border-sand text-ink/70 hover:bg-sand"
      }`}
    >
      {label}
    </Link>
  );
}

// Um pedido pode ter várias tentativas de pagamento (falha + aprovado, ver
// webhook). Para a coluna "forma de pagamento" da lista, o que interessa é
// o pagamento aprovado quando existe; sem nenhum aprovado, mostra a
// tentativa mais recente (para o admin ver que ALGUMA coisa já foi
// tentada), em vez de "—" enganoso.
function escolherPagamentoMaisRelevante(
  pagamentos: Array<{ method: string | null; status: string; created_at: string }>
) {
  if (pagamentos.length === 0) return null;
  const aprovado = pagamentos.find((p) => p.status === "approved");
  if (aprovado) return aprovado;
  return [...pagamentos].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}
