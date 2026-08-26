import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatarBRL } from "@/lib/format/money";
import { formatarDataHora } from "@/lib/format/date";
import { STATUS_BADGE_CLASS, STATUS_LABEL, type OrderStatusValue } from "@/lib/admin/order-status";
import { PrintButton } from "../PrintButton";
import { StatusActions } from "../StatusActions";

const METODO_LABEL: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão de crédito",
  boleto: "Boleto",
};

const PAGAMENTO_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  failed: "Falhou",
  refunded: "Estornado",
};

export default async function DetalhePedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: pedido, error: erroPedido }, { data: historico }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "*, customers(full_name, email, phone, cpf), addresses(*), order_items(*), payments(*), shipments(*)"
      )
      .eq("id", id)
      .maybeSingle(),
    // audit_logs.entity_id é `text`, não uuid — comparação por igualdade de
    // string funciona porque quem grava (mudarStatusPedidoAction) sempre
    // passa o mesmo uuid como string.
    supabase
      .from("audit_logs")
      .select("id, action, diff, created_at")
      .eq("entity_type", "orders")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (erroPedido || !pedido) {
    notFound();
  }

  const cliente = pedido.customers as {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    cpf: string | null;
  } | null;

  const endereco = pedido.addresses as {
    recipient_name: string;
    cep: string;
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
  } | null;

  const itens = (pedido.order_items ?? []) as Array<{
    id: string;
    product_name_snapshot: string;
    variant_label_snapshot: string | null;
    unit_price_cents: number;
    quantity: number;
    subtotal_cents: number;
  }>;

  const pagamentos = (pedido.payments ?? []) as Array<{
    id: string;
    provider: string;
    method: string | null;
    status: string;
    amount_cents: number;
    created_at: string;
  }>;

  const envio = (pedido.shipments ?? [])[0] as
    | {
        provider: string;
        service_name: string | null;
        tracking_code: string | null;
        label_url: string | null;
        status: string | null;
      }
    | undefined;

  const status = pedido.status as OrderStatusValue;

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="font-display text-2xl text-ink">Pedido {pedido.order_number}</h1>
        <PrintButton />
      </div>

      {/* Título "limpo" só para a folha impressa: hidden na tela normal,
          print:block só quando a página está sendo impressa — o h1 de cima
          (que vem com o botão Imprimir do lado) já é print:hidden no seu
          wrapper, então a folha impressa nunca fica sem título nenhum. */}
      <div className="hidden print:block">
        <h1 className="font-display text-2xl text-ink">Pedido {pedido.order_number}</h1>
        <p className="text-sm text-ink/70">Emitido em {formatarDataHora(new Date().toISOString())}</p>
      </div>

      <span
        className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${STATUS_BADGE_CLASS[status]}`}
      >
        {STATUS_LABEL[status] ?? status}
      </span>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-lg border border-sand p-4">
          <h2 className="font-display text-lg text-ink">Cliente</h2>
          <p className="text-sm text-ink/80">{cliente?.full_name ?? "—"}</p>
          <p className="text-sm text-ink/60">{cliente?.email ?? "—"}</p>
          <p className="text-sm text-ink/60">{cliente?.phone ?? "—"}</p>
          {cliente?.cpf ? <p className="text-sm text-ink/60">CPF: {cliente.cpf}</p> : null}
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-sand p-4">
          <h2 className="font-display text-lg text-ink">Endereço de entrega</h2>
          {endereco ? (
            <>
              <p className="text-sm text-ink/80">{endereco.recipient_name}</p>
              <p className="text-sm text-ink/60">
                {endereco.street}, {endereco.number}
                {endereco.complement ? ` — ${endereco.complement}` : ""}
              </p>
              <p className="text-sm text-ink/60">
                {endereco.neighborhood} — {endereco.city}/{endereco.state}
              </p>
              <p className="text-sm text-ink/60">CEP {endereco.cep}</p>
            </>
          ) : (
            <p className="text-sm text-ink/60">Sem endereço registrado.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-ink">Itens</h2>
        <table className="w-full border-collapse text-left text-sm text-ink">
          <thead>
            <tr className="border-b border-sand">
              <th className="px-3 py-2 font-medium text-ink/70">Produto</th>
              <th className="px-3 py-2 font-medium text-ink/70">Variante</th>
              <th className="px-3 py-2 font-medium text-ink/70">Qtd.</th>
              <th className="px-3 py-2 font-medium text-ink/70">Preço unit.</th>
              <th className="px-3 py-2 font-medium text-ink/70">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={item.id} className="border-b border-sand/60">
                <td className="px-3 py-2">{item.product_name_snapshot}</td>
                <td className="px-3 py-2 text-ink/70">{item.variant_label_snapshot ?? "—"}</td>
                <td className="px-3 py-2">{item.quantity}</td>
                <td className="px-3 py-2">{formatarBRL(item.unit_price_cents)}</td>
                <td className="px-3 py-2">{formatarBRL(item.subtotal_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm text-ink/80 sm:text-right">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatarBRL(pedido.subtotal_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Desconto</span>
            <span>-{formatarBRL(pedido.discount_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Frete</span>
            <span>{formatarBRL(pedido.shipping_cents)}</span>
          </div>
          <div className="flex justify-between font-display text-lg text-ink">
            <span>Total</span>
            <span>{formatarBRL(pedido.total_cents)}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border border-sand p-4">
          <h2 className="font-display text-lg text-ink">Pagamento</h2>
          {pagamentos.length === 0 ? (
            <p className="text-sm text-ink/60">Nenhuma tentativa de pagamento registrada ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pagamentos.map((p) => (
                <li key={p.id} className="flex flex-col gap-0.5 border-b border-sand/60 pb-2 text-sm last:border-0">
                  <span className="text-ink/80">
                    {p.provider} · {METODO_LABEL[p.method ?? ""] ?? p.method ?? "método não informado"}
                  </span>
                  <span className="text-ink/60">
                    {PAGAMENTO_STATUS_LABEL[p.status] ?? p.status} — {formatarBRL(p.amount_cents)} —{" "}
                    {formatarDataHora(p.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-sand p-4">
          <h2 className="font-display text-lg text-ink">Envio</h2>
          {envio ? (
            <>
              <p className="text-sm text-ink/80">
                {envio.provider} {envio.service_name ? `— ${envio.service_name}` : ""}
              </p>
              <p className="text-sm text-ink/60">Status: {envio.status ?? "—"}</p>
              <p className="text-sm text-ink/60">Rastreio: {envio.tracking_code ?? "—"}</p>
              {envio.label_url ? (
                <a
                  href={envio.label_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-ink underline decoration-gold decoration-2 underline-offset-4"
                >
                  Ver etiqueta
                </a>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-ink/60">Nenhum envio registrado ainda.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3 print:hidden">
        <h2 className="font-display text-lg text-ink">Ações</h2>
        <StatusActions orderId={pedido.id} status={status} />
      </section>

      <section className="flex flex-col gap-2 print:hidden">
        <h2 className="font-display text-lg text-ink">Histórico</h2>
        {(historico ?? []).length === 0 ? (
          <p className="text-sm text-ink/60">Nenhuma mudança registrada ainda além da criação do pedido.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-ink/70">
            {(historico ?? []).map((h) => (
              <li key={h.id} className="border-b border-sand/60 py-1">
                {formatarDataHora(h.created_at)} — {descreverAcao(h.action, h.diff)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function descreverAcao(action: string, diff: unknown): string {
  if (action === "pedido.mudar_status" && diff && typeof diff === "object" && "de" in diff && "para" in diff) {
    const d = diff as { de: OrderStatusValue; para: OrderStatusValue };
    return `Status mudou de "${STATUS_LABEL[d.de] ?? d.de}" para "${STATUS_LABEL[d.para] ?? d.para}"`;
  }
  return action;
}
