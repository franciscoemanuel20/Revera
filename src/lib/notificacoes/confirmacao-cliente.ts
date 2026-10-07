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

export async function enviarConfirmacaoAoCliente(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string
): Promise<void> {
  try {
    const { data: pedido } = await supabase
      .from("orders")
      .select(
        "id, order_number, access_token, currency, subtotal_cents, discount_cents, shipping_cents, total_cents, customer_id, address_id"
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!pedido) return;

    const [{ data: cliente }, { data: endereco }, { data: itens }] = await Promise.all([
      supabase.from("customers").select("full_name, email, phone").eq("id", pedido.customer_id).maybeSingle(),
      pedido.address_id
        ? supabase.from("addresses").select("*").eq("id", pedido.address_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("order_items")
        .select("product_name_snapshot, variant_label_snapshot, quantity, subtotal_cents")
        .eq("order_id", orderId),
    ]);
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
      endereco: dominio ? formatarEndereco(dominio) : [],
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
    });

    if (r.estado === "enviado") {
      await supabase
        .from("order_notifications")
        .update({ sent_at: new Date().toISOString() })
        .eq("order_id", orderId)
        .eq("kind", KIND);
    } else {
      // A reserva fica com sent_at nulo: o painel mostra "não enviado".
      console.error("[confirmacao-cliente] e-mail não saiu", r.estado === "erro" ? r.motivo : r.estado);
    }
  } catch (erro) {
    console.error("[confirmacao-cliente] falha inesperada", erro);
  }
}
