import type { Idioma } from "@/lib/internacional/idioma";
import { idiomaDoPais } from "@/lib/internacional/paises";

export interface PedidoRecuperacaoInternacional {
  id: string;
  orderNumber: string;
  createdAt: string;
  currency: string;
  totalCents: number;
  paymentStatus: string;
  country: string;
  customer: { name: string; email: string | null; phone: string | null };
}

export interface PreviaRecuperacaoInternacional extends PedidoRecuperacaoInternacional {
  idioma: Idioma;
  destinatario: string;
  mensagem: string;
}

function identidade(p: PedidoRecuperacaoInternacional): string | null {
  const email = p.customer.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const telefone = p.customer.phone?.replace(/\D/g, "");
  return telefone ? `phone:${telefone}` : null;
}

function texto(idioma: Idioma, nome: string, pedido: string): string {
  const primeiroNome = nome.trim().split(/\s+/)[0] || nome;
  const mensagens: Record<Idioma, string> = {
    pt: `Olá, ${primeiroNome}. Seu pedido ${pedido} na Reverá ficou aguardando pagamento. Se você teve alguma dificuldade no checkout internacional, responda esta mensagem e nós ajudamos. Nenhuma nova cobrança foi feita.`,
    en: `Hello, ${primeiroNome}. Your Reverá order ${pedido} is still awaiting payment. If you had any trouble with international checkout, reply to this message and we will help. No new charge has been made.`,
    es: `Hola, ${primeiroNome}. Tu pedido ${pedido} de Reverá sigue pendiente de pago. Si tuviste algún problema con el checkout internacional, responde a este mensaje y te ayudaremos. No se realizó ningún cargo nuevo.`,
    fr: `Bonjour ${primeiroNome}. Votre commande Reverá ${pedido} est toujours en attente de paiement. Si vous avez rencontré un problème lors du paiement international, répondez à ce message et nous vous aiderons. Aucun nouveau débit n’a été effectué.`,
    de: `Hallo ${primeiroNome}. Ihre Reverá-Bestellung ${pedido} wartet noch auf die Zahlung. Falls es beim internationalen Checkout Probleme gab, antworten Sie auf diese Nachricht. Es wurde keine neue Belastung vorgenommen.`,
  };
  return mensagens[idioma];
}

/** Mais recente por pessoa; pagos são excluídos antes desta função ser chamada. */
export function montarPreviasRecuperacaoInternacional(
  pedidos: PedidoRecuperacaoInternacional[],
  opcoes: { abandonadoAntesDe?: string } = {}
): PreviaRecuperacaoInternacional[] {
  const identidadesPagas = new Set(
    pedidos.filter((p) => p.paymentStatus === "paid").map(identidade).filter((v): v is string => Boolean(v))
  );
  const vistos = new Set<string>();
  return [...pedidos]
    .filter((p) =>
      p.paymentStatus !== "paid" &&
      (!opcoes.abandonadoAntesDe || Date.parse(p.createdAt) <= Date.parse(opcoes.abandonadoAntesDe))
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .flatMap((pedido) => {
      const chave = identidade(pedido);
      if (!chave || vistos.has(chave) || identidadesPagas.has(chave)) return [];
      vistos.add(chave);
      const idioma = idiomaDoPais(pedido.country);
      return [{
        ...pedido,
        idioma,
        destinatario: pedido.customer.email ?? pedido.customer.phone ?? "",
        mensagem: texto(idioma, pedido.customer.name, pedido.orderNumber),
      }];
    });
}
