import type { Metadata } from "next";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";

export const metadata: Metadata = {
  title: "Pagamento — Reverá",
};

/**
 * Placeholder — FIM DO ESCOPO desta entrega (26/08/2026).
 *
 * O pedido já foi criado com status='new' pela Server Action de checkout
 * (src/app/checkout/actions.ts) antes de chegar aqui; esta página só
 * recebe o `pedido` (orders.access_token) pela URL e mostra uma mensagem
 * de espera. Nenhuma chamada a gateway, nenhum provider, nenhum SDK de
 * pagamento — isso é implementado por outra pessoa, em paralelo (ver
 * src/lib/payments/*, que este arquivo não importa).
 *
 * Não busca o pedido no banco: mostrar status/valor exigiria uma policy de
 * leitura pública por access_token (mais superfície de RLS para decidir,
 * fora do escopo fechado desta tarefa) ou o client de service role só para
 * exibir uma tela de espera — nenhum dos dois se paga aqui. O número de
 * referência que aparece na tela é o suficiente para o cliente guardar.
 */
export default async function PagamentoPlaceholderPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  const { pedido } = await searchParams;

  return (
    <main
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-6 pb-16 text-center"
      style={{ paddingTop: HEADER_HEIGHT_PX + 64 }}
    >
      <span className="eyebrow-ink">Pedido recebido</span>
      <h1 className="font-display text-3xl text-ink">Já estamos com seu pedido</h1>
      <p className="text-ink/70">
        O pagamento ainda não está disponível por aqui — esta etapa está sendo
        conectada. Assim que estiver pronta, você poderá concluir o pagamento
        deste mesmo pedido.
      </p>
      {pedido ? (
        <p className="rounded-lg border border-sand px-4 py-3 text-sm text-ink/80">
          Referência do pedido: <span className="font-semibold text-ink">{pedido}</span>
        </p>
      ) : null}
    </main>
  );
}
