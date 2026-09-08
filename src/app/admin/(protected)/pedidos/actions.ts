"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import {
  ENVIO_LABEL,
  validarTransicaoEnvio,
  type ShippingStatusValue,
} from "@/lib/admin/venda-status";

/**
 * Idade mínima de uma reserva `pending` antes de `liberarReservaTravadaAction`
 * aceitar apagá-la — ver o comentário no ponto de uso. Mesmo valor de
 * IDADE_PARA_SUGERIR_CONTATO_MS em src/app/checkout/pagamento/page.tsx, de
 * propósito: é a mesma pergunta ("será que ainda está em andamento?"), só
 * que aqui a resposta bloqueia uma ação em vez de só mudar um texto.
 */
const IDADE_MINIMA_PARA_LIBERAR_MS = 90_000;

/**
 * As ações manuais da responsável sobre um pedido.
 *
 * ===========================================================================
 * O QUE MUDOU EM 27/08/2026 (migration 8)
 * ===========================================================================
 * Antes existia UMA ação que movia `orders.status` por uma máquina de
 * estados que misturava dinheiro e caixa. Agora são duas, porque são duas
 * coisas diferentes:
 *
 *   marcarEnvioAction   — anda no eixo do ENVIO ("enviei", "chegou")
 *   cancelarPedidoAction — cancela, com motivo e data
 *
 * O eixo do PAGAMENTO não tem ação manual nenhuma, de propósito: só
 * confirmarPagamento() escreve nele, e só depois de perguntar ao gateway.
 * Marcar "pago" na mão é o caminho mais curto para despachar mercadoria sem
 * ter recebido.
 *
 * Emitir etiqueta também não está aqui — aquilo não é mudar status, é gastar
 * dinheiro, e mora em etiqueta.ts com trava própria.
 *
 * Usa createClient() (sessão, sob RLS): a policy "admin manage orders" da
 * migration 05 é quem autoriza a escrita. Esta função só garante que a
 * transição faz sentido, porque RLS não sabe validar sequência de estado.
 */

const ENVIOS_VALIDOS = [
  "not_ready",
  "awaiting_label",
  "label_processing",
  "label_created",
  "shipped",
  "delivered",
  "shipping_error",
] as const;

const marcarEnvioSchema = z.object({
  orderId: z.string().uuid(),
  novoEnvio: z.enum(ENVIOS_VALIDOS),
});

export type MarcarEnvioInput = z.infer<typeof marcarEnvioSchema>;
export type AcaoPedidoResultado = { error: string } | { ok: true };

