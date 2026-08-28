import { createClient } from "@/lib/supabase/server";
import { pagamentoInternacionalDisponivel } from "@/lib/payments";
import { paisesDoCheckout, nomeDoPais, bandeira, PAISES } from "@/lib/internacional/paises";
import { PrecosInternacionais } from "./PrecosInternacionais";
import { CotacoesFrete } from "./CotacoesFrete";

/**
 * Painel Internacional — as três alavancas que abrem (ou mantêm fechado)
 * um mercado, lado a lado com o estado real de cada uma:
 *
 *   1. preço por mercado (variant_prices) — editável aqui;
 *   2. cotação de frete vigente (intl_shipping_quotes) — editável aqui;
 *   3. gateway + CHECKOUT_PAISES — somente leitura aqui, porque são
 *      variáveis de ambiente: mudam no deploy, não no painel.
 *
 * A tela NUNCA mostra um mercado como aberto se alguma perna falta — a
 * mesma função (paisesDoCheckout/pagamentoInternacionalDisponivel) que o
 * checkout usa é a que pinta este status. Uma fonte, dois leitores.
 */
export default async function InternacionalPage() {
  const supabase = await createClient();

  const [{ data: variantes }, { data: cotacoes }] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, sku, price_cents, products(name, status), variant_prices(currency, price_cents, is_active)")
      .order("sku"),
    supabase
      .from("intl_shipping_quotes")
      .select(
        "id, country, carrier, service_name, currency, price_cents, max_weight_g, eta_days_min, eta_days_max, quoted_at, valid_until, is_active, notes"
      )
      .order("created_at", { ascending: false }),
  ]);

  const stripeOk = pagamentoInternacionalDisponivel();
  const paisesAbertos = paisesDoCheckout().filter((p) => p !== "BR");
  const paisesConhecidos = Object.keys(PAISES).filter((p) => p !== "BR");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl text-ink">Internacional</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/70">
          Preço por mercado e frete internacional são definidos AQUI, à mão — nada é
          convertido do real automaticamente. Um país só abre no checkout quando tem
          gateway, preço e cotação de frete válidos ao mesmo tempo.
        </p>
      </div>

      <section className="rounded-lg border border-sand bg-paper p-4 text-sm">
        <h2 className="font-medium text-ink">Estado das alavancas</h2>
        <ul className="mt-2 space-y-1 text-ink/80">
          <li>
            Gateway internacional (Stripe):{" "}
            {stripeOk ? (
              <span className="text-moss">configurado</span>
            ) : (
              <span className="font-medium text-amber-800">NÃO CONFIGURADO</span>
            )}
          </li>
          <li>
            Países liberados no checkout (CHECKOUT_PAISES):{" "}
            {paisesAbertos.length > 0 ? (
              paisesAbertos.map((p) => `${bandeira(p)} ${nomeDoPais(p)}`).join(" · ")
            ) : (
              <span className="font-medium text-amber-800">nenhum — só Brasil</span>
            )}
          </li>
          <li className="text-xs text-ink/60">
            Países que o sistema sabe representar:{" "}
            {paisesConhecidos.map((p) => nomeDoPais(p)).join(", ")}. Liberar um país é
            mudança de variável de ambiente no deploy, de propósito — não sai deste painel.
          </li>
        </ul>
      </section>

      <PrecosInternacionais
        variantes={(variantes ?? []).map((v) => ({
          id: v.id as string,
          sku: v.sku as string,
          nomeProduto:
            ((v.products as { name?: string } | null)?.name as string | undefined) ?? "—",
          precoBRLCents: (v.price_cents as number | null) ?? 0,
          precos: ((v.variant_prices ?? []) as Array<{
            currency: string;
            price_cents: number;
            is_active: boolean;
          }>).map((p) => ({
            moeda: p.currency,
            priceCents: p.price_cents,
            ativo: p.is_active,
          })),
        }))}
      />

      <CotacoesFrete
        cotacoes={((cotacoes ?? []) as Array<Record<string, unknown>>).map((c) => ({
          id: c.id as string,
          country: c.country as string,
          carrier: c.carrier as string,
          serviceName: c.service_name as string,
          currency: c.currency as string,
          priceCents: c.price_cents as number,
          maxWeightG: (c.max_weight_g as number | null) ?? null,
          etaDiasMin: (c.eta_days_min as number | null) ?? null,
          etaDiasMax: (c.eta_days_max as number | null) ?? null,
          quotedAt: c.quoted_at as string,
          validUntil: c.valid_until as string,
          ativa: c.is_active as boolean,
          notes: (c.notes as string | null) ?? null,
        }))}
      />
    </div>
  );
}
