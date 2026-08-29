import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { createAdminClient } from "@/lib/supabase/server";
import { confirmarPagamento } from "@/lib/payments/confirmar";
import { consumirPurchaseParaNavegador } from "@/lib/tracking/purchase";
import { formatarDinheiroParaComprador } from "@/lib/internacional/moeda";
import { idiomaDoPais, localeDoPais } from "@/lib/internacional/paises";
import { LANG_HTML, textos } from "@/lib/internacional/idioma";
import { daLinha, formatarEndereco, type LinhaEndereco } from "@/lib/internacional/endereco";
import { PurchaseTracker } from "./PurchaseTracker";
import { SuportePosCompra } from "./SuportePosCompra";

export const metadata: Metadata = {
  title: "Seu pedido",
  // Página de pedido não deve ser indexada nem aparecer em busca.
  robots: { index: false, follow: false },
};

const ORDEM_DOS_PASSOS = [
  "new",
  "paid",
  "preparing",
  "label_ready",
  "shipped",
  "delivered",
] as const;

/**
 * O rótulo de cada passo vem do dicionário, mas a ORDEM não: ela é a
 * máquina de estados do pedido e não muda com a língua.
 */
function passos(t: ReturnType<typeof textos>) {
  const rotulos: Record<(typeof ORDEM_DOS_PASSOS)[number], string> = {
    new: t.pedidoPassoRecebido,
    paid: t.pedidoPassoPago,
    preparing: t.pedidoPassoPreparando,
    label_ready: t.pedidoPassoEtiqueta,
    shipped: t.pedidoPassoEnviado,
    delivered: t.pedidoPassoEntregue,
  };
  return ORDEM_DOS_PASSOS.map((chave) => ({ chave, rotulo: rotulos[chave] }));
}

/**
 * Acompanhamento do pedido — e PORTA 2 da confirmação de pagamento.
 *
 * O cliente chega aqui de duas formas: voltando do gateway logo após pagar
 * (é o `redirect_url` que mandamos), ou depois, para acompanhar a entrega.
 *
 * Nos dois casos, se o pedido ainda está 'new', esta página PERGUNTA AO
 * GATEWAY se foi pago (ver src/lib/payments/confirmar.ts). É o que salva a
 * venda quando o webhook não chega — situação real, registrada no projeto
 * irmão em 12/08/2026, que custou um pedido perdido em silêncio.
 *
 * Acesso pelo `access_token` (uuid aleatório), não por id sequencial: não
 * dá para enumerar pedidos de outras pessoas trocando um número na URL.
 */
