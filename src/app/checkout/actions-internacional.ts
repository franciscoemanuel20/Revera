"use server";

/**
 * Criação do pedido INTERNACIONAL — irmã de criarPedidoAction (actions.ts),
 * deliberadamente um arquivo separado: o caminho brasileiro paga as contas
 * e não pode herdar risco de refactor internacional. O que é idêntico
 * (trava de duplo clique, IDs gerados aqui, atribuição, preço nunca do
 * navegador) segue o mesmo desenho; o que difere está comentado.
 *
 * Diferenças de fundo:
 *  - preço vem de variant_prices NA MOEDA do mercado (nunca convertido,
 *    nunca com a escada de desconto brasileira) — precosDoCarrinhoNoMercado;
 *  - frete vem de cotação MANUAL cadastrada (intl_shipping_quotes), com
 *    validade — sem cotação vigente o mercado nem abre;
 *  - endereço valida por validarEndereco() (única porta de validação
 *    internacional), não pelo schema brasileiro;
 *  - o pedido só nasce com o ACEITE internacional marcado, e grava
 *    terms_version + terms_accepted_at (relógio do servidor);
 *  - imposto NÃO entra no total (tax_cents = 0): estrutura §4 — nada de
 *    calcular imposto sem integrador confiável.
 */
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  devolverCarrinhoParaAberto,
  lerCarrinhoCompleto,
  reivindicarCarrinhoParaPedido,
} from "@/lib/cart/store";
import { limparTokenDoCookie } from "@/lib/cart/token";
import { createAdminClient } from "@/lib/supabase/server";
import { paraLinha, validarEndereco } from "@/lib/internacional/endereco";
import {
  precosDoCarrinhoNoMercado,
  prontidaoDoMercado,
} from "@/lib/internacional/mercado";
import { ACEITE_INTERNACIONAL_VERSAO } from "@/lib/internacional/aceite";
import type { CheckoutResult } from "./actions";

const textoCurto = z.string().max(500).nullable().optional().catch(null);

const schemaInternacional = z.object({
  pais: z.string().trim().min(2).max(2).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(3, "Informe seu nome completo."),
  email: z
    .string()
    .trim()
    .email("E-mail inválido.")
    .transform((v) => v.toLowerCase()),
  telefone: z.string().trim().min(1, "Informe seu telefone."),
  empresa: z.string().trim().nullable().default(null),
  linha1: z.string().trim().min(1, "Informe o endereço."),
  linha2: z.string().trim().nullable().default(null),
  cidade: z.string().trim().min(1, "Informe a cidade."),
  regiao: z.string().trim().nullable().default(null),
  codigoPostal: z.string().trim().min(1, "Informe o código postal."),
  /**
   * O aceite é OBRIGATÓRIO e específico (estrutura §6). `literal(true)`:
   * não existe pedido internacional sem ele, nem por payload adulterado —
   * o botão desabilitado na tela é cortesia, a trava é esta.
   */
  aceite: z.literal(true, {
    errorMap: () => ({ message: "É preciso aceitar as condições de envio internacional." }),
  }),
  atribuicao: z
    .object({
      fbp: textoCurto,
      fbc: textoCurto,
      gaClientId: textoCurto,
      fbclid: textoCurto,
      gclid: textoCurto,
      utmSource: textoCurto,
      utmMedium: textoCurto,
      utmCampaign: textoCurto,
      utmContent: textoCurto,
      utmTerm: textoCurto,
    })
    .nullable()
    .optional()
    .catch(null),
});

export type CheckoutInternacionalInput = z.input<typeof schemaInternacional>;

