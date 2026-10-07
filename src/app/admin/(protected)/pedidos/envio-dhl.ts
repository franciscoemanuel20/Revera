"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { PayPalProvider } from "@/lib/payments/paypal-provider";
import { normalizarAwbDhl } from "@/lib/shipping/awb-dhl";

/**
 * Registrar o envio DHL de um pedido internacional (06/10/2026).
 *
 * A etiqueta internacional é emitida à mão no MyDHL+ — o painel não fala com
 * a DHL. Sem este registro, o número da guia nunca entrava no sistema: o
 * pedido ficava em "aguardando etiqueta" para sempre e o PayPal nunca recebia
 * o rastreio (o saldo da primeira venda, REV-7DA5CEBF, ficou retido por isso).
 *
 * Ordem das escritas: primeiro o NOSSO banco (envio + situação), depois o
 * PayPal. Se o PayPal falhar, o envio continua registrado e a tela diz que o
 * rastreio não chegou lá — dá para repetir. O contrário (PayPal com rastreio
 * e pedido sem envio) deixaria o painel mentindo.
 */

const schema = z.object({
  orderId: z.string().uuid(),
  awb: z.string().trim().min(1, "Cole o número da guia DHL."),
});

export type RegistrarEnvioDhlResultado =
  | { error: string }
  | { ok: true; paypal: "enviado" | "sem_paypal" | { falhou: string } };

export async function registrarEnvioDhlAction(input: unknown): Promise<RegistrarEnvioDhlResultado> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  const awb = normalizarAwbDhl(parsed.data.awb);
  if (!awb) return { error: "Número de guia DHL inválido. A guia DHL Express tem 10 dígitos." };
  const { orderId } = parsed.data;

  // Sessão sob RLS: as policies de admin autorizam leitura e escrita.
  const supabase = await createClient();
  const { data: pedido, error: erroLeitura } = await supabase
    .from("orders")
    .select("id, payment_status, shipping_status, canceled_at, addresses(country), shipments(id, tracking_code), payments(provider, status, provider_payment_id)")
    .eq("id", orderId)
    .maybeSingle();
  if (erroLeitura || !pedido) {
    return { error: "Pedido não encontrado. Confira se você tem permissão de admin." };
  }
  if (pedido.canceled_at) return { error: "Este pedido está cancelado." };
  if (pedido.payment_status !== "paid") return { error: "Este pedido não está pago." };

  const endereco = (Array.isArray(pedido.addresses) ? pedido.addresses[0] : pedido.addresses) as
    | { country?: string | null }
    | null;
  const pais = endereco?.country ?? "BR";
  if (pais === "BR") return { error: "Pedido nacional: a etiqueta sai pela SuperFrete, não por aqui." };

  const envios = (Array.isArray(pedido.shipments) ? pedido.shipments : pedido.shipments ? [pedido.shipments] : []) as Array<{
    id: string;
    tracking_code: string | null;
  }>;
  const envioExistente = envios[0];
  if (envioExistente?.tracking_code && envioExistente.tracking_code !== awb) {
    return {
      error: `Este pedido já tem a guia ${envioExistente.tracking_code}. Trocar a guia não é feito por aqui.`,
    };
  }

  const atual = pedido.shipping_status as string;
  const repetindo = envioExistente?.tracking_code === awb;
  if (!repetindo && atual !== "awaiting_label" && atual !== "shipping_error") {
    return { error: "A situação do envio não permite registrar guia agora. Recarregue a página." };
  }

  const agora = new Date().toISOString();
  if (repetindo && (atual === "awaiting_label" || atual === "shipping_error")) {
    // A guia foi gravada mas a situação não andou (falha entre as duas
    // escritas). Sem isto, o reenvio só falaria com o PayPal e o pedido
    // ficaria para sempre em "aguardando etiqueta".
    await supabase
      .from("orders")
      .update({ shipping_status: "label_created", updated_at: agora })
      .eq("id", orderId)
      .eq("shipping_status", atual);
  }

  if (!repetindo) {
    const { error: erroEnvio } = envioExistente
      ? await supabase
          .from("shipments")
          .update({ provider: "dhl", tracking_code: awb, service_name: "DHL Express", updated_at: agora })
          .eq("id", envioExistente.id)
          .is("tracking_code", null)
      : await supabase.from("shipments").insert({
          order_id: orderId,
          provider: "dhl",
          service_name: "DHL Express",
          tracking_code: awb,
          status: "registrado_manual",
        });
    if (erroEnvio) return { error: "Não foi possível gravar o envio. Tente de novo." };

    const { data: aplicado } = await supabase
      .from("orders")
      .update({ shipping_status: "label_created", updated_at: agora })
      .eq("id", orderId)
      .eq("shipping_status", atual)
      .select("id")
      .maybeSingle();
    if (!aplicado) {
      return { error: "A situação do pedido mudou em outra aba. Recarregue a página." };
    }

    await registrarAuditoria(supabase, {
      action: "pedido.registrar_envio_dhl",
      entityType: "orders",
      entityId: orderId,
      diff: { guia: awb },
    });
  }

  // PayPal: só quando a venda foi paga por ele.
  const pagamentos = (Array.isArray(pedido.payments) ? pedido.payments : []) as Array<{
    provider: string;
    status: string;
    provider_payment_id: string | null;
  }>;
  const paypal = pagamentos.find((p) => p.provider === "paypal" && p.status === "approved" && p.provider_payment_id);
  let resultadoPaypal: "enviado" | "sem_paypal" | { falhou: string } = "sem_paypal";
  if (paypal?.provider_payment_id) {
    try {
      const r = await new PayPalProvider().adicionarRastreio(paypal.provider_payment_id, orderId, awb);
      resultadoPaypal = r.ok ? "enviado" : { falhou: r.motivo };
    } catch (erro) {
      console.error("[envio-dhl] rastreio PayPal falhou", erro);
      resultadoPaypal = { falhou: "Não foi possível falar com o PayPal agora." };
    }
    await registrarAuditoria(supabase, {
      action: "pedido.rastreio_paypal",
      entityType: "orders",
      entityId: orderId,
      diff: { guia: awb, resultado: typeof resultadoPaypal === "string" ? resultadoPaypal : resultadoPaypal.falhou },
    });
  }

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true, paypal: resultadoPaypal };
}
