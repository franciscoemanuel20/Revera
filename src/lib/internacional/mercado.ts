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
 * Um país só abre quando TODAS as pernas existem:
 *   1. está em CHECKOUT_PAISES (decisão do Francisco, por env);
 *   2. há gateway internacional configurado (Stripe ou PayPal);
 *   3. há cotação de frete ATIVA e DENTRO DA VALIDADE para o país, na
 *      moeda do mercado (tabela intl_shipping_quotes — cotação manual,
 *      cadastrada pela operação; frete não se inventa);
 *   4. cada item do carrinho tem preço comercial NA MOEDA do mercado
 *      (variant_prices — preço não se converte, se decide).
 *
 * As pernas 1–3 são do mercado; a 4 é do carrinho. Por isso a checagem é
 * em duas funções: prontidaoDoMercado() para a tela decidir o que oferece,
 * e precosDoCarrinhoNoMercado() para o pedido nascer certo — as duas
 * rodam NO SERVIDOR, e a segunda roda de novo na Server Action, porque
 * tela não é fonte de verdade.
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

export async function pedidoInternacionalPagavel(pais: string, moeda: string, pedidoId: string, freteContratado: number): Promise<boolean> {
  const mercado = await prontidaoDoMercado(pais);
  if (!mercado.aberto || mercado.moeda !== moeda || !pedidoId) return false;
  const { data, error } = await createAdminClient().from("shipping_quotes")
    .select("carrier, price_cents, raw_response, created_at")
    .eq("order_id", pedidoId).eq("carrier", "DHL")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data || data.price_cents !== freteContratado) return false;
  const criadoEm = Date.parse(data.created_at as string);
  // A cotação vale 24 h, mas só emitimos uma cobrança nas primeiras 21 h.
  // Stripe e PayPal expiram seus checkouts em até 3 h, portanto nenhum link
  // emitido dentro desta janela sobrevive à validade econômica do frete.
  if (!Number.isFinite(criadoEm) || Date.now() - criadoEm > 21 * 60 * 60_000) return false;
  const raw = data.raw_response as Record<string, unknown> | null;
  return raw?.source === "mydhl-production" && raw?.environment === "producao" &&
    raw?.country === pais.toUpperCase() && raw?.currency === moeda;
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
