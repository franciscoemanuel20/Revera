"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { MyDhlProvider, exigirAmbienteDhlParaTransacao, indiceEtiquetaDhl } from "@/lib/shipping/dhl/mydhl-provider";
import { planejadaPadrao } from "@/lib/shipping/dhl/admin-quote";
import { carregarProcessosExportacao } from "@/lib/internacional/processo-exportacao-server";
import type { DhlShipmentResult } from "@/lib/shipping/dhl/types";
import { deveRepararStatusAposGuia, enviarRastreioDhlAoPaypal, guiaDhlFinal } from "@/lib/shipping/dhl/paypal-tracking";

export type GerarDhlResultado = { ok: true; tracking: string; paypal: "enviado" | "nao_aplicavel" | "falhou"; aviso?: string } | { error: string; waitingForOwner?: true };

type DocumentoDhl = { typeCode: string | null; storagePath: string };
type RemessaComDocumentos = {
  id: string; provider: string | null; tracking_code: string | null; status: string | null;
  metadata?: { documents?: DocumentoDhl[]; exporter_snapshot?: { invoice_mode?: string };
    request_snapshot?: { exporter_snapshot?: { invoice_mode?: string }; request?: { requestInvoice?: boolean } } } | null;
};

function modoInvoiceRemessa(remessa: RemessaComDocumentos): string | undefined {
  return remessa.metadata?.exporter_snapshot?.invoice_mode ??
    remessa.metadata?.request_snapshot?.exporter_snapshot?.invoice_mode;
}

function caminhoInvoiceDhl(orderId: string, remessa: RemessaComDocumentos): string | null {
  const documentos = remessa.metadata?.documents;
  if (!Array.isArray(documentos)) return null;
  const invoice = documentos.find(d => typeof d.typeCode === "string" && /invoice|commercial|^inv$/i.test(d.typeCode));
  const path = invoice?.storagePath;
  return typeof path === "string" && path.startsWith(`${orderId}/dhl/${remessa.id}/`) && path.endsWith(".pdf") ? path : null;
}

async function registrarInvoiceDhlPendente(
  s: Awaited<ReturnType<typeof createClient>>, orderId: string, orderNumber: string,
  remessa: RemessaComDocumentos,
): Promise<string | null> {
  if (modoInvoiceRemessa(remessa) !== "api") return null;
  const path = caminhoInvoiceDhl(orderId, remessa);
  if (!path) return "A guia existe, mas a API DHL não devolveu o PDF da invoice. Consulte a DHL; o despacho permanece bloqueado até um retorno da API com o documento.";
  const consultar = () => s.from("order_export_documents").select("source,storage_path,status")
    .eq("order_id", orderId).eq("kind", "invoice").maybeSingle();
  const { data: existente, error: erroConsulta } = await consultar();
  if (erroConsulta) return "Não foi possível conferir a invoice registrada. Tente recuperar novamente.";
  if (existente) {
    if (existente.source !== "dhl" || existente.storage_path !== path)
      return "Já existe outra invoice para este pedido. Confira os documentos antes de reconciliar.";
    if (existente.status !== "rejected") return null;
    const { data: recuperado, error: erroRecuperacao } = await s.from("order_export_documents")
      .update({ status: "pending", validated_by: null, validated_at: null, updated_at: new Date().toISOString() })
      .eq("order_id", orderId).eq("kind", "invoice").eq("status", "rejected")
      .eq("storage_path", path).select("order_id").maybeSingle();
    return erroRecuperacao || !recuperado ? "Não foi possível recolocar a invoice rejeitada para conferência." : null;
  }
  const { error } = await s.from("order_export_documents").insert({ order_id: orderId,
    kind: "invoice", source: "dhl", status: "pending", reference: orderNumber,
    storage_path: path, regime: null, validated_by: null, validated_at: null });
  if (!error) return null;
  const { data: concorrente } = await consultar();
  return concorrente?.source === "dhl" && concorrente.storage_path === path
    ? null : "A invoice foi recebida, mas não pôde ser registrada. Tente recuperar novamente.";
}

