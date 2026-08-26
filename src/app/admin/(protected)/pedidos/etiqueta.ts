"use server";

/**
 * Gerar a etiqueta de um pedido pago.
 *
 * ===========================================================================
 * ESTA AÇÃO GASTA DINHEIRO DE VERDADE
 * ===========================================================================
 * Pagar a etiqueta na SuperFrete debita o frete da carteira no instante da
 * chamada. Não existe "criar para ver como fica". Por isso:
 *
 *   1. Só roda em pedido PAGO. Um pedido não pago não gera etiqueta, ponto.
 *   2. Uma etiqueta por pedido, garantido por índice único no banco
 *      (00000000000006_shipments_unique.sql) — não por um `if`, que teria
 *      uma janela entre ler e escrever, e é nessa janela que o segundo
 *      clique entra.
 *   3. A cotação É REFEITA (preço de duas semanas atrás não compra etiqueta
 *      hoje), mas A ESCOLHA NÃO É LIVRE: compra-se o mesmo serviço que o
 *      cliente pagou, enquanto ele existir. Ver escolherServico() em
 *      src/lib/shipping/regras.ts.
 *   4. Se o preço mudou mais de R$ 5 desde a compra, a ação PARA e devolve os
 *      dois números. Não é bloqueio — é fazer a diferença aparecer para
 *      alguém antes de sair do bolso da operação, em vez de na fatura do fim
 *      do mês, misturada.
 *
 * A ordem das operações é deliberada: cria → GRAVA → paga → completa. Gravar
 * entre criar e pagar é o que impede uma etiqueta paga que o nosso banco não
 * conhece. E a trava de status vem antes de tudo isso, para dois cliques não
 * virarem duas etiquetas.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { getShippingProvider, ShippingUnavailable } from "@/lib/shipping";
import { caixaPara, escolherServico } from "@/lib/shipping/regras";
import { cotarFrete } from "@/lib/shipping/cotar";
import type { OrderStatusValue } from "@/lib/admin/order-status";

const schema = z.object({
  orderId: z.string().uuid(),
  /** Segunda passagem, depois de a pessoa ver a diferença de preço. */
  confirmarDiferenca: z.boolean().optional(),
});

/**
 * Acima de quanto a diferença de frete precisa de gente para decidir.
 *
 * Centavos acontecem — travar a postagem por causa deles seria pior que o
 * problema. Acima de R$ 5 alguém precisa saber ANTES de comprar: pode ser
 * reajuste da transportadora, CEP corrigido, ou uma cotação de duas semanas
 * atrás. Número trazido do site irmão.
 */
const DIFERENCA_QUE_PEDE_GENTE_CENTS = 500;

