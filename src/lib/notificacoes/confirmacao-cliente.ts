import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import { baseUrl } from "@/lib/config/urls";
import { EMPRESA } from "@/lib/legal/empresa";
import { textoDesistencia } from "@/lib/legal/desistencia-texto";
import { formatarDinheiroParaComprador } from "@/lib/internacional/moeda";
import { idiomaDoPais, localeDoPais } from "@/lib/internacional/paises";
import { daLinha, formatarEndereco, type LinhaEndereco } from "@/lib/internacional/endereco";
import type { Idioma } from "@/lib/internacional/idioma";
import { enviarEmail, remetente } from "./email-operacional";

/**
 * E-mail de confirmação ao CLIENTE, depois do pagamento confirmado
 * (07/10/2026).
 *
 * Até aqui o cliente só recebia o recibo do gateway. A UE exige que ele
 * receba, depois da compra, a confirmação do contrato com a informação de
 * desistência e o formulário-modelo em suporte durável (Diretiva
 * 2011/83/UE art. 8(7); § 312f BGB) — a primeira venda (Alemanha, 06/10)
 * saiu sem isso. Vale também para o Brasil: o cliente fica com o resumo do
 * pedido e as regras por escrito.
 *
 * Uma vez por pedido, garantido pelo banco: a reserva é o INSERT em
 * order_notifications (unique order_id+kind), igual ao aviso de venda paga.
 * Nunca lança — chamado de dentro de confirmarPagamento(), onde um e-mail
 * perdido é recuperável e uma confirmação de pagamento perdida não é.
 */

const KIND = "confirmacao_cliente";

type Textos = {
  assunto: (n: string) => string;
  ola: (nome: string) => string;
  pago: string;
  proximo: string;
  itens: string;
  subtotal: string;
  desconto: string;
  frete: string;
  total: string;
  entrega: string;
  acompanhe: string;
  duvidas: string;
  assinatura: string;
};

const T: Record<Idioma, Textos> = {
  pt: {
    assunto: (n) => `Pedido ${n} confirmado — Reverá`,
    ola: (nome) => `Olá, ${nome}!`,
    pago: "Recebemos o seu pagamento e o seu pedido está confirmado.",
    proximo: "Agora vamos preparar o envio. Quando o pacote sair, mandamos o código de rastreio.",
    itens: "Itens", subtotal: "Subtotal", desconto: "Desconto", frete: "Frete", total: "Total",
    entrega: "Entrega", acompanhe: "Acompanhe o pedido", duvidas: "Dúvidas? Responda este e-mail ou fale pelo WhatsApp",
    assinatura: "Equipe Reverá",
  },
  en: {
    assunto: (n) => `Order ${n} confirmed — Reverá`,
    ola: (nome) => `Hi ${nome},`,
    pago: "We've received your payment and your order is confirmed.",
    proximo: "We're now preparing your shipment. As soon as it ships, we'll send you the tracking number.",
    itens: "Items", subtotal: "Subtotal", desconto: "Discount", frete: "Shipping", total: "Total",
    entrega: "Delivery address", acompanhe: "Track your order", duvidas: "Questions? Reply to this email or message us on WhatsApp",
    assinatura: "The Reverá team",
  },
  es: {
    assunto: (n) => `Pedido ${n} confirmado — Reverá`,
    ola: (nome) => `¡Hola, ${nome}!`,
    pago: "Hemos recibido tu pago y tu pedido está confirmado.",
    proximo: "Ahora prepararemos el envío. Cuando salga, te enviaremos el número de seguimiento.",
    itens: "Artículos", subtotal: "Subtotal", desconto: "Descuento", frete: "Envío", total: "Total",
    entrega: "Dirección de entrega", acompanhe: "Sigue tu pedido", duvidas: "¿Dudas? Responde a este correo o escríbenos por WhatsApp",
    assinatura: "Equipo Reverá",
  },
  fr: {
    assunto: (n) => `Commande ${n} confirmée — Reverá`,
    ola: (nome) => `Bonjour ${nome},`,
    pago: "Nous avons bien reçu votre paiement et votre commande est confirmée.",
    proximo: "Nous préparons maintenant l’expédition. Dès l’envoi du colis, nous vous transmettrons le numéro de suivi.",
    itens: "Articles", subtotal: "Sous-total", desconto: "Remise", frete: "Livraison", total: "Total",
    entrega: "Adresse de livraison", acompanhe: "Suivre votre commande", duvidas: "Des questions ? Répondez à cet e-mail ou écrivez-nous sur WhatsApp",
    assinatura: "L’équipe Reverá",
  },
  de: {
    assunto: (n) => `Bestellung ${n} bestätigt — Reverá`,
    ola: (nome) => `Hallo ${nome},`,
    pago: "Ihre Zahlung ist eingegangen und Ihre Bestellung ist bestätigt.",
    proximo: "Wir bereiten jetzt den Versand vor. Sobald das Paket unterwegs ist, senden wir Ihnen die Sendungsnummer.",
    itens: "Artikel", subtotal: "Zwischensumme", desconto: "Rabatt", frete: "Versand", total: "Gesamt",
    entrega: "Lieferadresse", acompanhe: "Bestellung verfolgen", duvidas: "Fragen? Antworten Sie einfach auf diese E-Mail oder schreiben Sie uns per WhatsApp",
    assinatura: "Ihr Reverá-Team",
  },
};

