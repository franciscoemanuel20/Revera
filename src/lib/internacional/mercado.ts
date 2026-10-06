import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { reveraInternationalCheckoutDisponivel } from "@/lib/payments/revera";
import { ehMoedaSuportada, type Moeda } from "./moeda";
import { paisesDoCheckout, regraDoPais } from "./paises";
import { converterCentavosBrl, type CotacaoPtax } from "./cambio-ptax";

/**
 * Prontidão de um MERCADO internacional — a resposta honesta à pergunta
 * "dá para vender para este país AGORA?".
 *
 * O mercado só aparece quando as duas condições gerais existem:
 *   1. está em CHECKOUT_PAISES (decisão do Francisco, por env);
 *   2. há gateway internacional configurado (Stripe ou PayPal);
 *
 * O endereço do comprador é necessário para consultar a cotação DHL em
 * tempo real; ela não pode ser pré-aprovada por país. `precosDoCarrinho`
 * valida as variantes no servidor, e a Server Action repete preço e frete
 * imediatamente antes de criar qualquer pedido.
 */

export interface CotacaoInternacional {
  id: string;
  carrier: string;
  serviceName: string;
  currency: Moeda;
  priceCents: number;
  etaDiasMin: number | null;
  etaDiasMax: number | null;
  validaAte: string;
}

export type ProntidaoMercado =
  | { aberto: true; moeda: Moeda }
  | { aberto: false; motivo: string; codigo?: "pais" | "pagamento" | "frete" | "precos" };

/**
 * Cotação de frete vigente para o país, na moeda dada. A mais RECENTE entre
 * as ativas e válidas — não a mais barata: cotação de frete manual não é
 * leilão, é o preço que a operação cadastrou por último.
 */
export async function cotacaoFreteInternacional(
  pais: string,
  moeda: Moeda,
  cotacaoId?: string
): Promise<CotacaoInternacional | null> {
  const supabase = createAdminClient();
  const hoje = new Date().toISOString().slice(0, 10);

  let consulta = supabase
    .from("intl_shipping_quotes")
    .select("id, carrier, service_name, currency, price_cents, eta_days_min, eta_days_max, valid_until")
    .eq("country", pais.toUpperCase())
    .eq("currency", moeda)
    .eq("is_active", true)
    .eq("carrier", "DHL")
    .lte("quoted_at", hoje)
    .gte("valid_until", hoje);
  if (cotacaoId) consulta = consulta.eq("id", cotacaoId);
  const { data, error } = await consulta
    .order("quoted_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[mercado] falha ao ler cotação internacional", error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as string,
    carrier: data.carrier as string,
    serviceName: data.service_name as string,
    currency: data.currency as Moeda,
    priceCents: data.price_cents as number,
    etaDiasMin: (data.eta_days_min as number | null) ?? null,
    etaDiasMax: (data.eta_days_max as number | null) ?? null,
    validaAte: data.valid_until as string,
  };
}

export interface PedidoInternacionalPagavel {
  pagavel: boolean;
  expiraEm?: Date;
  cotadaEm?: Date;
}

// Janela operacional da loja: até 3 h para iniciar pagamento, 20 s para a
// chamada ao gateway e mais 3 h para concluir a ordem PayPal. Não é prazo
// garantido pela DHL.
export const JANELA_MAXIMA_PAGAMENTO_INTERNACIONAL_MS = 6 * 60 * 60_000 + 20_000;
export const JANELA_MAXIMA_INICIO_PAYPAL_MS = 3 * 60 * 60_000 - 60_000;

export function cotacaoPermiteNovoPayPal(cotadaEm: Date, agora = Date.now()): boolean {
  const idade = agora - cotadaEm.getTime();
  return Number.isFinite(idade) && idade >= -30_000 && idade <= JANELA_MAXIMA_INICIO_PAYPAL_MS;
}

export async function pedidoInternacionalPagavel(
  pais: string,
  moeda: string,
  pedidoId: string,
  freteContratado: number,
  shippingQuoteId: string | null
): Promise<PedidoInternacionalPagavel> {
  const mercado = await prontidaoDoMercado(pais);
  if (!mercado.aberto || mercado.moeda !== moeda || !pedidoId || !shippingQuoteId) return { pagavel: false };
  const { data, error } = await createAdminClient().from("shipping_quotes")
    .select("id, order_id, carrier, price_cents, service_name, eta_days, raw_response, created_at")
    .eq("id", shippingQuoteId).eq("order_id", pedidoId).eq("carrier", "DHL")
    .maybeSingle();
  if (error || !data || data.id !== shippingQuoteId || data.order_id !== pedidoId || data.price_cents !== freteContratado) {
    return { pagavel: false };
  }
  const raw = data.raw_response as Record<string, unknown> | null;
  const produtoDhl = raw?.product_code;
  const reciboCoerente = raw?.source === "mydhl-production" && raw?.environment === "producao" &&
    raw?.country === pais.toUpperCase() && raw?.currency === moeda &&
    (produtoDhl === "8" || produtoDhl === "P") &&
    typeof data.service_name === "string" && data.service_name.length > 0 &&
    raw?.service_name === data.service_name &&
    raw?.eta_days === data.eta_days &&
    (raw?.delivery_date === null || typeof raw?.delivery_date === "string");
  if (!reciboCoerente) return { pagavel: false };
  const cotadaEm = Date.parse(String(raw?.quoted_at ?? ""));
  const idadeDaCotacao = Date.now() - cotadaEm;
  // A validade abaixo limita a vida do link ao período operacional definido
  // pela loja; não representa validade garantida pela DHL. A Rating oficial
  // é indicativa e a transportadora não garante divergência com a tarifa final.
  if (!Number.isFinite(cotadaEm) || idadeDaCotacao < -30_000 || idadeDaCotacao > JANELA_MAXIMA_PAGAMENTO_INTERNACIONAL_MS) {
    return { pagavel: false };
  }
  return {
    pagavel: true,
    expiraEm: new Date(cotadaEm + JANELA_MAXIMA_PAGAMENTO_INTERNACIONAL_MS),
    cotadaEm: new Date(cotadaEm),
  };
}

