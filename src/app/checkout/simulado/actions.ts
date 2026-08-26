"use server";

import { notFound, redirect } from "next/navigation";
import { segredoDoCaminho } from "@/lib/payments/webhook-url";
import { baseUrl } from "@/lib/config/urls";

/**
 * Simula o aviso que o gateway mandaria — batendo no MESMO webhook de
 * produção, com o mesmo formato de corpo e passando pelo segredo do
 * caminho. Nada aqui é atalho: se o webhook estiver quebrado, este teste
 * quebra junto, que é exatamente o que se quer de um simulador.
 *
 * Só existe com PAYMENT_PROVIDER=mock (verificado aqui também, não só na
 * página — Server Action é um endpoint, e endpoint se protege sozinho).
 */
export async function simularPagamentoAction(formData: FormData) {
  if ((process.env.PAYMENT_PROVIDER ?? "mock") !== "mock") {
    notFound();
  }

  const orderId = String(formData.get("orderId") ?? "");
  const accessToken = String(formData.get("accessToken") ?? "");
  if (!orderId || !accessToken) notFound();

  const base = baseUrl();

  const resposta = await fetch(
    `${base}/api/webhooks/pagamento/${segredoDoCaminho()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_nsu: orderId,
        transaction_nsu: `sim_${orderId}`,
        invoice_slug: null,
      }),
      cache: "no-store",
    }
  );

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    console.error("[simulado] webhook recusou", resposta.status, detalhe);
    // Não redireciona: deixa a pessoa ver que falhou, em vez de mandá-la
    // para uma página de pedido que continuaria "aguardando pagamento".
    throw new Error(
      `O webhook recusou a simulação (HTTP ${resposta.status}). Veja o log do servidor.`
    );
  }

  // Fora do try/catch de propósito: redirect funciona lançando.
  redirect(`/pedido/${accessToken}`);
}

/**
 * Sai sem pagar — o cliente que desiste na tela do gateway. O pedido
 * continua 'new', que é o estado correto: existe, mas não foi pago.
 */
export async function abandonarAction(formData: FormData) {
  const accessToken = String(formData.get("accessToken") ?? "");
  if (!accessToken) notFound();
  redirect(`/pedido/${accessToken}`);
}
