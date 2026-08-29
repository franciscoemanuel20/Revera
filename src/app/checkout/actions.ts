"use server";

/**
 * Criação do pedido — recebe o formulário de endereço/dados pessoais,
 * valida com zod (schema.ts) e grava customers + addresses + orders +
 * order_items numa única Server Action. PARA AQUI: depois de criar o
 * pedido com status='new', redireciona para /checkout/pagamento — quem
 * implementa o pagamento de verdade é outra pessoa, em paralelo (este
 * arquivo não importa nada de src/lib/payments nem de src/app/api/webhooks).
 *
 * DECISÃO DE CLIENT (mesma família de decisão do carrinho — ver
 * src/lib/cart/store.ts e supabase/migrations/00000000000003_cart_policies.sql):
 * usa createAdminClient() (service role), não createClient() (sessão/RLS).
 *
 * Por quê: customers, addresses, orders e order_items têm RLS ligada e
 * NENHUMA policy pública de insert (herdado de
 * supabase/migrations/00000000000001_init.sql — "Tudo mais: sem policy
 * pública = só service role acessa"; esta entrega não altera aquele
 * arquivo). Dá para imaginar uma policy pública `for insert with check
 * (true)` nessas tabelas — tecnicamente resolveria o RLS sem precisar do
 * admin client — mas a chave anon é PÚBLICA (fica no bundle do navegador,
 * ver .env.example / NEXT_PUBLIC_SUPABASE_ANON_KEY): com essa policy,
 * qualquer pessoa poderia abrir o console do navegador e inserir um
 * `orders` com total_cents arbitrário direto, pulando por completo o
 * recálculo de preço a partir de product_variants que este arquivo faz.
 * orders é registro financeiro — não é o mesmo risco de carts (que o
 * checkout sempre recalcula do zero, ignorando qualquer preço que já
 * estivesse lá). Por isso aqui a garantia não pode depender de uma policy
 * pública nem de boa vontade de quem chama: só passa por aqui quem chamou
 * ESTA Server Action, que valida CPF/CEP/etc. com zod e nunca confia em
 * preço vindo do cliente (lê de lerCarrinhoCompleto(), que já recalculou
 * a partir do banco).
 *
 * Este NÃO é padrão novo: src/app/cores/actions.ts já faz exatamente isso
 * para color_help_requests, outra tabela sem policy pública.
 *
 * IDs GERADOS AQUI (randomUUID()), não pelo default do banco: assim a
 * gravação nunca precisa de um `.select()` de volta para descobrir o id
 * gerado — e um `.select()` depois de insert, sob RLS, é filtrado pela
 * policy de SELECT (que não existe aqui). Sem isso, este arquivo teria
 * que escolher entre "não sei o id que acabei de criar" ou "abrir uma
 * policy de SELECT pública", que vazaria pedido/cliente de qualquer um
 * para qualquer um. Gerando o id antes do insert, essa escolha nem precisa
 * existir.
 */
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  devolverCarrinhoParaAberto,
  lerCarrinhoCompleto,
  reivindicarCarrinhoParaPedido,
} from "@/lib/cart/store";
import { limparTokenDoCookie } from "@/lib/cart/token";
import { createAdminClient } from "@/lib/supabase/server";
import { cotarFrete } from "@/lib/shipping/cotar";
import { checkoutSchema } from "./schema";

export interface CheckoutResult {
  erro: string;
  camposComErro?: Record<string, string>;
}