function gerarNumeroPedido(): string {
  return `REV-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export async function criarPedidoInternacionalAction(
  input: unknown
): Promise<CheckoutResult> {
  const parsed = schemaInternacional.safeParse(input);
  if (!parsed.success) {
    const camposComErro: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0];
      if (typeof campo === "string" && !camposComErro[campo]) {
        camposComErro[campo] = issue.message;
      }
    }
    return { erro: "Confira os dados marcados abaixo.", camposComErro };
  }
  const dados = parsed.data;

  // A única porta de validação de endereço internacional — inclui a regra
  // por país (código postal, região obrigatória onde for).
  const endereco = validarEndereco({
    pais: dados.pais,
    destinatario: dados.name,
    empresa: dados.empresa,
    linha1: dados.linha1,
    linha2: dados.linha2,
    cidade: dados.cidade,
    regiao: dados.regiao,
    codigoPostal: dados.codigoPostal,
    telefone: dados.telefone,
  });
  if (!endereco.ok) {
    const camposComErro: Record<string, string> = {};
    for (const e of endereco.erros) {
      if (e.campo && !camposComErro[e.campo]) camposComErro[e.campo] = e.mensagem;
    }
    return { erro: "Confira os dados marcados abaixo.", camposComErro };
  }
  if (endereco.endereco.pais === "BR") {
    return { erro: "Endereço no Brasil usa o checkout nacional." };
  }

  /**
   * Prontidão RECONFERIDA aqui, não herdada da tela: gateway, país aberto
   * e cotação de frete vigente. A tela pode ter ficado aberta por horas —
   * a cotação pode ter VENCIDO nesse meio-tempo, e um frete vencido não
   * congela num pedido novo.
   */
  const mercado = await prontidaoDoMercado(dados.pais);
  if (!mercado.aberto) {
    return { erro: `Não foi possível concluir: ${mercado.motivo}` };
  }

  const carrinho = await lerCarrinhoCompleto();
  if (!carrinho.cartId || carrinho.items.length === 0) {
    return { erro: "Sua sacola está vazia — volte e adicione algo antes de finalizar." };
  }

  // Preço do MERCADO para cada item — sem preço configurado, sem venda.
  const precos = await precosDoCarrinhoNoMercado(
    carrinho.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    mercado.moeda
  );
  if (!precos.ok) {
    return {
      erro:
        "Um dos itens ainda não tem preço definido para o seu país. " +
        "Nos escreva e resolvemos rapidinho — ou finalize em outro momento.",
    };
  }

  // Trava do duplo clique — idêntica ao nacional, mesma função.
  if (!(await reivindicarCarrinhoParaPedido(carrinho.cartId))) {
    return {
      erro:
        "Este pedido já está sendo finalizado. Aguarde um instante — se a tela " +
        "não avançar sozinha, confira seu e-mail antes de tentar de novo.",
    };
  }

  const admin = createAdminClient();

  async function falhar(mensagem: string): Promise<CheckoutResult> {
    await devolverCarrinhoParaAberto(carrinho.cartId as string);
    return { erro: mensagem };
  }

  const customerId = randomUUID();
  const { error: erroCustomer } = await admin.from("customers").insert({
    id: customerId,
    full_name: dados.name,
    email: dados.email,
    phone: endereco.endereco.telefone,
    // Cliente internacional NÃO tem CPF — e não se inventa identificação
    // fiscal: foreign_tax_id só entra quando o cliente informar (fase
    // fiscal, com o contador). Nulo é o valor honesto hoje.
    cpf: null,
    country: endereco.endereco.pais,
  });
  if (erroCustomer) {
    return falhar("Não foi possível registrar seus dados. Tente novamente.");
  }

  const linha = paraLinha(endereco.endereco);
  const addressId = randomUUID();
  const { error: erroAddress } = await admin.from("addresses").insert({
    id: addressId,
    customer_id: customerId,
    recipient_name: dados.name,
    country: endereco.endereco.pais,
    company: linha.company,
    line1: linha.line1,
    line2: linha.line2,
    city: linha.city,
    region: linha.region,
    postal_code: linha.postal_code,
  });
  if (erroAddress) {
    return falhar("Não foi possível registrar o endereço. Tente novamente.");
  }

  const subtotalCents = precos.subtotalCents;
  const shippingCents = mercado.frete.priceCents;
  // tax_cents = 0 NÃO significa "sem imposto no destino" — significa "a
  // Reverá não cobrou imposto no checkout" (estrutura §4). O aviso e o
  // aceite comunicam a diferença ao cliente.
  const taxCents = 0;
  const totalCents = subtotalCents + shippingCents + taxCents;

  const cabecalhos = await headers();
  const encadeado = cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim();
  const atribuicao = {
    fbp: dados.atribuicao?.fbp ?? null,
    fbc: dados.atribuicao?.fbc ?? null,
    ga_client_id: dados.atribuicao?.gaClientId ?? null,
    fbclid: dados.atribuicao?.fbclid ?? null,
    gclid: dados.atribuicao?.gclid ?? null,
    utm_source: dados.atribuicao?.utmSource ?? null,
    utm_medium: dados.atribuicao?.utmMedium ?? null,
    utm_campaign: dados.atribuicao?.utmCampaign ?? null,
    utm_content: dados.atribuicao?.utmContent ?? null,
    utm_term: dados.atribuicao?.utmTerm ?? null,
    client_ip: cabecalhos.get("x-real-ip") ?? encadeado ?? null,
    user_agent: cabecalhos.get("user-agent")?.slice(0, 500) ?? null,
  };

  const orderId = randomUUID();
  const accessToken = randomUUID();

  let orderNumber = gerarNumeroPedido();
  let pedidoCriado = false;
  for (let tentativa = 0; tentativa < 3 && !pedidoCriado; tentativa += 1) {
    const { error } = await admin.from("orders").insert({
      id: orderId,
      order_number: orderNumber,
      access_token: accessToken,
      customer_id: customerId,
      address_id: addressId,
      currency: mercado.moeda,
      subtotal_cents: subtotalCents,
      discount_cents: 0,
      shipping_cents: shippingCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      export_status: "pending_data",
      // O aceite: versão + instante do SERVIDOR. O navegador só disse
      // "true"; quem data é a gente.
      terms_version: ACEITE_INTERNACIONAL_VERSAO,
      terms_accepted_at: new Date().toISOString(),
      // Qual cotação congelou este frete (estrutura §2/§8).
      intl_shipping_quote_id: mercado.frete.id,
      ...atribuicao,
    });

    if (!error) {
      pedidoCriado = true;
    } else if (error.code === "23505") {
      orderNumber = gerarNumeroPedido();
    } else {
      console.error("[checkout-intl] falha ao criar pedido", error);
      return falhar("Não foi possível criar o pedido agora. Tente novamente em instantes.");
    }
  }
  if (!pedidoCriado) {
    return falhar("Não foi possível criar o pedido agora. Tente novamente em instantes.");
  }

  const porVariante = new Map(precos.itens.map((i) => [i.variantId, i]));
  const itensPayload = carrinho.items.map((item) => {
    const preco = porVariante.get(item.variantId);
    return {
      id: randomUUID(),
      order_id: orderId,
      variant_id: item.variantId,
      product_name_snapshot: item.productName,
      variant_label_snapshot: item.variantLabel,
      unit_price_cents: preco?.unitPriceCents ?? 0,
      quantity: item.quantity,
      subtotal_cents: preco?.subtotalCents ?? 0,
    };
  });

  const { error: erroItens } = await admin.from("order_items").insert(itensPayload);
  if (erroItens) {
    return falhar("Não foi possível registrar os itens do pedido. Tente novamente.");
  }

  await limparTokenDoCookie();

  redirect(`/checkout/pagamento?pedido=${accessToken}`);
}