type Linha = { product_name_snapshot: string; variant_label_snapshot: string | null; quantity: number; subtotal_cents: number };

/** Monta o e-mail. Separado do envio para ser testável. */
export function montarConfirmacao(dados: {
  orderNumber: string;
  accessToken: string;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  pais: string;
  nome: string;
  itens: Linha[];
  endereco: string[];
  base: string;
}): { assunto: string; texto: string; idioma: Idioma } {
  const idioma = idiomaDoPais(dados.pais);
  const t = T[idioma];
  const na = (c: number) => formatarDinheiroParaComprador(c, dados.currency, localeDoPais(dados.pais));
  const primeiroNome = dados.nome.trim().split(/\s+/)[0] || dados.nome;
  const linkPedido = `${dados.base}/pedido/${dados.accessToken}`;
  const texto = [
    t.ola(primeiroNome),
    "",
    t.pago,
    t.proximo,
    "",
    `${t.itens}:`,
    ...dados.itens.map((i) =>
      `- ${i.quantity}× ${i.product_name_snapshot}${i.variant_label_snapshot ? ` (${i.variant_label_snapshot})` : ""} — ${na(i.subtotal_cents)}`
    ),
    `${t.subtotal}: ${na(dados.subtotalCents)}`,
    ...(dados.discountCents > 0 ? [`${t.desconto}: −${na(dados.discountCents)}`] : []),
    `${t.frete}: ${na(dados.shippingCents)}`,
    `${t.total}: ${na(dados.totalCents)}`,
    "",
    ...(dados.endereco.length ? [`${t.entrega}:`, ...dados.endereco, ""] : []),
    `${t.acompanhe}: ${linkPedido}`,
    "",
    `${t.duvidas}: ${EMPRESA.whatsapp}`,
    "",
    t.assinatura,
    `${EMPRESA.razaoSocial} — CNPJ ${EMPRESA.cnpj}`,
    "",
    "────────────────────────",
    "",
    textoDesistencia(idioma, dados.pais === "BR"),
  ].join("\n");
  return { assunto: t.assunto(dados.orderNumber), texto, idioma };
}

type Supa = ReturnType<typeof createAdminClient>;

export async function enviarConfirmacaoAoCliente(supabase: Supa, orderId: string): Promise<void> {
  try {
    // Sem e-mail configurado não se reserva nada: senão o pedido ficaria
    // "reservado" para sempre e nunca receberia o e-mail depois da chave.
    if (!process.env.RESEND_API_KEY?.trim()) return;

    const { data: pedido } = await supabase.from("orders").select("customer_id").eq("id", orderId).maybeSingle();
    if (!pedido?.customer_id) return;
    const { data: cliente } = await supabase.from("customers").select("email").eq("id", pedido.customer_id).maybeSingle();
    const email = (cliente?.email as string | null | undefined)?.trim();
    if (!email || !email.includes("@")) return;

    // Reserva ANTES de enviar: quem colide (23505) sabe que outro já envia.
    const { error: erroReserva } = await supabase
      .from("order_notifications")
      .insert({ order_id: orderId, kind: KIND, channel: "email" });
    if (erroReserva) {
      if (erroReserva.code !== "23505") console.error("[confirmacao-cliente] reserva falhou", erroReserva);
      return;
    }
    await enviarReservada(supabase, orderId);
  } catch (erro) {
    console.error("[confirmacao-cliente] falha inesperada", erro);
  }
}

