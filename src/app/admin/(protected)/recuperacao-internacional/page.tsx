import { createClient } from "@/lib/supabase/server";
import { montarPreviasRecuperacaoInternacional, type PedidoRecuperacaoInternacional } from "@/lib/notificacoes/recuperacao-internacional";
import { formatarValorNaMoeda } from "@/lib/internacional/moeda";

export default async function RecuperacaoInternacionalPage() {
  const supabase = await createClient();
  const cutoffAbandono = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, created_at, currency, total_cents, payment_status, canceled_at, customers(full_name,email,phone,country), payment_journey_events(created_at)")
    .neq("currency", "BRL")
    .is("canceled_at", null)
    .order("created_at", { ascending: false });

  const pedidos: PedidoRecuperacaoInternacional[] = (data ?? []).flatMap((row) => {
    const customerRaw = row.customers as unknown;
    const customer = (Array.isArray(customerRaw) ? customerRaw[0] : customerRaw) as { full_name?: string; email?: string | null; phone?: string | null; country?: string | null } | null;
    if (!customer?.full_name || !customer.country) return [];
    const eventos = (row.payment_journey_events ?? []) as Array<{ created_at: string }>;
    const ultimaAtividade = eventos.reduce(
      (maisRecente, evento) => Date.parse(evento.created_at) > Date.parse(maisRecente) ? evento.created_at : maisRecente,
      row.created_at
    );
    return [{
      id: row.id,
      orderNumber: row.order_number,
      createdAt: ultimaAtividade,
      currency: row.currency,
      totalCents: row.total_cents,
      paymentStatus: row.payment_status,
      country: customer.country,
      customer: { name: customer.full_name, email: customer.email ?? null, phone: customer.phone ?? null },
    }];
  });
  // Pedidos pagos recentes precisam continuar na entrada para suprimir a
  // identidade inteira. O corte de inatividade vale apenas para candidatos
  // ainda pendentes, dentro da função pura e testável abaixo.
  const previas = montarPreviasRecuperacaoInternacional(pedidos, {
    abandonadoAntesDe: cutoffAbandono,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Recuperação internacional — prévia</h1>
        <p className="text-sm text-ink/60">Uma pessoa aparece uma única vez. Esta tela não envia mensagens, exclui pedidos pagos ou cancelados e só considera pedidos sem atividade há pelo menos 1 hora.</p>
      </div>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Modo de prévia ativo: revise idioma, destinatário e contexto antes de criar qualquer canal de envio.
      </div>
      {error ? <p className="text-sm text-red-700">Não foi possível carregar os pedidos.</p> : null}
      <div className="flex flex-col gap-4">
        {previas.map((p) => (
          <article key={p.id} className="rounded-lg border border-sand bg-paper p-4">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <a className="font-medium underline" href={`/admin/pedidos/${p.id}`}>{p.orderNumber}</a>
              <span>{formatarValorNaMoeda(p.totalCents, p.currency)}</span>
            </div>
            <p className="mt-1 text-xs text-ink/60">{p.destinatario} · idioma {p.idioma}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-ink/80">{p.mensagem}</p>
          </article>
        ))}
        {!error && previas.length === 0 ? <p className="text-sm text-ink/60">Nenhum pedido internacional pendente.</p> : null}
      </div>
    </div>
  );
}
