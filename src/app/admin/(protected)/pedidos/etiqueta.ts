"use server";

/**
 * Gerar a etiqueta de um pedido pago.
 *
 * ===========================================================================
 * ESTA AÇÃO GASTA DINHEIRO DE VERDADE
 * ===========================================================================
 * Criar a etiqueta na SuperFrete debita o valor do frete da carteira, no
 * instante da chamada. Não existe "criar para ver como fica". Por isso:
 *
 *   1. Só roda em pedido PAGO. Um pedido não pago não gera etiqueta, ponto.
 *   2. Uma etiqueta por pedido, garantido por índice único no banco
 *      (00000000000006_shipments_unique.sql) — não por um `if`, que teria
 *      uma janela entre ler e escrever, e é nessa janela que o segundo
 *      clique entra.
 *   3. O serviço é o que o cliente JÁ PAGOU, lido de shipping_quotes. Não se
 *      recota no despacho: outra cotação daria outro preço e outra
 *      transportadora, e a diferença sairia do bolso de alguém sem ninguém
 *      ter combinado.
 *
 * A ordem das operações abaixo é deliberada: a trava vem ANTES da chamada
 * que gasta. Se a SuperFrete falhar, o status volta ao que era — melhor um
 * pedido que precisa de outro clique que um pedido travado em "preparando"
 * sem etiqueta e sem ninguém entender por quê.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { getShippingProvider, ShippingUnavailable } from "@/lib/shipping";
import { caixaPara } from "@/lib/shipping/regras";
import type { OrderStatusValue } from "@/lib/admin/order-status";

const schema = z.object({ orderId: z.string().uuid() });

export type GerarEtiquetaResultado =
  | { error: string }
  | { ok: true; rastreio: string | null; etiquetaUrl: string | null };

/** Serviço padrão quando a cotação não registrou qual foi (pedido antigo ou
 *  cotação indisponível na hora da compra). PAC cobre o valor da peça e
 *  atende o país inteiro — é a escolha conservadora, não a mais barata. */
const SERVICO_PADRAO = 1;