/**
 * Reenvio (até 20 h depois) das reservas que ficaram sem `sent_at` (Resend fora do ar, função
 * encerrada no meio). Chamado pela conferência periódica. O
 * Idempotency-Key do Resend impede e-mail duplicado dentro de 24 h.
 */
export async function reenviarConfirmacoesPendentes(supabase: Supa, agora = Date.now()): Promise<number> {
  const { data } = await supabase
    .from("order_notifications")
    .select("order_id, attempts, created_at")
    .eq("kind", KIND)
    .is("sent_at", null)
    .lte("created_at", new Date(agora - 5 * 60_000).toISOString())
    // Menos de 24 h: dentro da janela do Idempotency-Key do Resend, um
    // reenvio nunca vira e-mail duplicado (mesmo se o sent_at não gravou).
    .gte("created_at", new Date(agora - 20 * 3_600_000).toISOString())
    .lt("attempts", 5)
    .limit(10);
  let reenviados = 0;
  for (const linha of data ?? []) {
    if (await enviarReservada(supabase, linha.order_id as string)) reenviados++;
  }
  return reenviados;
}

async function enviarReservada(supabase: Supa, orderId: string): Promise<boolean> {
  try {
    const { data: pedido } = await supabase
      .from("orders")
      .select(
        "id, order_number, access_token, currency, subtotal_cents, discount_cents, shipping_cents, total_cents, customer_id, address_id"
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!pedido) return false;

    const [{ data: cliente }, { data: endereco }, { data: itens }, { data: reserva }] = await Promise.all([
      supabase.from("customers").select("full_name, email, phone").eq("id", pedido.customer_id).maybeSingle(),
      pedido.address_id
        ? supabase.from("addresses").select("*").eq("id", pedido.address_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("order_items")
        .select("product_name_snapshot, variant_label_snapshot, quantity, subtotal_cents")
        .eq("order_id", orderId),
      supabase.from("order_notifications").select("attempts").eq("order_id", orderId).eq("kind", KIND).maybeSingle(),
    ]);
    const email = (cliente?.email as string | null | undefined)?.trim();
    if (!email || !email.includes("@")) return false;

    const linha = endereco as unknown as LinhaEndereco | null;
    const dominio = linha ? daLinha(linha, (cliente?.phone as string | null) ?? "") : null;
    const montado = montarConfirmacao({
      orderNumber: pedido.order_number as string,
      accessToken: pedido.access_token as string,
      currency: (pedido.currency as string | null) ?? "BRL",
      subtotalCents: (pedido.subtotal_cents as number) ?? 0,
      discountCents: (pedido.discount_cents as number) ?? 0,
      shippingCents: (pedido.shipping_cents as number) ?? 0,
      totalCents: (pedido.total_cents as number) ?? 0,
      pais: linha?.country ?? "BR",
      nome: (cliente?.full_name as string | null) ?? "",
      itens: (itens ?? []) as Linha[],
      endereco: dominio ? formatarEndereco(dominio, idiomaDoPais(linha?.country ?? "BR")) : [],
      base: baseUrl(),
    });

    const nomeRemetente = remetente().replace(/^[^<]*</, "Reverá <");
    const r = await enviarEmail({
      para: [email],
      de: nomeRemetente.includes("<") ? nomeRemetente : `Reverá <${remetente()}>`,
      responderPara: EMPRESA.email,
      assunto: montado.assunto,
      texto: montado.texto,
      idempotencyKey: `revera-confirmacao-cliente:${orderId}`,
      // Roda dentro da confirmação do pagamento: não segura o webhook.
      timeoutMs: 5_000,
    });

    const tentativas = ((reserva?.attempts as number | null) ?? 0) + 1;
    if (r.estado === "enviado") {
      await supabase
        .from("order_notifications")
        .update({ sent_at: new Date().toISOString(), provider_message_id: r.id, last_error: null, attempts: tentativas })
        .eq("order_id", orderId)
        .eq("kind", KIND);
      return true;
    }
    const motivo = r.estado === "erro" ? r.motivo : r.estado;
    console.error("[confirmacao-cliente] e-mail não saiu", motivo);
    await supabase
      .from("order_notifications")
      .update({ last_error: motivo.slice(0, 500), attempts: tentativas })
      .eq("order_id", orderId)
      .eq("kind", KIND);
    return false;
  } catch (erro) {
    console.error("[confirmacao-cliente] falha ao enviar", erro);
    return false;
  }
}
