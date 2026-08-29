import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { createAdminClient } from "@/lib/supabase/server";
import { permiteSimulacao } from "@/lib/config/ambiente";
import { formatarBRL } from "@/lib/format/money";
import { SimuladorAcoes } from "./SimuladorAcoes";

export const metadata: Metadata = {
  title: "Pagamento simulado",
  robots: { index: false, follow: false },
};

/**
 * Faz o papel da tela do gateway quando PAYMENT_PROVIDER=mock.
 *
 * Existe para o fluxo inteiro — carrinho, checkout, pagamento, webhook,
 * pedido pago, Purchase — poder ser exercitado sem dinheiro real e sem
 * depender de conta em gateway nenhum. Não é enfeite de desenvolvimento: é
 * o que permite testar o caminho do dinheiro antes de existir dinheiro.
 *
 * Quando PAYMENT_PROVIDER=infinitepay, o cliente vai para a tela real deles
 * e esta página nunca aparece.
 *
 * As ações daqui chamam o MESMO webhook que o gateway real chamaria, com o
 * mesmo formato de corpo — inclusive passando pelo segredo no caminho. Ou
 * seja: o caminho testado aqui é o caminho de produção, não um atalho.
 */
export default async function CheckoutSimuladoPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  // Fecha a porta fora de desenvolvimento: esta tela nunca deve aparecer
  // para um cliente de verdade.
  //
  // P0-2/P0-3 (27/08/2026): antes a condição era
  // `(process.env.PAYMENT_PROVIDER ?? "mock") !== "mock"` — que, com a
  // variável ausente, considerava o ambiente "mock" e ABRIA o simulador.
  // Num deploy sem configuração, esta página de "pagar sem pagar" ficaria
  // pública. Agora exige as duas coisas: mock pedido explicitamente E
  // ambiente de desenvolvimento (ver src/lib/config/ambiente.ts).
  if (!permiteSimulacao() || process.env.PAYMENT_PROVIDER?.trim() !== "mock") {
    notFound();
  }

  const { pedido: orderId } = await searchParams;
  if (!orderId) notFound();

  const supabase = createAdminClient();
  const { data: pedido } = await supabase
    .from("orders")
    .select("id, order_number, total_cents, status, access_token")
    .eq("id", orderId)
    .maybeSingle();

  if (!pedido) notFound();

  return (
    <main
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 px-6 pb-16 text-center"
      style={{ paddingTop: HEADER_HEIGHT_PX + 48 }}
    >
      <span className="rounded-full border border-ink/20 px-3 py-1 text-xs uppercase tracking-widest text-ink/60">
        Ambiente de teste
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl text-ink">Pagamento simulado</h1>
        <p className="text-ink/70">
          Nenhuma cobrança real acontece aqui. Esta tela substitui a do
          gateway enquanto o pagamento de verdade não está configurado.
        </p>
      </div>

      <dl className="w-full rounded-lg border border-sand p-4 text-left">
        <div className="flex justify-between">
          <dt className="text-ink/70">Pedido</dt>
          <dd className="font-mono text-ink">{pedido.order_number}</dd>
        </div>
        <div className="mt-2 flex justify-between">
          <dt className="text-ink/70">Valor</dt>
          <dd className="font-display text-lg text-ink">
            {formatarBRL(pedido.total_cents)}
          </dd>
        </div>
      </dl>

      <SimuladorAcoes
        orderId={pedido.id}
        accessToken={pedido.access_token as string}
      />
    </main>
  );
}