export default async function PedidoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: pedido } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_status, subtotal_cents, discount_cents, shipping_cents, total_cents, currency, created_at, address_id"
    )
    .eq("access_token", token)
    .maybeSingle();

  if (!pedido) notFound();

  // PORTA 2. Só age se ainda estiver aguardando pagamento. O eixo legado
  // `status` volta a 'new' num pedido ESTORNADO (o CASE gerado não tem
  // 'refunded'), então a condição olha o eixo real do dinheiro — sem isso,
  // cada visita a um pedido estornado dispararia uma consulta ao gateway.
  if (pedido.status === "new" && pedido.payment_status === "pending") {
    await confirmarPagamento(pedido.id);
  }

  // Relê depois da tentativa de confirmação, para mostrar o estado atual.
  const { data: atual } = await supabase
    .from("orders")
    .select("status, payment_status, shipping_cents, total_cents")
    .eq("id", pedido.id)
    .maybeSingle();

  const status = (atual?.status ?? pedido.status) as string;
  const estornado = (atual?.payment_status ?? pedido.payment_status) === "refunded";
  const pago = !estornado && status !== "new" && status !== "canceled";

  const [{ data: itens }, { data: endereco }, { data: envio }] = await Promise.all([
    supabase
      .from("order_items")
      .select("product_name_snapshot, variant_label_snapshot, quantity, unit_price_cents, subtotal_cents")
      .eq("order_id", pedido.id),
    pedido.address_id
      ? supabase
          .from("addresses")
          .select(
            "recipient_name, company, country, street, number, complement, neighborhood, city, state, cep, line1, line2, postal_code, region"
          )
          .eq("id", pedido.address_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("shipments")
      .select("tracking_code, service_name, status")
      .eq("order_id", pedido.id)
      .maybeSingle(),
  ]);

  /**
   * A língua desta página é a do PAÍS DE ENTREGA do pedido, não a de quem
   * abre o link. O mesmo link pode ser aberto pelo comprador em Miami e
   * pela equipe em São José dos Campos — e ele precisa ser o mesmo
   * documento nos dois lugares, senão "qual tela você está vendo?" vira
   * pergunta de suporte.
   */
  const paisDoPedido = (endereco?.country as string | undefined) ?? "BR";
  const idioma = idiomaDoPais(paisDoPedido);
  const t = textos(idioma);
  /**
   * Todo dinheiro desta página sai na MOEDA DO PEDIDO (bug pego no E2E de
   * 28/08: pedido de US$ 970 aparecia como "R$ 970,00" para o cliente — a
   * mesma classe de defeito corrigida no admin em e636f0e, que ninguém
   * tinha ligado aqui). `na()` é o único formatador da página, e agrupa o
   * número no locale de quem lê: "1,250.00" para o americano.
   */
  const na = (cents: number) =>
    formatarDinheiroParaComprador(
      cents,
      (pedido.currency as string) ?? "BRL",
      localeDoPais(paisDoPedido)
    );

  // Purchase: só sai daqui, uma vez, e só se o pagamento foi confirmado.
  const purchase = pago
    ? await consumirPurchaseParaNavegador(supabase, pedido.id)
    : null;

  const PASSOS = passos(t);
  const indiceAtual = PASSOS.findIndex((p) => p.chave === status);

  return (
    <main
      lang={LANG_HTML[idioma]}
      className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 40 }}
    >
      {purchase ? <PurchaseTracker payload={purchase} /> : null}

      <header className="flex flex-col gap-2 text-center">
        <span className="eyebrow-ink">{t.pedidoNumero(pedido.order_number as string)}</span>
        <h1 className="font-display text-3xl text-ink">
          {estornado ? t.pedidoEstornado : pago ? t.pedidoPago : t.pedidoAguardando}
        </h1>
        <p className="text-ink/70">
          {estornado
            ? t.pedidoTextoEstornado
            : pago
              ? t.pedidoTextoPago
              : t.pedidoTextoAguardando}
        </p>
      </header>

      {status === "canceled" ? (
        <p className="rounded-lg border border-sand p-4 text-center text-ink/80">
          {t.pedidoCancelado}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {PASSOS.map((passo, i) => {
            const alcancado = indiceAtual >= i;
            return (
              <li key={passo.chave} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    alcancado ? "bg-gold" : "bg-sand"
                  }`}
                />
                <span className={alcancado ? "text-ink" : "text-ink/45"}>
                  {passo.rotulo}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {envio?.tracking_code ? (
        <section className="flex flex-col gap-1 rounded-lg border border-sand p-4">
          <span className="eyebrow-ink">{t.pedidoRastreamento}</span>
          <p className="font-mono text-lg text-ink">{envio.tracking_code}</p>
          {envio.service_name ? (
            <p className="text-sm text-ink/70">{envio.service_name}</p>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-ink">{t.pedidoItens}</h2>
        <ul className="flex flex-col gap-2">
          {(itens ?? []).map((item, i) => (
            <li key={i} className="flex justify-between gap-4 text-sm">
              <span className="text-ink">
                {item.quantity}× {item.product_name_snapshot}
                {item.variant_label_snapshot ? (
                  <span className="text-ink/60"> — {item.variant_label_snapshot}</span>
                ) : null}
              </span>
              <span className="tabular-nums text-ink">
                {na(item.subtotal_cents as number)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-1 border-t border-sand pt-3 text-sm">
          <Linha rotulo={t.pedidoSubtotal} valor={na(pedido.subtotal_cents)} />
          {pedido.discount_cents > 0 ? (
            <Linha rotulo={t.pedidoDesconto} valor={`− ${na(pedido.discount_cents)}`} />
          ) : null}
          <Linha
            rotulo={t.pedidoFrete}
            valor={
              (atual?.shipping_cents ?? pedido.shipping_cents) > 0
                ? na(atual?.shipping_cents ?? pedido.shipping_cents)
                : t.pedidoFreteACombinar
            }
          />
          <div className="flex justify-between pt-1 font-display text-lg text-ink">
            <dt>{t.pedidoTotal}</dt>
            <dd className="tabular-nums">
              {na(atual?.total_cents ?? pedido.total_cents)}
            </dd>
          </div>
        </dl>
      </section>

      {endereco ? (
        <section className="flex flex-col gap-1">
          <h2 className="font-display text-xl text-ink">{t.pedidoEntrega}</h2>
          <p className="text-sm text-ink/80">
            {/* formatarEndereco decide o layout pelo PAÍS (bug do E2E de
                28/08: endereço americano saía no molde brasileiro, com
                vírgulas soltas e "CEP" vazio). daLinha devolve null para
                linha incoerente — aí o fallback mostra só o nome. */}
            {(() => {
              const dominio = daLinha(endereco as unknown as LinhaEndereco, "");
              const linhas = dominio
                ? formatarEndereco(dominio)
                : [endereco.recipient_name as string];
              return linhas.map((linha, i) => (
                <span key={i}>
                  {linha}
                  {i < linhas.length - 1 ? <br /> : null}
                </span>
              ));
            })()}
          </p>
        </section>
      ) : null}

      {/* O contato só existe DEPOIS do pagamento confirmado — regra comercial
          do projeto. E o botão não dispara evento de conversão nenhum: o
          Purchase já saiu na confirmação, contá-lo de novo seria inflar. */}
      {pago ? <SuportePosCompra numeroPedido={pedido.order_number} idioma={idioma} /> : null}
    </main>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between text-ink/80">
      <dt>{rotulo}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}
