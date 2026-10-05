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
import { idiomaDoPais } from "@/lib/internacional/paises";
import { textos, type Idioma } from "@/lib/internacional/idioma";
import { obterCotacaoPtax } from "@/lib/internacional/cambio-ptax";
import { cotarDhlOperacional } from "@/lib/shipping/dhl/admin-quote";
import type { DhlQuote } from "@/lib/shipping/dhl/types";
import { avisarPedidoPendentePorEmail } from "@/lib/notificacoes/email-operacional";
import type { CheckoutResult } from "./actions";

const textoCurto = z.string().max(500).nullable().optional().catch(null);

/**
 * Fábrica por idioma, pela mesma razão de `endereco.ts`: a mensagem de erro
 * é texto que o comprador lê, e quem compra dos EUA lê inglês.
 */
function construirSchema(idioma: Idioma) {
  const t = textos(idioma);
  return z.object({
  trackingConsent: z.boolean().optional().default(false),
  pais: z.string().trim().min(2).max(2).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(3, t.erroNome),
  email: z
    .string()
    .trim()
    .email(t.erroEmail)
    .transform((v) => v.toLowerCase()),
  telefone: z.string().trim().min(1, t.erroTelefone),
  empresa: z.string().trim().nullable().default(null),
  linha1: z.string().trim().min(1, t.erroEnderecoObrigatorio),
  linha2: z.string().trim().nullable().default(null),
  cidade: z.string().trim().min(1, t.erroCidadeObrigatoria),
  regiao: z.string().trim().nullable().default(null),
  // Alguns destinos não têm código postal. A validação de endereço decide
  // se ele é obrigatório conforme o país, depois de ler o payload.
  codigoPostal: z.string().trim().default(""),
  /**
   * O aceite é OBRIGATÓRIO e específico (estrutura §6). `literal(true)`:
   * não existe pedido internacional sem ele, nem por payload adulterado —
   * o botão desabilitado na tela é cortesia, a trava é esta.
   */
  aceite: z.literal(true, {
    errorMap: () => ({ message: t.aceiteObrigatorio }),
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
}

const SCHEMAS = new Map<Idioma, ReturnType<typeof construirSchema>>();

function schemaDoIdioma(idioma: Idioma) {
  let schema = SCHEMAS.get(idioma);
  if (!schema) {
    schema = construirSchema(idioma);
    SCHEMAS.set(idioma, schema);
  }
  return schema;
}

const schemaInternacional = schemaDoIdioma("pt");

export type CheckoutInternacionalInput = z.input<typeof schemaInternacional>;

/**
 * O país é lido do payload CRU, antes de validar, só para escolher a língua
 * das mensagens. Não é confiança: nada é aceito por causa disso — o país
 * volta a ser validado pelo schema e de novo por `validarEndereco`. Um
 * payload adulterado no máximo recebe a recusa na língua errada.
 */
function idiomaDoPayload(input: unknown): Idioma {
  if (typeof input !== "object" || input === null || !("pais" in input)) return "pt";
  const bruto = (input as { pais: unknown }).pais;
  return idiomaDoPais(typeof bruto === "string" ? bruto : "BR");
}

function gerarNumeroPedido(): string {
  return `REV-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export async function criarPedidoInternacionalAction(
  input: unknown
): Promise<CheckoutResult> {
  const idioma = idiomaDoPayload(input);
  const t = textos(idioma);
  const parsed = schemaDoIdioma(idioma).safeParse(input);
  if (!parsed.success) {
    const camposComErro: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0];
      if (typeof campo === "string" && !camposComErro[campo]) {
        camposComErro[campo] = issue.message;
      }
    }
    return { erro: t.erroConfiraCampos, camposComErro };
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
    return { erro: t.erroConfiraCampos, camposComErro };
  }
  if (endereco.endereco.pais === "BR") {
    return { erro: t.erroEnderecoBrasileiro };
  }
  const linha = paraLinha(endereco.endereco);

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
    return { erro: t.sacolaVazia };
  }

  let cambio;
  try {
    cambio = await obterCotacaoPtax(mercado.moeda);
  } catch (erro) {
    console.error("[checkout-intl] falha ao obter PTAX", erro);
    return { erro: "Não foi possível calcular o câmbio agora. Tente novamente em instantes." };
  }

  // A linha ativa em variant_prices funciona como autorização de exportação;
  // o preço vem do BRL atual do carrinho convertido pela PTAX de venda.
  const precos = await precosDoCarrinhoNoMercado(
    carrinho.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, basePriceCents: i.basePriceCents })),
    mercado.moeda,
    cambio
  );
  if (!precos.ok) {
    return {
      erro:
        t.semPrecoNoMercado,
    };
  }

  const quantidadeTotal = carrinho.items.reduce((soma, item) => soma + item.quantity, 0);
  // Cada prótese ocupa a embalagem operacional de 20×19×9 cm e 1 kg
  // tarifável. Para várias unidades, empilhamos a altura e somamos o peso;
  // acima de 10 volumes o checkout para, pois exige embalagem manual.
  if (quantidadeTotal < 1 || quantidadeTotal > 10) {
    return { erro: "Este carrinho precisa de uma cotação DHL feita pela nossa equipe." };
  }

  let cotacaoDhl: Awaited<ReturnType<typeof cotarDhlOperacional>>;
  try {
    cotacaoDhl = await cotarDhlOperacional({
      country: endereco.endereco.pais,
      postalCode: linha.postal_code,
      cityName: endereco.endereco.cidade,
      provinceCode: linha.region,
      addressLine1: linha.line1,
      currency: mercado.moeda,
      declaredValueCents: precos.subtotalCents,
      // Embalagem operacional já usada pela Reverá para uma prótese.
      weightGrams: 1000 * quantidadeTotal,
      lengthCm: 20,
      widthCm: 19,
      heightCm: 9 * quantidadeTotal,
    });
  } catch (erro) {
    console.error("[checkout-intl] falha ao cotar DHL", erro);
    return { erro: "A DHL não conseguiu calcular o frete para este endereço agora. Confira os dados ou tente novamente." };
  }
  const escolher = (quotes: DhlQuote[]) =>
    quotes.find((q) => q.productCode === "8" && q.currency === mercado.moeda) ??
    quotes.find((q) => q.productCode === "P" && q.currency === mercado.moeda);
  const frete = escolher(cotacaoDhl.quotes);
  if (!frete || frete.priceCents <= 0) {
    return { erro: "A DHL não retornou um serviço de envio compatível para este endereço." };
  }
  if (cotacaoDhl.ambiente !== "producao") {
    console.error("[checkout-intl] cotação recusada fora da produção DHL");
    return { erro: "O frete internacional está temporariamente indisponível para pagamento." };
  }

  // Trava do duplo clique — idêntica ao nacional, mesma função.
  if (!(await reivindicarCarrinhoParaPedido(carrinho.cartId))) {
    return {
      erro:
        t.erroPedidoEmAndamento,
    };
  }

  const admin = createAdminClient();
  let pedidoPersistido = false;
  const quoteId = randomUUID();
  const customerId = randomUUID();

  async function falhar(mensagem: string): Promise<CheckoutResult> {
    // Depois que o pedido existe, reabrir o carrinho permitiria criar um
    // segundo pedido pagável para a mesma compra. Mantemos a trava e o
    // pedido fica fail-closed para reconciliação operacional.
    if (!pedidoPersistido) {
      // IDs são gerados antes das inserções: apagar por eles é seguro tanto
      // quando a linha existe quanto quando a inserção falhou antes de criar.
      const [{ error: erroQuote }, { error: erroCustomer }] = await Promise.all([
        admin.from("shipping_quotes").delete().eq("id", quoteId),
        admin.from("customers").delete().eq("id", customerId),
      ]);
      if (!erroQuote && !erroCustomer) {
        await devolverCarrinhoParaAberto(carrinho.cartId as string);
      } else {
        console.error("[checkout-intl] limpeza pré-pedido incompleta; carrinho mantido travado", {
          quote: erroQuote?.code,
          customer: erroCustomer?.code,
        });
      }
    }
    return { erro: mensagem };
  }

  const reciboDhl = {
    source: "mydhl-production",
    environment: cotacaoDhl.ambiente,
    country: endereco.endereco.pais,
    currency: mercado.moeda,
    product_code: frete.productCode,
    delivery_date: frete.deliveryDate,
    quoted_at: new Date().toISOString(),
    exchange_rate: cambio.reaisPorUnidade,
    exchange_rate_source: cambio.fonte,
    exchange_rate_date: cambio.data,
    package: { quantity: quantidadeTotal, weight_grams: 1000 * quantidadeTotal, length_cm: 20, width_cm: 19, height_cm: 9 * quantidadeTotal },
  };
  const { error: erroCotacaoInicial } = await admin.from("shipping_quotes").insert({
    id: quoteId,
    order_id: null,
    cart_id: carrinho.cartId,
    service_name: frete.productName,
    carrier: "DHL",
    price_cents: frete.priceCents,
    eta_days: frete.etaDays,
    raw_response: reciboDhl,
  });
  if (erroCotacaoInicial) {
    console.error("[checkout-intl] falha ao gravar cotação DHL", erroCotacaoInicial);
    return falhar("Não foi possível confirmar a cotação DHL. Tente novamente.");
  }

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
    return falhar(t.erroRegistrarDados);
  }

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
    return falhar(t.erroRegistrarEndereco);
  }

  const subtotalCents = precos.subtotalCents;
  const shippingCents = frete.priceCents;
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

  async function desfazerPedidoParcial(mensagem: string): Promise<CheckoutResult> {
    // Compensação explícita: order_items e quote ligada caem por cascade;
    // customer remove o endereço. Só reabrimos o carrinho se TODA a
    // compensação confirmou sucesso, evitando pedido duplicado.
    const { error: erroOrder } = await admin.from("orders").delete().eq("id", orderId);
    const [{ error: erroQuote }, { error: erroCustomer }] = erroOrder
      ? [{ error: null }, { error: null }]
      : await Promise.all([
          admin.from("shipping_quotes").delete().eq("id", quoteId),
          admin.from("customers").delete().eq("id", customerId),
        ]);
    if (!erroOrder && !erroQuote && !erroCustomer) {
      pedidoPersistido = false;
      await devolverCarrinhoParaAberto(carrinho.cartId as string);
    } else {
      console.error("[checkout-intl] compensação incompleta; carrinho mantido travado", {
        orderId,
        order: erroOrder?.code,
        quote: erroQuote?.code,
        customer: erroCustomer?.code,
      });
    }
    return { erro: mensagem };
  }

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
      tracking_consent: dados.trackingConsent,
      export_status: "pending_data",
      // O aceite: versão + instante do SERVIDOR. O navegador só disse
      // "true"; quem data é a gente.
      terms_version: ACEITE_INTERNACIONAL_VERSAO,
      terms_accepted_at: new Date().toISOString(),
      intl_shipping_quote_id: null,
      exchange_rate: cambio.reaisPorUnidade,
      exchange_rate_source: cambio.fonte,
      exchange_rate_date: cambio.data,
      ...atribuicao,
    });

    if (!error) {
      pedidoCriado = true;
      pedidoPersistido = true;
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
    return desfazerPedidoParcial("Não foi possível registrar os itens do pedido. Tente novamente.");
  }

  const { error: erroCotacao } = await admin.from("shipping_quotes")
    .update({ order_id: orderId }).eq("id", quoteId).is("order_id", null)
    .select("id").single();
  if (erroCotacao) {
    console.error("[checkout-intl] falha ao gravar recibo DHL", erroCotacao);
    return desfazerPedidoParcial("Não foi possível confirmar a cotação DHL. Tente novamente.");
  }

  const avisoEmail = await avisarPedidoPendentePorEmail({
    orderId,
    orderNumber,
    cliente: dados.name,
    totalCents,
    moeda: mercado.moeda,
    origem: "checkout internacional",
    cidade: dados.cidade,
    pais: endereco.endereco.pais,
  });
  if (avisoEmail.estado === "erro") {
    console.error("[checkout-intl-email] falha ao avisar pedido pendente", {
      orderId,
      motivo: avisoEmail.motivo,
    });
  }

  await limparTokenDoCookie();

  redirect(`/checkout/pagamento?pedido=${accessToken}`);
}
