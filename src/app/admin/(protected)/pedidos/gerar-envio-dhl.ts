"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { MyDhlProvider } from "@/lib/shipping/dhl/mydhl-provider";
import { planejadaPadrao } from "@/lib/shipping/dhl/admin-quote";
import { PayPalProvider } from "@/lib/payments/paypal-provider";

export type GerarDhlResultado = { ok: true; tracking: string; paypal: "enviado" | "nao_aplicavel" | "falhou" } | { error: string; waitingForOwner?: true };

export async function gerarEnvioDhlAction(input: unknown): Promise<GerarDhlResultado> {
  const parsed = z.object({ orderId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Pedido inválido." };
  const orderId = parsed.data.orderId;
  const s = await createClient();
  const [{ data: order, error }, { data: exporter }] = await Promise.all([
    s.from("orders").select("id, order_number, payment_status, shipping_status, canceled_at, currency, total_cents, addresses(*), customers(full_name,email,phone), order_items(product_name_snapshot,unit_price_cents,quantity,product_variants(shipping_weight_g,shipping_length_cm,shipping_width_cm,shipping_height_cm,customs_hs_code,origin_country)), shipments(id,tracking_code,status,metadata), payments(provider,status,provider_payment_id)").eq("id", orderId).maybeSingle(),
    s.from("international_export_settings").select("*").eq("singleton", true).maybeSingle(),
  ]);
  if (error || !order) return { error: "Pedido não encontrado." };
  if (order.canceled_at || order.payment_status !== "paid") return { error: "A etiqueta exige um pedido internacional pago e não cancelado." };
  const address = (Array.isArray(order.addresses) ? order.addresses[0] : order.addresses) as Record<string, unknown> | null;
  const customer = (Array.isArray(order.customers) ? order.customers[0] : order.customers) as Record<string, unknown> | null;
  if (!address || address.country === "BR") return { error: "Este pedido não é internacional." };
  const existing = (Array.isArray(order.shipments) ? order.shipments[0] : order.shipments) as { id: string; tracking_code: string | null; status: string | null } | null;
  if (existing?.tracking_code) return { ok: true, tracking: existing.tracking_code, paypal: "nao_aplicavel" };
  if (existing) return { error: "Já existe uma tentativa de etiqueta para este pedido. Confira no MyDHL antes de qualquer nova tentativa para evitar duplicidade.", waitingForOwner: true };

  const requiredExporter = ["legal_name","tax_id","country","postal_code","city","address_line1","contact_name","phone","email"];
  if (!exporter || !exporter.dhl_account_confirmed || exporter.invoice_mode === "not_configured" || requiredExporter.some((k) => !(exporter as Record<string, unknown>)[k])) {
    return { error: "WAITING_FOR_OWNER: complete e confirme o exportador e o modo fiscal no painel Internacional.", waitingForOwner: true };
  }
  const items = (order.order_items ?? []) as Array<Record<string, unknown>>;
  const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  if (items.length !== 1 || totalUnits !== 1) {
    return { error: "WAITING_FOR_OWNER: pedido com mais de uma unidade exige peso e dimensões da embalagem final realmente medida. A automação não presume empilhamento.", waitingForOwner: true };
  }
  const missing: string[] = [];
  let weight = 0, length = 0, width = 0, height = 0;
  const lineItems = items.flatMap((item) => {
    const variantRaw = item.product_variants;
    const v = (Array.isArray(variantRaw) ? variantRaw[0] : variantRaw) as Record<string, unknown> | null;
    const quantity = Number(item.quantity);
    if (!v || !v.shipping_weight_g || !v.shipping_length_cm || !v.shipping_width_cm || !v.shipping_height_cm || !v.customs_hs_code || !v.origin_country) {
      missing.push(String(item.product_name_snapshot)); return [];
    }
    weight += Number(v.shipping_weight_g) * quantity;
    length = Math.max(length, Number(v.shipping_length_cm)); width = Math.max(width, Number(v.shipping_width_cm)); height += Number(v.shipping_height_cm) * quantity;
    return [{ description: String(item.product_name_snapshot), quantity, valueCents: Number(item.unit_price_cents) * quantity, weightGrams: Number(v.shipping_weight_g) * quantity, hsCode: String(v.customs_hs_code), originCountry: String(v.origin_country) }];
  });
  if (missing.length) return { error: `WAITING_FOR_OWNER: faltam peso, dimensões, NCM/HS ou origem em: ${missing.join(", ")}.`, waitingForOwner: true };
  const recipientFields = [customer?.full_name, customer?.email, customer?.phone, address.line1, address.city, address.postal_code, address.country];
  if (recipientFields.some((v) => !v)) return { error: "WAITING_FOR_OWNER: endereço ou contato do destinatário incompleto.", waitingForOwner: true };

  const { data: lock, error: lockError } = await s.from("shipments").insert({ order_id: orderId, provider: "dhl", service_name: "DHL Express", status: "creating", metadata: { message_reference: orderId, communication: "prepared_not_sent" } }).select("id").single();
  if (lockError || !lock) return { error: "Outra tentativa já existe. Recarregue e confira o MyDHL antes de tentar novamente." };
  await s.from("orders").update({ shipping_status: "label_processing", updated_at: new Date().toISOString() }).eq("id", orderId).eq("shipping_status", order.shipping_status);
  try {
    const result = await new MyDhlProvider().createShipment({
      orderId, productCode: "P", plannedShippingDate: planejadaPadrao(), currency: order.currency,
      declaredValueCents: items.reduce((sum, i) => sum + Number(i.unit_price_cents) * Number(i.quantity), 0),
      packageInfo: { weightGrams: weight, lengthCm: length, widthCm: width, heightCm: height },
      shipper: { legalName: exporter.legal_name, contactName: exporter.contact_name, taxId: exporter.tax_id, phone: exporter.phone, email: exporter.email, countryCode: exporter.country, postalCode: exporter.postal_code, cityName: exporter.city, provinceCode: exporter.region, addressLine1: exporter.address_line1 },
      receiver: { name: String(customer!.full_name), phone: String(customer!.phone), email: String(customer!.email), countryCode: String(address.country), postalCode: address.postal_code as string | null, cityName: String(address.city), provinceCode: address.region as string | null, addressLine1: String(address.line1), addressLine2: address.line2 as string | null },
      lineItems, requestPickup: process.env.DHL_PICKUP_ENABLED?.trim() === "1",
    });
    const labelUrl = result.labelBase64 ? `data:application/pdf;base64,${result.labelBase64}` : null;
    const { data: shipmentSaved, error: shipmentSaveError } = await s.from("shipments").update({ provider_shipment_id: result.shipmentId, tracking_code: result.trackingNumber, label_url: labelUrl, status: "label_created", metadata: { message_reference: orderId, documents: result.documents.map((d) => ({ typeCode: d.typeCode, contentBase64: d.contentBase64 })), communication: "prepared_not_sent", pickup_requested: process.env.DHL_PICKUP_ENABLED?.trim() === "1" }, updated_at: new Date().toISOString() }).eq("id", lock.id).eq("status", "creating").select("id").maybeSingle();
    if (shipmentSaveError || !shipmentSaved) {
      await s.from("orders").update({ shipping_status: "shipping_error", updated_at: new Date().toISOString() }).eq("id", orderId);
      return { error: `A DHL criou a remessa ${result.trackingNumber}, mas o sistema não conseguiu gravar a etiqueta. Não gere outra: registre a guia manualmente após conferir o MyDHL.`, waitingForOwner: true };
    }
    const { data: orderSaved, error: orderSaveError } = await s.from("orders").update({ shipping_status: "label_created", updated_at: new Date().toISOString() }).eq("id", orderId).select("id").maybeSingle();
    if (orderSaveError || !orderSaved) {
      return { error: `A remessa ${result.trackingNumber} foi gravada, mas a situação do pedido não avançou. Não gere outra; recarregue e faça a reconciliação operacional.`, waitingForOwner: true };
    }
    const payments = (order.payments ?? []) as Array<{ provider: string; status: string; provider_payment_id: string | null }>;
    const pp = payments.find((p) => p.provider === "paypal" && p.status === "approved" && p.provider_payment_id);
    let paypal: "enviado" | "nao_aplicavel" | "falhou" = "nao_aplicavel";
    if (pp?.provider_payment_id) {
      try { paypal = (await new PayPalProvider().adicionarRastreio(pp.provider_payment_id, orderId, result.trackingNumber)).ok ? "enviado" : "falhou"; } catch { paypal = "falhou"; }
    }
    await registrarAuditoria(s, { action: "pedido.gerar_envio_dhl", entityType: "orders", entityId: orderId, diff: { tracking: result.trackingNumber, paypal } });
    revalidatePath(`/admin/pedidos/${orderId}`); revalidatePath("/admin/pedidos");
    return { ok: true, tracking: result.trackingNumber, paypal };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Falha desconhecida";
    await s.from("shipments").update({ status: "creation_unknown", metadata: { message_reference: orderId, error: reason.slice(0, 300), requires_manual_reconciliation: true }, updated_at: new Date().toISOString() }).eq("id", lock.id);
    await s.from("orders").update({ shipping_status: "shipping_error", updated_at: new Date().toISOString() }).eq("id", orderId);
    return { error: `A DHL não confirmou a etiqueta. Confira o MyDHL antes de tentar novamente: ${reason}`, waitingForOwner: true };
  }
}