export async function recuperarInvoiceDhlAction(input: unknown): Promise<{ ok: true; message: string } | { error: string }> {
  const parsed = z.object({ orderId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Pedido inválido." };
  const orderId = parsed.data.orderId;
  const s = await createClient();
  const { data: order, error } = await s.from("orders")
    .select("id,order_number,shipments(id,provider,tracking_code,status,metadata)")
    .eq("id", orderId).maybeSingle();
  if (error || !order) return { error: "Pedido não encontrado." };
  const remessa = (order.shipments ?? []).find(x => x.provider === "dhl") as RemessaComDocumentos | undefined;
  if (!remessa || !guiaDhlFinal(remessa)) return { error: "Confira a guia final no MyDHL antes de recuperar a invoice." };
  if (modoInvoiceRemessa(remessa) !== "api") return { error: "Esta remessa não usa invoice gerada pela DHL." };
  const aviso = await registrarInvoiceDhlPendente(s, orderId, order.order_number, remessa);
  if (aviso) return { error: aviso };
  await registrarAuditoria(s, { action: "pedido.recuperar_invoice_dhl", entityType: "orders", entityId: orderId,
    diff: { remessa: remessa.id } });
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true, message: "Invoice DHL registrada para conferência. Valide o documento antes do despacho." };
}

export async function gerarEnvioDhlAction(input: unknown): Promise<GerarDhlResultado> {
  const parsed = z.object({ orderId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Pedido inválido." };
  const orderId = parsed.data.orderId;
  const s = await createClient();
  const [{ data: order, error }, { data: exporter }] = await Promise.all([
    s.from("orders").select("id, order_number, payment_status, shipping_status, canceled_at, currency, total_cents, addresses(*), customers(full_name,email,phone), order_items(id,product_name_snapshot,unit_price_cents,quantity), shipments(id,provider,tracking_code,status,metadata), payments(provider,status,provider_payment_id)").eq("id", orderId).maybeSingle(),
    s.from("international_export_settings").select("*").eq("singleton", true).maybeSingle(),
  ]);
  if (error || !order) return { error: "Pedido não encontrado." };
  if (order.canceled_at || order.payment_status !== "paid") return { error: "A etiqueta exige um pedido internacional pago e não cancelado." };
  const address = (Array.isArray(order.addresses) ? order.addresses[0] : order.addresses) as Record<string, unknown> | null;
  const customer = (Array.isArray(order.customers) ? order.customers[0] : order.customers) as Record<string, unknown> | null;
  if (!address || address.country === "BR") return { error: "Este pedido não é internacional." };
  const existing = (Array.isArray(order.shipments) ? order.shipments[0] : order.shipments) as RemessaComDocumentos | null;
  const payments = (order.payments ?? []) as Array<{ provider: string; status: string; provider_payment_id: string | null }>;
  if (existing?.tracking_code) {
    const guia = guiaDhlFinal(existing);
    if (!guia) return { error: "A remessa existente não está confirmada como uma guia DHL final. Confira e reconcilie no MyDHL antes de enviar rastreio ao PayPal.", waitingForOwner: true };
    if (deveRepararStatusAposGuia(order.shipping_status)) {
      const { data: reparado } = await s.from("orders")
        .update({ shipping_status: "label_created", updated_at: new Date().toISOString() })
        .eq("id", orderId).eq("shipping_status", order.shipping_status).eq("payment_status", "paid")
        .is("canceled_at", null).select("id").maybeSingle();
      if (!reparado) return { error: "A guia DHL existe, mas não foi possível reconciliar a situação do pedido. Recarregue antes de reenviar ao PayPal.", waitingForOwner: true };
    }
    const avisoInvoice = await registrarInvoiceDhlPendente(s, orderId, order.order_number, existing);
    const resultado = await enviarRastreioDhlAoPaypal(payments, orderId, guia);
    const paypal = resultado === "enviado" ? "enviado" : resultado === "sem_paypal" ? "nao_aplicavel" : "falhou";
    await registrarAuditoria(s, { action: "pedido.rastreio_paypal", entityType: "orders", entityId: orderId,
      diff: { tracking: guia, paypal, recuperacao: true } });
    return { ok: true, tracking: guia, paypal,
      aviso: [avisoInvoice, paypal === "falhou" ? "O reenvio do rastreio ao PayPal falhou e pode ser tentado novamente." : null].filter(Boolean).join(" ") || undefined };
  }
  if (existing) return { error: "Já existe uma tentativa de etiqueta para este pedido. Confira no MyDHL antes de qualquer nova tentativa para evitar duplicidade.", waitingForOwner: true };

  const processo = (await carregarProcessosExportacao(s, [orderId])).get(orderId);
  if (!processo?.avaliacao.podeCriarEtiqueta) return { error: processo?.avaliacao.bloqueiosEtiqueta.join(" ") ?? "Exportação indisponível.", waitingForOwner: true };

  const requiredExporter = ["legal_name","tax_id","country","postal_code","city","address_line1","contact_name","phone","email"];
  if (!exporter || !exporter.dhl_account_confirmed ||
      !["api", "external"].includes(processo.entrada.invoiceModeForOrder ?? "") ||
      requiredExporter.some((k) => !(exporter as Record<string, unknown>)[k])) {
    return { error: "WAITING_FOR_OWNER: complete e confirme o exportador e o modo fiscal no painel Internacional.", waitingForOwner: true };
  }
  const recipientFields = [customer?.full_name, customer?.email, customer?.phone, address.line1, address.city, address.postal_code, address.country];
  if (recipientFields.some((v) => !v)) return { error: "WAITING_FOR_OWNER: endereço ou contato do destinatário incompleto.", waitingForOwner: true };
  try { exigirAmbienteDhlParaTransacao("criar remessa"); } catch (e) { return { error: e instanceof Error ? e.message : "Ambiente DHL inválido." }; }
  if (process.env.DHL_SHIPMENT_CREATION_ENABLED !== "1" || !process.env.DHL_ACCOUNT_NUMBER ||
      !(process.env.DHL_MYDHL_API_KEY || process.env.DHL_API_KEY) ||
      !(process.env.DHL_MYDHL_API_SECRET || process.env.DHL_API_SECRET)) {
    return { error: "Criação DHL indisponível: confira configuração de ambiente, conta e credenciais antes de criar a tentativa." };
  }

  const { data: lock, error: lockError } = await s.from("shipments").insert({ order_id: orderId, provider: "dhl", service_name: "DHL Express", status: "creating", metadata: {
    message_reference: orderId, communication: "prepared_not_sent",
    exporter_snapshot: { invoice_mode: processo.entrada.invoiceModeForOrder },
  } }).select("id").single();
  if (lockError || !lock) return { error: "Outra tentativa já existe. Recarregue e confira o MyDHL antes de tentar novamente." };
  const { data: estadoAplicado } = await s.from("orders").update({ shipping_status: "label_processing", updated_at: new Date().toISOString() })
    .eq("id", orderId).eq("shipping_status", order.shipping_status).eq("payment_status", "paid")
    .is("canceled_at", null).select("id").maybeSingle();
  if (!estadoAplicado) {
    await s.from("shipments").delete().eq("id", lock.id).eq("status", "creating");
    return { error: "O pedido mudou antes de chamar a DHL. Recarregue e confira o estado atual." };
  }
  // O INSERT em shipments serializa com as edições fiscais no banco. Releia
  // DEPOIS dele: uma edição que terminou antes do lock não pode deixar o
  // payload com dados antigos. Depois do lock, o trigger torna o snapshot
  // e a embalagem imutáveis enquanto a remessa existir.
  const processoTravado = (await carregarProcessosExportacao(s, [orderId])).get(orderId);
  if (!processoTravado?.avaliacao.podeCriarEtiqueta) {
    await s.from("shipments").delete().eq("id", lock.id).eq("status", "creating");
    await s.from("orders").update({ shipping_status: order.shipping_status, updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("shipping_status", "label_processing").eq("payment_status", "paid").is("canceled_at", null);
    return { error: processoTravado?.avaliacao.bloqueiosEtiqueta.join(" ") ?? "Dados fiscais mudaram. Recarregue." };
  }
  const { data: exporterAtCall } = await s.from("international_export_settings").select("*").eq("singleton", true).maybeSingle();
  const { data: aindaValido } = await s.from("orders").select("id").eq("id", orderId)
    .eq("payment_status", "paid").eq("shipping_status", "label_processing").is("canceled_at", null).maybeSingle();
  if (!exporterAtCall || !aindaValido) {
    await s.from("shipments").delete().eq("id", lock.id).eq("status", "creating");
    await s.from("orders").update({ shipping_status: order.shipping_status, updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("shipping_status", "label_processing").eq("payment_status", "paid").is("canceled_at", null);
    return { error: "Pedido ou exportador mudou antes da chamada DHL. Recarregue." };
  }
  const invoiceMode = processoTravado.entrada.invoiceModeForOrder;
  if (invoiceMode !== exporterAtCall.invoice_mode) {
    await s.from("shipments").delete().eq("id", lock.id).eq("status", "creating");
    await s.from("orders").update({ shipping_status: order.shipping_status, updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("shipping_status", "label_processing").eq("payment_status", "paid").is("canceled_at", null);
    return { error: "O modo da invoice mudou antes da chamada DHL. Recarregue o pedido." };
  }
  // A reserva precede a leitura definitiva dos dados mutáveis. O payload
  // completo é persistido antes da chamada para permitir reconciliação pelo
  // identificador do pedido mesmo que a resposta da DHL se perca.
  const payloadSelect = "id,order_number,payment_status,shipping_status,canceled_at,currency,subtotal_cents,discount_cents,total_cents,updated_at,addresses(*),customers(full_name,email,phone),order_items(id,product_name_snapshot,unit_price_cents,quantity)";
  const { data: orderAtCall } = await s.from("orders").select(payloadSelect).eq("id", orderId).maybeSingle();
  const freshAddress = (Array.isArray(orderAtCall?.addresses) ? orderAtCall.addresses[0] : orderAtCall?.addresses) as Record<string, unknown> | null;
  const freshCustomer = (Array.isArray(orderAtCall?.customers) ? orderAtCall.customers[0] : orderAtCall?.customers) as Record<string, unknown> | null;
  if (!orderAtCall || !freshAddress || !freshCustomer || orderAtCall.payment_status !== "paid" ||
      orderAtCall.shipping_status !== "label_processing" || orderAtCall.canceled_at ||
      orderAtCall.currency !== order.currency ||
      orderAtCall.subtotal_cents - orderAtCall.discount_cents !== processoTravado.entrada.valorMercadoriasCents ||
      !freshCustomer.full_name || !freshCustomer.email || !freshCustomer.phone ||
      !freshAddress.line1 || !freshAddress.city || !freshAddress.postal_code || !freshAddress.country) {
    await s.from("shipments").delete().eq("id", lock.id).eq("status", "creating");
    await s.from("orders").update({ shipping_status: order.shipping_status, updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("shipping_status", "label_processing").eq("payment_status", "paid").is("canceled_at", null);
    return { error: "Dados do pedido mudaram durante a reserva. Recarregue antes de chamar a DHL." };
  }
  const freshLines = [...(orderAtCall.order_items ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const evaluatedLines = [...processoTravado.entrada.linhas].sort((a, b) => a.id.localeCompare(b.id));
  if (JSON.stringify(freshLines.map(i => [i.id, i.quantity])) !== JSON.stringify(evaluatedLines.map(i => [i.id, i.quantity]))) {
    await s.from("shipments").delete().eq("id", lock.id).eq("status", "creating");
    await s.from("orders").update({ shipping_status: order.shipping_status, updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("shipping_status", "label_processing").eq("payment_status", "paid").is("canceled_at", null);
    return { error: "Itens do pedido mudaram durante a reserva. Recarregue." };
  }
  const pacote = processoTravado.entrada.pacote!;
  const lineItems = freshLines.map(item => {
    const snapshot = processoTravado.entrada.itens.find(i => i.order_item_id === item.id)!;
    return { description: snapshot.description_en, quantity: item.quantity,
      valueCents: snapshot.customs_value_cents, weightGrams: snapshot.net_weight_g * item.quantity,
      hsCode: snapshot.hs_code, originCountry: snapshot.country_of_origin };
  });
  const request = {
      orderId, productCode: "P", plannedShippingDate: planejadaPadrao(), currency: orderAtCall.currency,
      incoterm: pacote.incoterm,
      declaredValueCents: lineItems.reduce((sum, i) => sum + i.valueCents, 0),
      packageInfo: { weightGrams: pacote.gross_weight_g, lengthCm: pacote.length_cm, widthCm: pacote.width_cm, heightCm: pacote.height_cm },
      shipper: { legalName: exporterAtCall.legal_name, contactName: exporterAtCall.contact_name, taxId: exporterAtCall.tax_id, phone: exporterAtCall.phone, email: exporterAtCall.email, countryCode: exporterAtCall.country, postalCode: exporterAtCall.postal_code, cityName: exporterAtCall.city, provinceCode: exporterAtCall.region, addressLine1: exporterAtCall.address_line1 },
      receiver: { name: String(freshCustomer.full_name), phone: String(freshCustomer.phone), email: String(freshCustomer.email), countryCode: String(freshAddress.country), postalCode: freshAddress.postal_code as string | null, cityName: String(freshAddress.city), provinceCode: freshAddress.region as string | null, addressLine1: String(freshAddress.line1), addressLine2: freshAddress.line2 as string | null },
      lineItems, requestPickup: process.env.DHL_PICKUP_ENABLED?.trim() === "1", requestInvoice: invoiceMode === "api",
    };
  const exporterSnapshot = { legal_name: exporterAtCall.legal_name, tax_id: exporterAtCall.tax_id,
    country: exporterAtCall.country, postal_code: exporterAtCall.postal_code, city: exporterAtCall.city,
    address_line1: exporterAtCall.address_line1, region: exporterAtCall.region,
    contact_name: exporterAtCall.contact_name, phone: exporterAtCall.phone, email: exporterAtCall.email,
    dhl_account_confirmed: exporterAtCall.dhl_account_confirmed, invoice_mode: invoiceMode,
    settings_updated_at: exporterAtCall.updated_at };
  const snapshot = { request, order_number: orderAtCall.order_number, exporter_snapshot: exporterSnapshot,
    order_updated_at: orderAtCall.updated_at, exporter_updated_at: exporterAtCall.updated_at };
  const { data: snapSaved } = await s.from("shipments").update({
    metadata: { message_reference: orderId, request_snapshot: snapshot, communication: "prepared_not_sent" },
    updated_at: new Date().toISOString(),
  }).eq("id", lock.id).eq("status", "creating").select("id").maybeSingle();
  const { data: finalOrder } = await s.from("orders").select(payloadSelect).eq("id", orderId).maybeSingle();
  const normalize = (value: typeof orderAtCall | null) => value ? { ...value,
    order_items: [...(value.order_items ?? [])].sort((a, b) => a.id.localeCompare(b.id)) } : null;
  if (!snapSaved || JSON.stringify(normalize(finalOrder)) !== JSON.stringify(normalize(orderAtCall))) {
    await s.from("shipments").delete().eq("id", lock.id).eq("status", "creating");
    await s.from("orders").update({ shipping_status: order.shipping_status, updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("shipping_status", "label_processing").eq("payment_status", "paid").is("canceled_at", null);
    return { error: "O pedido mudou antes da chamada DHL. Recarregue." };
  }
  const { data: markedInFlight } = await s.from("shipments").update({
    metadata: { message_reference: orderId, request_snapshot: snapshot, communication: "request_in_flight" },
    updated_at: new Date().toISOString(),
  }).eq("id", lock.id).eq("status", "creating").select("id").maybeSingle();
  if (!markedInFlight) {
    return { error: "Tentativa DHL sem confirmação de início. Aguarde e reconcilie a reserva no Admin.", waitingForOwner: true };
  }
  let result: DhlShipmentResult;
  try {
    result = await new MyDhlProvider().createShipment(request);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Falha desconhecida";
    await s.from("shipments").update({ status: "creation_unknown", metadata: { message_reference: orderId, request_snapshot: snapshot, communication: "request_in_flight", error: reason.slice(0, 300), requires_manual_reconciliation: true }, updated_at: new Date().toISOString() }).eq("id", lock.id);
    await s.from("orders").update({ shipping_status: "shipping_error", updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("shipping_status", "label_processing").eq("payment_status", "paid").is("canceled_at", null);
    await registrarAuditoria(s, { action: "pedido.dhl_resposta_incerta", entityType: "orders", entityId: orderId,
      diff: { tentativa: lock.id, referencia: orderId, motivo: reason.slice(0, 300) } });
    return { error: `A DHL não confirmou a etiqueta. Confira o MyDHL antes de tentar novamente: ${reason}`, waitingForOwner: true };
  }
  const storedDocuments: Array<{ typeCode: string | null; storagePath: string }> = [];
  let savedToShipment = false;
  try {
    const adminStorage = createAdminClient();
    for (const document of result.documents) {
      const content = Buffer.from(document.contentBase64, "base64");
      if (content.subarray(0, 5).toString() !== "%PDF-") throw new Error("Documento DHL não é PDF");
      const storagePath = `${orderId}/dhl/${lock.id}/${randomUUID()}.pdf`;
      const { error: uploadError } = await adminStorage.storage.from("export-documents")
        .upload(storagePath, content, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error("Falha ao guardar documento DHL em storage privado");
      storedDocuments.push({ typeCode: document.typeCode, storagePath });
    }
    const labelPath = storedDocuments[indiceEtiquetaDhl(storedDocuments)]?.storagePath;
    if (!labelPath) throw new Error("DHL não devolveu PDF da etiqueta");
    const { data: shipmentSaved, error: shipmentSaveError } = await adminStorage.from("shipments").update({ provider_shipment_id: result.shipmentId, tracking_code: result.trackingNumber, label_url: `export-documents:${labelPath}`, status: "label_created", metadata: { message_reference: orderId, request_snapshot: snapshot, documents: storedDocuments, exporter_snapshot: exporterSnapshot, communication: "response_received", pickup_requested: process.env.DHL_PICKUP_ENABLED?.trim() === "1" }, updated_at: new Date().toISOString() }).eq("id", lock.id).eq("status", "creating").select("id").maybeSingle();
    if (shipmentSaveError || !shipmentSaved) {
      const { data: fallback } = await s.from("shipments").update({ status: "creation_unknown", metadata: { message_reference: orderId,
        request_snapshot: snapshot, exporter_snapshot: exporterSnapshot, communication: "response_received", documents: storedDocuments, provider_shipment_id: result.shipmentId,
        tracking_code_returned: result.trackingNumber, requires_manual_reconciliation: true,
        error: shipmentSaveError?.message?.slice(0, 300) ?? "Gravação da resposta DHL não confirmada" },
        updated_at: new Date().toISOString() }).eq("id", lock.id).eq("status", "creating").select("id").maybeSingle();
      if (!fallback && storedDocuments.length) await adminStorage.storage.from("export-documents").remove(storedDocuments.map(d => d.storagePath));
      await s.from("orders").update({ shipping_status: "shipping_error", updated_at: new Date().toISOString() })
        .eq("id", orderId).eq("shipping_status", "label_processing").eq("payment_status", "paid").is("canceled_at", null);
      await registrarAuditoria(s, { action: "pedido.dhl_resposta_nao_persistida", entityType: "orders", entityId: orderId,
        diff: { tentativa: lock.id, referencia: orderId, guia_retornada: result.trackingNumber } });
      return { error: `A DHL criou a remessa ${result.trackingNumber}, mas o sistema não conseguiu gravar a etiqueta. Não gere outra: registre a guia manualmente após conferir o MyDHL.`, waitingForOwner: true };
    }
    savedToShipment = true;
    const { data: orderSaved, error: orderSaveError } = await s.from("orders").update({ shipping_status: "label_created", updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("shipping_status", "label_processing").eq("payment_status", "paid").is("canceled_at", null).select("id").maybeSingle();
    if (orderSaveError || !orderSaved) {
      return { error: `A remessa ${result.trackingNumber} foi gravada, mas a situação do pedido não avançou. Não gere outra; recarregue e faça a reconciliação operacional.`, waitingForOwner: true };
    }
    const aviso = await registrarInvoiceDhlPendente(s, orderId, orderAtCall.order_number, {
      id: lock.id, provider: "dhl", tracking_code: result.trackingNumber, status: "label_created",
      metadata: { documents: storedDocuments, exporter_snapshot: { invoice_mode: invoiceMode ?? undefined } },
    });
    const resultadoPaypal = await enviarRastreioDhlAoPaypal(payments, orderId, result.trackingNumber);
    const paypal: "enviado" | "nao_aplicavel" | "falhou" = resultadoPaypal === "enviado"
      ? "enviado" : resultadoPaypal === "sem_paypal" ? "nao_aplicavel" : "falhou";
    await registrarAuditoria(s, { action: "pedido.gerar_envio_dhl", entityType: "orders", entityId: orderId, diff: { tracking: result.trackingNumber, paypal } });
    revalidatePath(`/admin/pedidos/${orderId}`); revalidatePath("/admin/pedidos");
    return { ok: true, tracking: result.trackingNumber, paypal, aviso: aviso ?? undefined };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Falha ao registrar resposta DHL";
    const { data: fallback } = await s.from("shipments").update({ status: "creation_unknown", metadata: { message_reference: orderId, request_snapshot: snapshot, exporter_snapshot: exporterSnapshot, communication: "response_received", documents: storedDocuments,
      provider_shipment_id: result.shipmentId, tracking_code_returned: result.trackingNumber,
      error: reason.slice(0, 300), requires_manual_reconciliation: true }, updated_at: new Date().toISOString() }).eq("id", lock.id).eq("status", "creating").select("id").maybeSingle();
    if (!fallback && !savedToShipment && storedDocuments.length) await createAdminClient().storage.from("export-documents").remove(storedDocuments.map(d => d.storagePath));
    await s.from("orders").update({ shipping_status: "shipping_error", updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("shipping_status", "label_processing").eq("payment_status", "paid").is("canceled_at", null);
    await registrarAuditoria(s, { action: "pedido.dhl_resposta_nao_persistida", entityType: "orders", entityId: orderId,
      diff: { tentativa: lock.id, referencia: orderId, guia_retornada: result.trackingNumber, motivo: reason.slice(0, 300) } });
    return { error: `A DHL retornou a guia ${result.trackingNumber}, mas houve falha ao registrá-la. Confira no MyDHL e reconcilie; não gere outra.`, waitingForOwner: true };
  }
}