export type GerarEtiquetaResultado =
  | { error: string }
  | {
      /** O frete mudou desde a cobrança — mostra os dois números e para. */
      confirmar: {
        cobradoCents: number;
        agoraCents: number;
        diferencaCents: number;
        servicoAgora: string;
      };
    }
  | { ok: true; rastreio: string | null; etiquetaUrl: string | null };


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
      "id, order_number, status, subtotal_cents, shipping_cents, customer_id, address_id"
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

  const { data: itens } = await supabase
    .from("order_items")
    .select("quantity")
    .eq("order_id", orderId);
  const quantidade = (itens ?? []).reduce(
    (soma, i) => soma + Number(i.quantity ?? 0),
    0
  );

  // Recota para saber o que existe HOJE — mas a escolha continua presa ao
  // que o cliente pagou (ver escolherServico).
  const bruto = (cotacao?.raw_response ?? {}) as { service_id?: unknown };
  const servicoPago = Number(bruto.service_id) || null;

  const agora = await cotarFrete({
    cepDestino: endereco.cep,
    valorDeclaradoCents: pedido.subtotal_cents,
    quantidade,
  });

  if (agora.indisponivel) {
    return {
      error: `A transportadora não respondeu agora (${agora.indisponivel.slice(0, 120)}). Tente de novo em instantes — nada foi cobrado.`,
    };
  }

  const servico = escolherServico(servicoPago, agora.opcoes);
  if (!servico) {
    return {
      error:
        "Nenhuma transportadora disponível cobre o valor declarado deste pedido neste CEP. Confira o endereço antes de tentar de novo.",
    };
  }
  const serviceId = servico.serviceId;

  /**
   * O frete mudou desde a cobrança? Mostra os dois números e para.
   *
   * Não é bloqueio: a segunda chamada, com confirmarDiferenca, compra assim
   * mesmo. O ponto é que a diferença saia do bolso da operação com alguém
   * sabendo, e não escondida na fatura do fim do mês.
   */
  const cobradoCents = pedido.shipping_cents ?? 0;
  const diferenca = servico.priceCents - cobradoCents;
  if (
    cobradoCents > 0 &&
    Math.abs(diferenca) > DIFERENCA_QUE_PEDE_GENTE_CENTS &&
    !parsed.data.confirmarDiferenca
  ) {
    return {
      confirmar: {
        cobradoCents,
        agoraCents: servico.priceCents,
        diferencaCents: diferenca,
        servicoAgora: servico.serviceName || servico.carrier,
      },
    };
  }

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

  /* =========================================================================
   * A ORDEM DAQUI PARA BAIXO É A PARTE QUE IMPORTA
   *
   *   1. cria a etiqueta   (existe, não custou nada ainda)
   *   2. GRAVA no banco     (com status pending)
   *   3. paga a etiqueta    (aqui o dinheiro sai)
   *   4. atualiza o registro com rastreio e PDF
   *
   * Gravar entre criar e pagar é o que impede o pior desfecho: uma etiqueta
   * paga na SuperFrete que o nosso banco não conhece. Ali o dinheiro já saiu,
   * ninguém sabe, e a reação natural de quem vê o erro é gerar outra — e
   * pagar duas. Regra trazida do site irmão, onde ela está escrita com o
   * mesmo motivo (painel/postagem/route.ts, 19/08/2026).
   * ========================================================================= */

  let resultado;
  try {
    resultado = await provider.createLabel({
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

  // PASSO 2 — grava ANTES de pagar. Se a gravação falhar, a etiqueta criada
  // ainda não custou nada: dá para descartá-la no painel deles sem prejuízo.
  const shipmentId = randomUUID();
  const { error: erroEnvio } = await supabase.from("shipments").insert({
    id: shipmentId,
    order_id: orderId,
    provider: provider.name,
    provider_shipment_id: resultado.providerShipmentId,
    service_name: servico.serviceName || servico.carrier || null,
    tracking_code: null,
    label_url: null,
    status: resultado.status,
  });

  if (erroEnvio) {
    await devolverStatus();
    return {
      error: `A etiqueta ${resultado.providerShipmentId} foi criada na SuperFrete mas não conseguimos registrá-la aqui — e por isso ela NÃO foi paga, então nada foi cobrado. Tente de novo.`,
    };
  }

  // PASSO 3 — aqui o dinheiro sai.
  try {
    await provider.payLabel(resultado.providerShipmentId);
  } catch (e) {
    // O registro fica, com status pending: a etiqueta existe, não foi paga, e
    // o painel mostra isso. Não devolve o status do pedido, porque "preparing"
    // com envio pendente é exatamente o estado real.
    return {
      error:
        e instanceof ShippingUnavailable
          ? e.message
          : "A etiqueta foi criada mas o pagamento dela falhou. Confira o saldo da carteira na SuperFrete.",
    };
  }

  // PASSO 4 — o rastreio só existe depois de paga; agora dá para perguntar.
  let rastreio: string | null = null;
  let etiquetaUrl: string | null = null;
  let statusFinal = "released";
  try {
    const info = await provider.getShipmentStatus(resultado.providerShipmentId);
    rastreio = info.trackingCode;
    statusFinal = info.status;
  } catch {
    // Etiqueta paga e registrada; o rastreio aparece depois. Não vale
    // transformar isto em erro para quem já conseguiu comprar.
  }
  try {
    etiquetaUrl = await provider.getLabelUrl(resultado.providerShipmentId);
  } catch {
    etiquetaUrl = null;
  }

  await supabase
    .from("shipments")
    .update({
      tracking_code: rastreio,
      label_url: etiquetaUrl,
      status: statusFinal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shipmentId);

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
      rastreio,
      servico: serviceId,
      servico_pago_no_checkout: servicoPago,
      // Quando o frete mudou de preço entre a compra e o despacho, o número
      // fica registrado. É a diferença que a operação absorveu neste pedido.
      cobrado_cents: pedido.shipping_cents,
      pago_agora_cents: servico.priceCents,
    },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);

  return { ok: true, rastreio, etiquetaUrl };
}