export async function marcarEnvioAction(input: MarcarEnvioInput): Promise<AcaoPedidoResultado> {
  const parsed = marcarEnvioSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const { orderId, novoEnvio } = parsed.data;
  const supabase = await createClient();

  const { data: pedido, error: erroLeitura } = await supabase
    .from("orders")
    .select("id, payment_status, shipping_status, canceled_at")
    .eq("id", orderId)
    .maybeSingle();
  if (erroLeitura || !pedido) {
    return { error: "Pedido não encontrado. Confira se você tem permissão de admin." };
  }

  if (pedido.canceled_at) {
    return { error: "Este pedido está cancelado. Não é possível mexer no envio." };
  }
  if (pedido.payment_status !== "paid") {
    return { error: "Este pedido não está pago. Não é possível mexer no envio." };
  }

  const atual = pedido.shipping_status as ShippingStatusValue;
  const validacao = validarTransicaoEnvio(atual, novoEnvio as ShippingStatusValue);
  if (!validacao.ok) {
    return { error: validacao.erro };
  }

  const { data: aplicado, error: erroUpdate } = await supabase
    .from("orders")
    .update({ shipping_status: novoEnvio, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    // Mesma defesa de corrida do webhook e da emissão de etiqueta: só aplica
    // se a situação ainda for a que esta tela leu — evita duas abas do admin
    // resolvendo a mesma transição uma em cima da outra.
    .eq("shipping_status", atual)
    .select("id")
    .maybeSingle();

  if (erroUpdate || !aplicado) {
    return {
      error:
        "Não foi possível atualizar. A situação do pedido pode ter mudado em outra aba — recarregue a página.",
    };
  }

  await registrarAuditoria(supabase, {
    action: "pedido.marcar_envio",
    entityType: "orders",
    entityId: orderId,
    diff: { de: ENVIO_LABEL[atual], para: ENVIO_LABEL[novoEnvio as ShippingStatusValue] },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin");
  return { ok: true };
}

const cancelarSchema = z.object({
  orderId: z.string().uuid(),
  motivo: z.string().trim().min(3, "Escreva o motivo do cancelamento.").max(500),
});

export type CancelarPedidoInput = z.infer<typeof cancelarSchema>;

/**
 * Cancelar NÃO apaga nada — grava data e motivo, e o pedido continua na aba
 * de cancelados com todo o histórico. Pedido some é pedido que ninguém
 * consegue explicar ao cliente depois.
 *
 * Um pedido cujo envio já saiu não é cancelável por aqui: aquilo é
 * devolução, um fluxo com outras regras (e outro dinheiro), e fingir que um
 * botão resolve seria pior que não ter o botão.
 */
export async function cancelarPedidoAction(
  input: CancelarPedidoInput
): Promise<AcaoPedidoResultado> {
  const parsed = cancelarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const { orderId, motivo } = parsed.data;
  const supabase = await createClient();

  const { data: pedido } = await supabase
    .from("orders")
    .select("id, shipping_status, canceled_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!pedido) {
    return { error: "Pedido não encontrado. Confira se você tem permissão de admin." };
  }
  if (pedido.canceled_at) {
    return { error: "Este pedido já está cancelado." };
  }
  if (["shipped", "delivered"].includes(pedido.shipping_status as string)) {
    return {
      error:
        "Este pedido já foi enviado. Cancelar aqui não traz a encomenda de volta — trate como devolução com o cliente.",
    };
  }

  const { data: aplicado, error: erroUpdate } = await supabase
    .from("orders")
    .update({
      canceled_at: new Date().toISOString(),
      cancel_reason: motivo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .is("canceled_at", null)
    .select("id")
    .maybeSingle();

  if (erroUpdate || !aplicado) {
    return { error: "Não foi possível cancelar. Recarregue a página e tente de novo." };
  }

  await registrarAuditoria(supabase, {
    action: "pedido.cancelar",
    entityType: "orders",
    entityId: orderId,
    diff: { motivo },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin");
  return { ok: true };
}

const liberarReservaSchema = z.object({
  paymentId: z.string().uuid(),
  orderId: z.string().uuid(),
});

export type LiberarReservaInput = z.infer<typeof liberarReservaSchema>;

/**
 * Libera uma reserva de pagamento TRAVADA — uma linha `pending` em
 * `payments` sem URL de checkout guardada em lugar nenhum (nem
 * `raw_response`, nem `payment_events`). Sem isso o cliente nunca mais
 * consegue abrir o pagamento deste pedido (achado do Codex, 08/09/2026).
 *
 * ===========================================================================
 * POR QUE ISTO É UM BOTÃO DE HUMANO, E NÃO UM TIMER
 * ===========================================================================
 * Uma versão anterior de src/app/checkout/pagamento/page.tsx liberava essa
 * reserva sozinha depois de 90 s, se o gateway confirmasse "não pago". O
 * Codex apontou o furo: "não pago" não é o mesmo que "não existe link em
 * aberto". O gateway pode ter criado um link de pagamento válido que
 * ninguém pagou ainda — e liberar essa reserva automaticamente para uma
 * cobrança nova criaria um SEGUNDO link válido para o mesmo pedido, o
 * duplo-link que a migration 13 existe para impedir. Nem a InfinitePay nem
 * a Stripe, nesta integração, dão um jeito de perguntar "existe um link em
 * aberto para este pedido" nem de cancelar o antigo por id de pedido — só
 * por id de transação, que é exatamente o que se perde quando a reserva
 * trava.
 *
 * Sem um jeito automático e seguro de saber se o link antigo está mesmo
 * morto, a decisão vira humana: quem opera confere no painel do próprio
 * gateway se existe outro link em aberto para este pedido, e só então
 * libera. Mesmo desenho de `registrarReembolso()` em confirmar.ts — "o
 * estorno em si é manual no painel da InfinitePay, nossa integração não tem
 * chamada de estorno".
 *
 * Por isso esta ação SÓ apaga a reserva — nunca toca em `payment_status`
 * nem marca nada como pago ou cancelado. O pedido volta a poder tentar um
 * pagamento novo; o que aconteceu com o link antigo continua sendo
 * responsabilidade de quem conferiu no gateway antes de clicar.
 */
export async function liberarReservaTravadaAction(
  input: LiberarReservaInput
): Promise<AcaoPedidoResultado> {
  const parsed = liberarReservaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }
  const { paymentId, orderId } = parsed.data;
  const supabase = await createClient();

  const { data: pagamento } = await supabase
    .from("payments")
    .select("id, order_id, status, raw_response, created_at")
    .eq("id", paymentId)
    .maybeSingle();

  if (!pagamento || pagamento.order_id !== orderId) {
    return { error: "Reserva não encontrada. Confira se você tem permissão de admin." };
  }
  if (pagamento.status !== "pending") {
    return {
      error: "Esta reserva não está mais pendente — pode já ter sido resolvida. Recarregue a página.",
    };
  }
  /**
   * IDADE MÍNIMA antes de liberar (achado do Codex, 08/09/2026): a
   * sequência inteira que cria a cobrança — chamar o gateway e até 3
   * tentativas de gravar o resultado — acontece dentro de UMA requisição
   * síncrona do CLIENTE em src/app/checkout/pagamento/page.tsx, e não passa
   * perto disto. Sem esta idade mínima, um admin podia liberar (apagar) uma
   * reserva que uma aba do cliente ainda estava preenchendo NAQUELE
   * instante — o UPDATE dela então não acharia mais a linha, e mesmo com a
   * recriação automática que o checkout agora faz nesse caso, é mais
   * simples não abrir a janela do que fechá-la depois. Reserva mais nova
   * que isto quase certamente ainda está em voo; não é travada, é rápida.
   */
  const idadeMs = Date.now() - new Date(pagamento.created_at as string).getTime();
  if (idadeMs < IDADE_MINIMA_PARA_LIBERAR_MS) {
    return {
      error: "Esta reserva é recente demais para liberar — pode ainda estar em andamento. Espere um pouco e recarregue a página.",
    };
  }
  // Trava contra o uso errado do botão: reserva COM url guardada não é
  // "travada", é um link válido em uso — apagar aqui derrubaria um link que
  // o cliente pode estar prestes a abrir.
  const urlGuardada = (pagamento.raw_response as { checkout_url?: string } | null)?.checkout_url;
  if (urlGuardada) {
    return {
      error: "Esta reserva tem um link de checkout guardado — não é uma reserva travada.",
    };
  }

  /**
   * A MESMA trava, para o outro lugar onde a URL pode estar guardada
   * (achado do Codex, 08/09/2026): quando o UPDATE em `payments` falha, o
   * checkout guarda a URL em `payment_events` (evento
   * `checkout_link_recovery`) — ver src/app/checkout/pagamento/page.tsx.
   * Essa reserva NÃO está travada: a próxima visita do cliente restaura o
   * link sozinha. Apagar aqui destruiria essa recuperação de verdade —
   * `payment_events.payment_id` tem `on delete cascade`, então o evento
   * some junto com a reserva.
   *
   * Reconferido no SERVIDOR, não só na tela: a lista que decide se mostra o
   * botão (admin/pedidos/[id]/page.tsx) pode estar desatualizada no
   * instante do clique — um evento pode ter chegado entre o carregamento da
   * página e o clique no botão.
   */
  const { data: recuperacao } = await supabase
    .from("payment_events")
    .select("id")
    .eq("payment_id", paymentId)
    .eq("event_type", "checkout_link_recovery")
    .maybeSingle();
  if (recuperacao) {
    return {
      error:
        "Esta reserva tem um link recuperável registrado — não é uma reserva travada. Recarregue a página.",
    };
  }

  /**
   * A LIBERAÇÃO DE VERDADE ACONTECE AQUI, numa função SQL atômica (migration
   * 17 — `liberar_reserva_travada`), não nas leituras acima.
   *
   * As checagens de cima (raw_response, payment_events) só existem para dar
   * um erro específico e cedo. Elas podem estar desatualizadas no instante
   * do clique — o checkout do cliente pode gravar a URL, OU o evento de
   * recuperação, exatamente entre essas leituras e agora (achados do Codex,
   * 08/09/2026, em rodadas sucessivas: primeiro a corrida contra
   * `raw_response` sozinha, depois a mesma corrida contra `payment_events`,
   * que um `DELETE ... WHERE` da API simples do PostgREST não consegue
   * fechar — "não existe linha na OUTRA tabela" não é algo que dê para
   * condicionar num filtro de coluna).
   *
   * A função reconfere as MESMAS três condições (pendente, raw_response
   * ainda vazio, sem evento de recuperação) e apaga — tudo dentro de UM SÓ
   * statement no Postgres. Não existe intervalo entre checar e apagar
   * porque não existem dois passos.
   */
  const { data: liberados, error: erroLiberar } = await supabase.rpc("liberar_reserva_travada", {
    p_payment_id: paymentId,
    p_order_id: orderId,
  });
  if (erroLiberar) {
    const funcaoAusente = erroLiberar.message?.toLowerCase().includes("function");
    return {
      error: funcaoAusente
        ? "A liberação de reservas ainda não foi configurada no banco (falta aplicar supabase/aplicar/LIBERAR-RESERVA-ATOMICO.sql). Avise quem cuida do site."
        : "Não foi possível liberar agora. Tente de novo em instantes.",
    };
  }
  if (!liberados || liberados.length === 0) {
    return {
      error:
        "Esta reserva mudou no instante da liberação — pode ter acabado de ganhar um link ou uma recuperação registrada. Recarregue a página e confira antes de tentar de novo.",
    };
  }

  await registrarAuditoria(supabase, {
    action: "pedido.liberar_reserva_travada",
    entityType: "orders",
    entityId: orderId,
    diff: { pagamento: paymentId },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true };
}

/**
 * Marca as vendas como VISTAS — só apaga o contador do menu.
 *
 * Deliberadamente não toca em status nenhum: ver uma venda não a prepara,
 * não a paga e não a envia. Misturar as duas coisas faria o simples ato de
 * abrir a tela mudar a situação de um pedido, que é exatamente o tipo de
 * efeito colateral que ninguém espera de "dar uma olhada".
 */
export async function marcarVendasVistasAction(): Promise<AcaoPedidoResultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ seen_at: new Date().toISOString() })
    .is("seen_at", null)
    .eq("payment_status", "paid");
  if (error) {
    return { error: "Não foi possível marcar como visto." };
  }
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin");
  return { ok: true };
}