export async function prontidaoDoMercado(pais: string): Promise<ProntidaoMercado> {
  const iso = pais.toUpperCase();
  const regra = regraDoPais(iso);

  if (!regra || iso === "BR") {
    return { aberto: false, motivo: "Este caminho é só para mercado internacional." };
  }
  if (!paisesDoCheckout().includes(iso)) {
    return { aberto: false, motivo: "Ainda não vendemos para este país.", codigo: "pais" };
  }
  if (!ehMoedaSuportada(regra.moedaPadrao)) {
    return { aberto: false, motivo: "Moeda do mercado não suportada." };
  }
  if (!(await reveraInternationalCheckoutDisponivel())) {
    return { aberto: false, motivo: "Pagamento internacional indisponível.", codigo: "pagamento" };
  }

  return { aberto: true, moeda: regra.moedaPadrao };
}

/**
 * Uma variante vendável ausente bloqueia TODO o mercado, inclusive carrinhos
 * de outros produtos. Variante ativa sem preço nacional ou sem estoque não
 * bloqueia: ela já não pode ser comprada no Brasil nem adicionada ao carrinho.
 *
 * É a mesma fronteira usada pela vitrine (`is_active && price_cents > 0 &&
 * stock_qty > 0`). Assim o internacional continua fail-closed para tudo que
 * alguém consegue comprar, mas não fica travado por uma variante administrativa
 * ou de mídia com `price_cents = 0` / `stock_qty = 0`.
 */
export async function catalogoCompletoNoMercado(moeda: Moeda): Promise<boolean> {
  const db = createAdminClient();
  const [variantes, precos] = await Promise.all([
    db
      .from("product_variants")
      .select("id, price_cents, stock_qty, products!inner(status)", { count: "exact" })
      .eq("is_active", true)
      .eq("products.status", "active")
      .gt("price_cents", 0)
      .gt("stock_qty", 0),
    db.from("variant_prices").select("variant_id", { count: "exact" })
      .eq("currency", moeda).eq("is_active", true).gt("price_cents", 0),
  ]);
  // Resposta truncada, erro ou catálogo vazio nunca significa pronto.
  if (variantes.error || precos.error || !variantes.data?.length || !precos.data ||
      variantes.count !== variantes.data.length || precos.count !== precos.data.length) return false;
  const ids = new Set(precos.data.map(p => p.variant_id));
  return variantes.data.every(v => ids.has(v.id));
}

export interface ItemPrecificado {
  variantId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export type PrecosDoMercado =
  | { ok: true; itens: ItemPrecificado[]; subtotalCents: number }
  | { ok: false; semPreco: string[] };

/**
 * Preço dos itens do carrinho NA MOEDA do mercado, lido de variant_prices.
 *
 * Regras deliberadas:
 *  - preço internacional é o preço brasileiro atual convertido pela PTAX;
 *    variant_prices define somente quais variantes podem ser exportadas;
 *  - desconto por quantidade NÃO se aplica ao internacional: a escada
 *    650/620/600 é regra comercial do mercado brasileiro. Se um dia houver
 *    escada internacional, ela nasce como dado próprio, não como herança.
 */
export async function precosDoCarrinhoNoMercado(
  itens: Array<{ variantId: string; quantity: number; basePriceCents: number }>,
  moeda: Moeda,
  cotacao: CotacaoPtax
): Promise<PrecosDoMercado> {
  if (itens.length === 0) return { ok: true, itens: [], subtotalCents: 0 };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("variant_prices")
    .select("variant_id, price_cents")
    .in("variant_id", itens.map((i) => i.variantId))
    .eq("currency", moeda)
    .eq("is_active", true)
    .gt("price_cents", 0);

  if (error) {
    console.error("[mercado] falha ao ler variant_prices", error);
    return { ok: false, semPreco: itens.map((i) => i.variantId) };
  }

  const precoPorVariante = new Map(
    (data ?? []).map((l) => [l.variant_id as string, l.price_cents as number])
  );

  const semPreco = itens
    .filter((i) => !precoPorVariante.has(i.variantId))
    .map((i) => i.variantId);
  if (semPreco.length > 0) return { ok: false, semPreco };

  const precificados = itens.map((i) => {
    // variant_prices é a lista de produtos aprovados para exportação. O
    // valor cobrado nasce do preço brasileiro atual convertido pela PTAX.
    const unit = converterCentavosBrl(i.basePriceCents, cotacao.reaisPorUnidade);
    return {
      variantId: i.variantId,
      quantity: i.quantity,
      unitPriceCents: unit,
      subtotalCents: unit * i.quantity,
    };
  });

  return {
    ok: true,
    itens: precificados,
    subtotalCents: precificados.reduce((s, i) => s + i.subtotalCents, 0),
  };
}