export async function gerarEtiquetaAction(
  input: unknown
): Promise<GerarEtiquetaResultado> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Pedido inválido." };
  const { orderId } = parsed.data;

  const supabase = await createClient();

  const { data: pedido, error: erroLeitura } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, subtotal_cents, customer_id, address_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (erroLeitura || !pedido) {
    return { error: "Pedido não encontrado. Confira se você tem permissão de admin." };
  }

  const statusAtual = pedido.status as OrderStatusValue;
  if (statusAtual !== "paid" && statusAtual !== "preparing") {
    return {
      error:
        statusAtual === "new"
          ? "Este pedido ainda não foi pago — etiqueta só depois do pagamento confirmado."
          : `Este pedido está como "${statusAtual}"; a etiqueta se gera a partir de pago ou preparando.`,
    };
  }

  // Etiqueta já existe? Pergunta antes de gastar. O índice único é a
  // garantia de verdade; esta consulta existe para dar uma mensagem
  // decente em vez de um erro de banco.
  const { data: envioExistente } = await supabase
    .from("shipments")
    .select("id, tracking_code, label_url")
    .eq("order_id", orderId)
    .maybeSingle();

  if (envioExistente) {
    return {
      error:
        "Este pedido já tem etiqueta. Use o link de impressão em vez de gerar outra — cada etiqueta é cobrada da carteira da SuperFrete.",
    };
  }

  const [{ data: endereco }, { data: cliente }, { data: cotacao }] =
    await Promise.all([
      pedido.address_id
        ? supabase
            .from("addresses")
            .select(
              "recipient_name, cep, street, number, complement, neighborhood, city, state"
            )
            .eq("id", pedido.address_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      pedido.customer_id
        ? supabase
            .from("customers")
            .select("full_name, email, phone, cpf")
            .eq("id", pedido.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("shipping_quotes")
        .select("service_name, raw_response")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (!endereco || !cliente) {
    return {
      error:
        "Falta o endereço ou os dados do cliente neste pedido — a transportadora exige os dois para emitir a etiqueta.",
    };
  }
  if (!cliente.cpf) {
    return {
      error:
        "Este pedido não tem CPF registrado. Todas as transportadoras exigem CPF ou CNPJ do destinatário (declaração de conteúdo).",
    };
  }

  const bruto = (cotacao?.raw_response ?? {}) as { service_id?: unknown };
  const serviceId = Number(bruto.service_id) || SERVICO_PADRAO;

  const { data: itens } = await supabase
    .from("order_items")
    .select("quantity")
    .eq("order_id", orderId);
  const quantidade = (itens ?? []).reduce(
    (soma, i) => soma + Number(i.quantity ?? 0),
    0
  );

  // TRAVA — antes de gastar. O `.eq("status", statusAtual)` faz com que só
  // um chamador passe daqui: o segundo encontra zero linhas afetadas e para.
  const { data: travado, error: erroTrava } = await supabase
    .from("orders")
    .update({ status: "preparing", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", statusAtual)
    .select("id")
    .maybeSingle();

  if (erroTrava || !travado) {
    return {
      error:
        "Outra pessoa (ou outra aba) está gerando a etiqueta deste pedido agora. Recarregue a página em instantes.",
    };
  }

  async function devolverStatus() {
    await supabase
      .from("orders")
      .update({ status: statusAtual, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", "preparing");
  }

  const provider = getShippingProvider();

  let resultado;
  try {
    resultado = await provider.createShipment({
      orderId: pedido.id,
      orderNumber: pedido.order_number,
      serviceId,
      declaredValueCents: pedido.subtotal_cents,
      packageInfo: caixaPara(quantidade),
      recipient: {
        name: endereco.recipient_name ?? cliente.full_name,
        document: cliente.cpf,
        cep: endereco.cep,
        street: endereco.street,
        number: endereco.number,
        complement: endereco.complement,
        neighborhood: endereco.neighborhood,
        city: endereco.city,
        state: endereco.state,
        email: cliente.email,
        phone: cliente.phone,
      },
    });
  } catch (e) {
    await devolverStatus();
    // A mensagem da SuperFrete sobe INTEIRA de propósito. "Saldo
    // insuficiente na carteira" é acionável; "falhou ao gerar etiqueta" não
    // é, e deixaria a operação adivinhando.
    return {
      error:
        e instanceof ShippingUnavailable
          ? `A transportadora recusou: ${e.message}`
          : "Não foi possível gerar a etiqueta agora. Tente de novo em instantes.",
    };
  }

  // A etiqueta EXISTE e já foi paga a partir daqui. Falha de gravação abaixo
  // não pode significar "gera outra" — por isso o id volta em toda mensagem
  // de erro, para alguém achá-la no painel da SuperFrete.
  let etiquetaUrl: string | null = null;
  try {
    etiquetaUrl = await provider.getLabelUrl(resultado.providerShipmentId);
  } catch {
    // O PDF é recuperável depois; não vale desfazer um envio pago por causa
    // dele.
    etiquetaUrl = null;
  }

  const { error: erroEnvio } = await supabase.from("shipments").insert({
    id: randomUUID(),
    order_id: orderId,
    provider: provider.name,
    provider_shipment_id: resultado.providerShipmentId,
    service_name: cotacao?.service_name ?? resultado.carrier ?? null,
    tracking_code: resultado.trackingCode ?? null,
    label_url: etiquetaUrl,
    status: resultado.status,
  });

  if (erroEnvio) {
    await devolverStatus();
    return {
      error: `A etiqueta ${resultado.providerShipmentId} foi criada e paga na SuperFrete, mas não conseguimos registrá-la aqui. NÃO gere outra — anote este número e procure a etiqueta no painel deles.`,
    };
  }

  await supabase
    .from("orders")
    .update({ status: "label_ready", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "preparing");

  await registrarAuditoria(supabase, {
    action: "pedido.gerar_etiqueta",
    entityType: "orders",
    entityId: orderId,
    diff: {
      de: statusAtual,
      para: "label_ready",
      etiqueta: resultado.providerShipmentId,
      rastreio: resultado.trackingCode ?? null,
      servico: serviceId,
    },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);

  return {
    ok: true,
    rastreio: resultado.trackingCode ?? null,
    etiquetaUrl,
  };
}
