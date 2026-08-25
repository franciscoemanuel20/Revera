// Mesmo enum de orders.status na migration — mudar um sem mudar o outro
// quebra este componente (TypeScript acusa, é o objetivo do union type).
export type OrderStatusValue =
  | "new"
  | "paid"
  | "preparing"
  | "label_ready"
  | "shipped"
  | "delivered"
  | "canceled"
  | "warranty";

const LABELS: Record<OrderStatusValue, string> = {
  new: "Recebido",
  paid: "Pagamento aprovado",
  preparing: "Em preparação",
  label_ready: "Etiqueta gerada",
  shipped: "Enviado",
  delivered: "Entregue",
  canceled: "Cancelado",
  warranty: "Em garantia",
};

export interface OrderStatusProps {
  status: OrderStatusValue;
  orderNumber: string;
  trackingCode?: string | null;
}

export function OrderStatus({ status, orderNumber, trackingCode }: OrderStatusProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-sand p-4">
      <p className="text-sm text-ink/60">Pedido {orderNumber}</p>
      <p className="font-display text-lg text-ink">{LABELS[status]}</p>
      {trackingCode ? <p className="text-sm text-ink/60">Rastreio: {trackingCode}</p> : null}
    </div>
  );
}
