/**
 * Máquina de estados de `orders.status` — pedidos/actions.ts é o único
 * lugar que ESCREVE o status a partir de uma ação do admin; este arquivo só
 * decide se uma transição pedida é válida, sem tocar em banco (mesmo
 * espírito de src/lib/pricing/discount.ts: regra pura, testável sem
 * Postgres — ver tests/unit/order-status.test.ts).
 *
 * Mesmo enum de src/components/ui/OrderStatus.tsx (que não foi editado
 * aqui: aquele componente é usado por telas de cliente/checkout, fora do
 * escopo deste módulo administrativo — o tipo é redeclarado, não
 * reexportado, para não criar uma dependência do admin sobre um componente
 * que outra frente do projeto está mexendo agora).
 */
export type OrderStatusValue =
  | "new"
  | "paid"
  | "preparing"
  | "label_ready"
  | "shipped"
  | "delivered"
  | "canceled"
  | "warranty";

export const STATUS_LABEL: Record<OrderStatusValue, string> = {
  new: "Novo",
  paid: "Pago",
  preparing: "Preparando",
  label_ready: "Etiqueta pronta",
  shipped: "Enviado",
  delivered: "Entregue",
  canceled: "Cancelado",
  warranty: "Garantia",
};

// Classe Tailwind por status, para o badge da lista e do detalhe — mesma
// paleta em todo lugar que mostra status de pedido no admin, para nunca
// existir uma tela mostrando "Pago" em cinza e outra em verde.
export const STATUS_BADGE_CLASS: Record<OrderStatusValue, string> = {
  new: "bg-sand text-ink",
  paid: "bg-moss/15 text-moss",
  preparing: "bg-gold/15 text-gold-deep",
  label_ready: "bg-gold/15 text-gold-deep",
  shipped: "bg-ink/10 text-ink",
  delivered: "bg-moss/25 text-moss",
  canceled: "bg-red-100 text-red-700",
  warranty: "bg-red-100 text-red-700",
};

// "Pago ou posterior" — o conjunto que conta como venda de verdade para o
// dashboard (vendas hoje/período, ticket médio). 'canceled' nunca entra
// aqui mesmo tendo passado por 'paid' antes: dinheiro estornado não é
// venda. 'new' também fica de fora: ainda não houve confirmação do
// gateway.
export const STATUS_VENDA_CONFIRMADA: OrderStatusValue[] = [
  "paid",
  "preparing",
  "label_ready",
  "shipped",
  "delivered",
  "warranty",
];

export const ERRO_PAGO_MANUAL =
  'O admin não marca pedido como "pago" manualmente — só o webhook do provedor de pagamento faz essa transição, depois de confirmar com o gateway (ver src/app/api/webhooks/pagamento/route.ts). Aguarde a confirmação automática ou verifique o pagamento direto no painel do provedor.';

// De -> [transições manuais permitidas]. 'paid' nunca aparece como destino
// em lugar nenhum deste mapa — de propósito, ver ERRO_PAGO_MANUAL acima.
// 'canceled' e 'delivered' fecham o ciclo por aqui; 'warranty' é destino
// só a partir de 'delivered' (abrir garantia antes de entregar não faz
// sentido) e não tem saída manual de volta — resolver a garantia em si é
// o fluxo de warranty_requests (módulo /admin/solicitacoes), não uma nova
// mudança de status do pedido.
const TRANSICOES_MANUAIS: Record<OrderStatusValue, OrderStatusValue[]> = {
  new: ["canceled"],
  paid: ["preparing", "canceled"],
  preparing: ["label_ready", "canceled"],
  label_ready: ["shipped", "canceled"],
  shipped: ["delivered"],
  delivered: ["warranty"],
  canceled: [],
  warranty: [],
};

export type ResultadoValidacao = { ok: true } | { ok: false; erro: string };

export function validarTransicaoPedido(
  atual: OrderStatusValue,
  destino: OrderStatusValue
): ResultadoValidacao {
  if (destino === "paid") {
    return { ok: false, erro: ERRO_PAGO_MANUAL };
  }
  if (atual === destino) {
    return { ok: false, erro: "O pedido já está neste status." };
  }
  const permitidas = TRANSICOES_MANUAIS[atual];
  if (!permitidas.includes(destino)) {
    return {
      ok: false,
      erro: `Não é possível mover o pedido de "${STATUS_LABEL[atual]}" direto para "${STATUS_LABEL[destino]}". Siga a sequência do pedido.`,
    };
  }
  return { ok: true };
}

export function transicoesDisponiveis(atual: OrderStatusValue): OrderStatusValue[] {
  return TRANSICOES_MANUAIS[atual];
}