// order_number legível e curto, mas NÃO sequencial nem previsível: 8
// caracteres hex de um uuid v4 carregam a mesma entropia do uuid inteiro
// (mesma fonte aleatória), só que curtos o bastante para o cliente falar
// por telefone. Um "REV-000042" revelaria quantos pedidos a loja já teve
// — isto aqui não revela nada.
function gerarNumeroPedido(): string {
  return `REV-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export async function criarPedidoAction(input: unknown): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
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

  // Preço sempre recalculado do banco NA HORA do envio — nunca o que o
  // navegador mandou (nem existe campo de preço no formulário de
  // checkout). Ver src/lib/cart/store.ts.
  const carrinho = await lerCarrinhoCompleto();
  if (!carrinho.cartId || carrinho.items.length === 0) {
    return { erro: "Sua sacola está vazia — volte e adicione algo antes de finalizar." };
  }

  /**
   * A TRAVA DO DUPLO CLIQUE (P1, 27/08/2026) — antes de gravar qualquer coisa.
   *
   * Reivindica o carrinho num update atômico. Só um envio passa daqui; o
   * segundo encontra zero linhas e para, sem ter criado cliente, endereço ou
   * pedido. Ver reivindicarCarrinhoParaPedido() em src/lib/cart/store.ts para
   * o porquê de a decisão ser do Postgres e não de um `if`.
   */
  if (!(await reivindicarCarrinhoParaPedido(carrinho.cartId))) {
    return {
      erro:
        "Este pedido já está sendo finalizado. Aguarde um instante — se a tela " +
        "não avançar sozinha, confira seu e-mail antes de tentar de novo.",
    };
  }

  const admin = createAdminClient();

  /**
   * A partir daqui o carrinho está reivindicado. Toda saída por erro precisa
   * devolvê-lo para 'open', senão a pessoa fica sem sacola E sem pedido.
   */
  async function falhar(mensagem: string): Promise<CheckoutResult> {
    await devolverCarrinhoParaAberto(carrinho.cartId as string);
    return { erro: mensagem };
  }

  const customerId = randomUUID();
  const { error: erroCustomer } = await admin.from("customers").insert({
    id: customerId,
    full_name: dados.name,
    email: dados.email,
    phone: dados.phone,
    cpf: dados.cpf,
  });
  if (erroCustomer) {
    return falhar("Não foi possível registrar seus dados. Tente novamente.");
  }

  const addressId = randomUUID();
  const { error: erroAddress } = await admin.from("addresses").insert({
    id: addressId,
    customer_id: customerId,
    recipient_name: dados.name,
    // Explícito, não pelo default da coluna: o pedido carrega de onde ele é,
    // e depender do default esconderia a informação de quem lê o insert.
    country: dados.country,
    cep: dados.cep,
    street: dados.street,
    number: dados.number,
    complement: dados.complement,
    neighborhood: dados.neighborhood,
    city: dados.city,
    state: dados.state,
  });
  if (erroAddress) {
    return falhar("Não foi possível registrar o endereço. Tente novamente.");
  }

  const subtotalCents = carrinho.subtotalSemDescontoCents;
  const discountCents = carrinho.discountCents;

  /**
   * FRETE — cotado AQUI, no servidor, com o CEP que acabou de ser validado.
   *
   * Este é o único momento em que o frete pode ser calculado com honestidade:
   * o endereço existe, o carrinho existe, e o preço ainda não foi congelado.
   * Depois disto o valor vira `shipping_cents` no pedido e não muda mais —
   * nem na hora de despachar. Recotar no despacho daria outro número, e a
   * diferença sairia do bolso de alguém sem ninguém ter combinado.
   *
   * O valor declarado é o subtotal ANTES do desconto: é quanto a peça vale
   * para repor, que é o que o seguro precisa cobrir. Um desconto promocional
   * não torna a prótese mais barata de fabricar.
   *
   * ===========================================================================
   * FAIL-CLOSED NO FRETE (29/08/2026) — o que mudou e por quê
   * ===========================================================================
   * Antes, se a cotação falhasse, a venda acontecia com `shipping_cents = 0`
   * e o motivo ficava só no registro. O raciocínio era: melhor absorver
   * ~R$ 25 do que perder uma venda de R$ 1.600.
   *
   * A auditoria de 29/08/2026 mostrou o buraco desse raciocínio. Não era
   * "de vez em quando a API pisca": TODO pedido de 5 peças ou mais caía
   * nesse caminho, porque R$ 3.100 declarados passam do teto de seguro de
   * R$ 3.000 — e 5 peças é exatamente o que a loja anuncia como vantagem. A
   * exceção rara era, na prática, a regra nos pedidos mais caros, e o frete
   * saía do bolso da operação sem ninguém combinar.
   *
   * Agora são duas mudanças, nesta ordem:
   *   1. a causa foi corrigida — pedido grande vai em mais de uma caixa
   *      (dividirEmRemessas), então existe cotação onde antes não existia;
   *   2. o que sobrar de falha é EXPLÍCITO: o pedido não é criado, o cliente
   *      vê que o frete não pôde ser calculado, e nada é cobrado. Frete
   *      inválido não vira mais "a gente combina depois".
   */
  const quantidadeTotal = carrinho.items.reduce((soma, i) => soma + i.quantity, 0);
  const cotacao = await cotarFrete({
    cepDestino: dados.cep,
    valorDeclaradoCents: subtotalCents,
    quantidade: quantidadeTotal,
  });

  if (!cotacao.escolhida) {
    // Registro antes de recusar: sem isto, "por que ninguém consegue fechar
    // pedido para o Acre?" não teria como ser respondido depois.
    console.error("[frete] shipping_quote_failed", {
      cep: dados.cep,
      quantidade: quantidadeTotal,
      valor_declarado_cents: subtotalCents,
      motivo: cotacao.indisponivel ?? "nenhuma transportadora cobre o valor declarado",
      opcoes: cotacao.opcoes.map((o) => ({
        servico: o.serviceName,
        preco: o.priceCents,
        cobre_seguro: o.coversInsurance,
        erro: o.error ?? null,
      })),
    });
    return falhar(
      "Não conseguimos calcular o frete para este CEP agora, e não vamos " +
        "fechar o pedido com um valor que não é o real. Tente de novo em " +
        "alguns minutos — nada foi cobrado."
    );
  }

  const shippingCents = cotacao.escolhida.priceCents;
  const totalCents = subtotalCents - discountCents + shippingCents;

  const orderId = randomUUID();
  const accessToken = randomUUID();

  /**
   * ATRIBUIÇÃO — de onde veio quem está comprando.
   *
   * Repare na divisão: cookies e UTMs vêm do NAVEGADOR (é lá que existem);
   * IP e user-agent vêm dos CABEÇALHOS, no servidor. Nunca o contrário.
   * IP informado pelo corpo da requisição não é IP, é opinião — e a Meta usa
   * esse campo para casar o comprador com quem viu o anúncio.
   *
   * `x-forwarded-for` pode trazer uma cadeia ("cliente, proxy1, proxy2"); o
   * primeiro é o cliente real. Na Vercel o `x-real-ip` já vem resolvido, e é
   * a fonte preferida quando existe.
   */
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

  let orderNumber = gerarNumeroPedido();
  let pedidoCriado = false;
  for (let tentativa = 0; tentativa < 3 && !pedidoCriado; tentativa += 1) {
    const { error } = await admin.from("orders").insert({
      id: orderId,
      order_number: orderNumber,
      access_token: accessToken,
      customer_id: customerId,
      address_id: addressId,
      // Moeda da COBRANÇA. Hoje sempre BRL, porque o checkout só aceita
      // Brasil — mas gravada no pedido em vez de presumida na leitura, para
      // o dia em que houver mais de uma.
      currency: "BRL",
      // `status` não entra mais: virou coluna gerada (migration
      // 00000000000008) e o Postgres recusa escrita nela. O pedido nasce
      // pending/not_ready pelos defaults, que é exatamente o antigo 'new'.
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      shipping_cents: shippingCents,
      total_cents: totalCents,
      ...atribuicao,
    });

    if (!error) {
      pedidoCriado = true;
    } else if (error.code === "23505") {
      // Colisão de order_number (extremamente improvável com 8 hex de
      // entropia) — gera outro e tenta de novo, em vez de falhar o pedido
      // inteiro por causa disso.
      orderNumber = gerarNumeroPedido();
    } else {
      return falhar("Não foi possível criar o pedido agora. Tente novamente em instantes.");
    }
  }

  if (!pedidoCriado) {
    return falhar("Não foi possível criar o pedido agora. Tente novamente em instantes.");
  }

  const itensPayload = carrinho.items.map((item) => ({
    id: randomUUID(),
    order_id: orderId,
    variant_id: item.variantId,
    product_name_snapshot: item.productName,
    variant_label_snapshot: item.variantLabel,
    unit_price_cents: item.unitPriceCents,
    quantity: item.quantity,
    subtotal_cents: item.subtotalCents,
  }));

  const { error: erroItens } = await admin.from("order_items").insert(itensPayload);
  if (erroItens) {
    return falhar("Não foi possível registrar os itens do pedido. Tente novamente.");
  }

  /**
   * O RECIBO DA COTAÇÃO.
   *
   * Grava o que a transportadora respondeu no instante em que este pedido foi
   * fechado — inclusive quando ela NÃO respondeu. Serve a três perguntas que
   * aparecem semanas depois e hoje não teriam resposta:
   *
   *   "por que este pedido saiu com frete 0?"       → `indisponivel` no raw
   *   "por que pagamos Loggi e não Jadlog?"          → as opções recusadas
   *   "com qual serviço este cliente pagou?"         → `service_id` no raw
   *
   * A última não é curiosidade: a etiqueta TEM que ser emitida no mesmo
   * serviço que o cliente pagou, e é daqui que o despacho lê isso.
   *
   * Falha de gravação não derruba o pedido — o pedido já existe e já tem
   * total. Perder o recibo é ruim; perder a venda por causa do recibo seria
   * pior.
   */
  const { error: erroCotacao } = await admin.from("shipping_quotes").insert({
    id: randomUUID(),
    order_id: orderId,
    cart_id: carrinho.cartId,
    service_name: cotacao.escolhida?.serviceName ?? null,
    carrier: cotacao.escolhida?.carrier ?? null,
    price_cents: cotacao.escolhida?.priceCents ?? null,
    eta_days: cotacao.escolhida?.etaDays ?? null,
    raw_response: {
      service_id: cotacao.escolhida?.serviceId ?? null,
      indisponivel: cotacao.indisponivel,
      cep_destino: dados.cep,
      quantidade: quantidadeTotal,
      valor_declarado_cents: subtotalCents,
      // Em quantas caixas o pedido vai. Quem despacha precisa saber: duas
      // caixas com uma etiqueta só chegam meia entrega.
      remessas: cotacao.remessas ?? null,
      opcoes: cotacao.opcoes,
    },
  });
  if (erroCotacao) {
    console.error("[checkout] cotação não gravada para", orderNumber, erroCotacao);
  }

  // O carrinho já foi convertido na reivindicação, no topo desta função.
  await limparTokenDoCookie();

  redirect(`/checkout/pagamento?pedido=${accessToken}`);
}
