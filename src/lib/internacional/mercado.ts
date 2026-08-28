import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { pagamentoInternacionalDisponivel } from "@/lib/payments";
import { ehMoedaSuportada, type Moeda } from "./moeda";
import { paisesDoCheckout, regraDoPais } from "./paises";

/**
 * Prontidão de um MERCADO internacional — a resposta honesta à pergunta
 * "dá para vender para este país AGORA?".
 *
 * Um país só abre quando TODAS as pernas existem:
 *   1. está em CHECKOUT_PAISES (decisão do Francisco, por env);
 *   2. há gateway internacional configurado (Stripe);
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
  | { aberto: true; moeda: Moeda; frete: CotacaoInternacional }
  | { aberto: false; motivo: string };

/**
 * Cotação de frete vigente para o país, na moeda dada. A mais RECENTE entre
 * as ativas e válidas — não a mais barata: cotação de frete manual não é
 * leilão, é o preço que a operação cadastrou por último.
 */
export async function cotacaoFreteInternacional(
  pais: string,
  moeda: Moeda
): Promise<CotacaoInternacional | null> {
  const supabase = createAdminClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("intl_shipping_quotes")
    .select("id, carrier, service_name, currency, price_cents, eta_days_min, eta_days_max, valid_until")
    .eq("country", pais.toUpperCase())
    .eq("currency", moeda)
    .eq("is_active", true)
    .gte("valid_until", hoje)
    .order("quoted_at", { ascending: false })
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

export async function prontidaoDoMercado(pais: string): Promise<ProntidaoMercado> {
  const iso = pais.toUpperCase();
  const regra = regraDoPais(iso);

  if (!regra || iso === "BR") {
    return { aberto: false, motivo: "Este caminho é só para mercado internacional." };
  }
  if (!paisesDoCheckout().includes(iso)) {
    return { aberto: false, motivo: "Ainda não vendemos para este país." };
  }
  if (!ehMoedaSuportada(regra.moedaPadrao)) {
    return { aberto: false, motivo: "Moeda do mercado não suportada." };
  }
  if (!pagamentoInternacionalDisponivel()) {
    return { aberto: false, motivo: "Pagamento internacional não configurado." };
  }

  const frete = await cotacaoFreteInternacional(iso, regra.moedaPadrao);
  if (!frete) {
    return {
      aberto: false,
      motivo: "Frete internacional não configurado para este destino.",
    };
  }

  return { aberto: true, moeda: regra.moedaPadrao, frete };
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
 *  - preço internacional é DEFINIDO pelo Francisco por mercado, nunca
 *    convertido do BRL. Variante sem linha ativa em variant_prices →
 *    mercado bloqueado para aquele carrinho ("PREÇO NÃO CONFIGURADO");
 *  - desconto por quantidade NÃO se aplica ao internacional: a escada
 *    650/620/600 é regra comercial do mercado brasileiro. Se um dia houver
 *    escada internacional, ela nasce como dado próprio, não como herança.
 */
export async function precosDoCarrinhoNoMercado(
  itens: Array<{ variantId: string; quantity: number }>,
  moeda: Moeda
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
    const unit = precoPorVariante.get(i.variantId) as number;
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
