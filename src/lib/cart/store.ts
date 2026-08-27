import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { applyQuantityDiscount, type QuantityDiscountRule } from "@/lib/pricing/discount";
import { gravarTokenNoCookie, lerTokenDoCookie, tokenTemFormatoValido } from "./token";
import type { CartDiscountRuleView, CartItemView, CartView } from "./types";

/**
 * Acesso ao carrinho — DECISÃO DE RLS (26/08/2026), documentada aqui e em
 * supabase/migrations/00000000000003_cart_policies.sql.
 *
 * O carrinho é anônimo e identificado por um token opaco num cookie
 * httpOnly (ver token.ts) — não por uma sessão do Supabase Auth. RLS do
 * PostgREST decide o que uma requisição pode ver/gravar olhando para
 * `auth.uid()`/`request.jwt.claims`, e a chave anon deste projeto é a MESMA
 * para qualquer visitante (não existe login de cliente aqui). Não há
 * nenhum jeito de uma policy `using (token = <valor do cookie>)` enxergar
 * o cookie: o cookie não viaja dentro do JWT da chave anon, só no header
 * Cookie da requisição HTTP — e RLS só vê o que está no JWT ou nas colunas
 * da própria tabela.
 *
 * A alternativa seria ligar o Supabase Anonymous Auth e redesenhar `carts`
 * para guardar o dono como auth.uid() — mudança de arquitetura fora deste
 * escopo fechado (e que exigiria um projeto Supabase real para configurar
 * e testar, o que este ambiente não tem).
 *
 * Por isso este arquivo usa createAdminClient() (service role, ignora RLS)
 * e faz a verificação de posse NA APLICAÇÃO, não no banco: toda operação
 * de escrita/leitura de um item específico primeiro confirma que o
 * cart_id pertence ao carrinho cujo token está no cookie httpOnly de QUEM
 * ESTÁ FAZENDO A REQUISIÇÃO (nunca um cart_id ou token mandado pelo
 * cliente no corpo da chamada). Isto é o mesmo padrão que
 * src/app/cores/actions.ts já usa para color_help_requests (RLS ligada,
 * sem policy pública, grava com o client de service role) — não é
 * invenção nova deste arquivo.
 *
 * O admin client SÓ é usado aqui dentro (carrinho) e em
 * src/app/checkout/actions.ts (criação de pedido, pelo mesmo motivo, mais
 * o fato de orders/order_items serem registro financeiro — ver comentário
 * lá). Nenhum outro código de vitrine pública usa createAdminClient().
 */

function admin() {
  return createAdminClient();
}

async function buscarCartIdPorToken(token: string): Promise<string | null> {
  const { data } = await admin()
    .from("carts")
    .select("id")
    .eq("token", token)
    .eq("status", "open")
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Lê o carrinho ATUAL sem criar nenhum — usado por qualquer leitura (a
 * página /carrinho, o contador do Header) que não deve gerar uma linha
 * nova em `carts` só porque alguém visitou o site. */
export async function obterCarrinhoIdAtual(): Promise<string | null> {
  const token = await lerTokenDoCookie();
  if (!tokenTemFormatoValido(token)) return null;
  return buscarCartIdPorToken(token);
}

/** Lê o carrinho atual e, se não existir, cria um novo e grava o token no
 * cookie — só chamado pelo caminho de "adicionar item" (nunca por uma
 * leitura), para não nascer um `carts` órfão a cada visita. */
export async function obterOuCriarCarrinhoId(): Promise<string> {
  const existente = await obterCarrinhoIdAtual();
  if (existente) return existente;

  const { data, error } = await admin().from("carts").insert({}).select("id, token").single();
  if (error || !data) {
    throw new Error(`Não foi possível criar o carrinho: ${error?.message ?? "erro desconhecido"}`);
  }

  await gravarTokenNoCookie(data.token as string);
  return data.id as string;
}

export async function adicionarItemAoCarrinho(
  variantId: string,
  quantidadeAdicional: number
): Promise<{ erro: string | null }> {
  if (!Number.isInteger(quantidadeAdicional) || quantidadeAdicional <= 0) {
    return { erro: "Quantidade inválida." };
  }

  const { data: variante } = await admin()
    .from("product_variants")
    .select("id, is_active, stock_qty, price_cents")
    .eq("id", variantId)
    .maybeSingle();

  if (!variante || !variante.is_active) {
    return { erro: "Esta variante não está disponível para compra." };
  }

  /**
   * Preço zero não entra no carrinho (P0-1, 27/08/2026).
   *
   * `price_cents` é NOT NULL no banco, então "sem preço definido" não vira
   * null — vira ZERO. E zero atravessa o sistema inteiro sem reclamação:
   * o subtotal soma 0, o pedido nasce com total 0, o gateway cobra nada.
   * Na auditoria de 26/08 a variante da Micropele estava exatamente assim,
   * e só `is_active: false` separava a loja de entregar a peça de graça.
   *
   * A guarda fica AQUI, e não só na vitrine, porque este é o ponto onde o
   * preço vira intenção de compra — e é o único por onde todo item passa,
   * venha da página do produto, do drawer ou de uma chamada direta.
   */
  if (!Number.isFinite(variante.price_cents as number) || (variante.price_cents as number) <= 0) {
    console.error(
      "[carrinho] variante ativa com preço inválido — recusando",
      variantId,
      variante.price_cents
    );
    return { erro: "Esta variante está sem preço definido e não pode ser comprada." };
  }

  const cartId = await obterOuCriarCarrinhoId();

  const { data: itemExistente } = await admin()
    .from("cart_items")
    .select("id, quantity")
    .eq("cart_id", cartId)
    .eq("variant_id", variantId)
    .maybeSingle();

  const quantidadeJaNoCarrinho = (itemExistente?.quantity as number | undefined) ?? 0;
  const quantidadeTotalDesejada = quantidadeJaNoCarrinho + quantidadeAdicional;
  const estoque = variante.stock_qty as number;

  if (quantidadeTotalDesejada > estoque) {
    const disponivel = Math.max(estoque - quantidadeJaNoCarrinho, 0);
    return {
      erro:
        disponivel > 0
          ? `Só há ${disponivel} unidade(s) em estoque além do que já está na sua sacola.`
          : "Sem estoque disponível para esta variante.",
    };
  }

  if (itemExistente) {
    const { error } = await admin()
      .from("cart_items")
      .update({ quantity: quantidadeTotalDesejada, updated_at: new Date().toISOString() })
      .eq("id", itemExistente.id);
    if (error) return { erro: "Não foi possível atualizar sua sacola agora. Tente de novo." };
  } else {
    const { error } = await admin()
      .from("cart_items")
      .insert({ cart_id: cartId, variant_id: variantId, quantity: quantidadeTotalDesejada });
    if (error) return { erro: "Não foi possível adicionar à sacola agora. Tente de novo." };
  }

  return { erro: null };
}

export async function alterarQuantidadeDoItem(
  cartItemId: string,
  quantidade: number
): Promise<{ erro: string | null }> {
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { erro: "Quantidade inválida." };
  }

  const cartId = await obterCarrinhoIdAtual();
  if (!cartId) return { erro: "Não encontramos sua sacola. Atualize a página." };

  // Confirma que o item É deste carrinho antes de tocar nele — é aqui,
  // não no Postgres, que a posse é verificada (ver comentário no topo do
  // arquivo).
  const { data: item } = await admin()
    .from("cart_items")
    .select("id, variant_id")
    .eq("id", cartItemId)
    .eq("cart_id", cartId)
    .maybeSingle();
  if (!item) return { erro: "Este item não pertence à sua sacola." };

  const { data: variante } = await admin()
    .from("product_variants")
    .select("stock_qty")
    .eq("id", item.variant_id)
    .maybeSingle();
  const estoque = (variante?.stock_qty as number | undefined) ?? 0;

  if (quantidade > estoque) {
    return { erro: `Só há ${estoque} unidade(s) em estoque para este item.` };
  }

  const { error } = await admin()
    .from("cart_items")
    .update({ quantity: quantidade, updated_at: new Date().toISOString() })
    .eq("id", cartItemId);
  if (error) return { erro: "Não foi possível atualizar a quantidade. Tente de novo." };

  return { erro: null };
}

export async function removerItemDoCarrinho(cartItemId: string): Promise<{ erro: string | null }> {
  const cartId = await obterCarrinhoIdAtual();
  if (!cartId) return { erro: "Não encontramos sua sacola. Atualize a página." };

  const { error } = await admin()
    .from("cart_items")
    .delete()
    .eq("id", cartItemId)
    .eq("cart_id", cartId);
  if (error) return { erro: "Não foi possível remover este item. Tente de novo." };

  return { erro: null };
}

// Junta cor + tamanho + nível de grisalho + comprimento num rótulo curto,
// pulando o que não existir. Genérica de propósito: hoje só existe a
// variante única do seed (tudo null, ver seeds/products.json), mas o
// carrinho precisa funcionar também quando existir combinação real.
function montarLabelVariante(params: {
  colorName?: string | null;
  sizeLabel?: string | null;
  grayLevelLabel?: string | null;
  lengthCm?: number | null;
}): string | null {
  const partes = [
    params.colorName ?? null,
    params.sizeLabel ?? null,
    params.grayLevelLabel ?? null,
    params.lengthCm != null ? `${params.lengthCm}cm` : null,
  ].filter((parte): parte is string => Boolean(parte));

  return partes.length > 0 ? partes.join(" · ") : null;
}

async function buscarRegrasVigentesPorProduto(
  productIds: string[]
): Promise<Map<string, CartDiscountRuleView[]>> {
  const mapa = new Map<string, CartDiscountRuleView[]>();
  if (productIds.length === 0) return mapa;

  const { data: regras } = await admin()
    .from("quantity_discount_rules")
    .select("product_id, min_qty, unit_price_cents, discount_percent, label, starts_at, ends_at, is_active")
    .in("product_id", productIds);

  const agora = new Date();
  for (const r of regras ?? []) {
    if (!r.is_active) continue;
    if (r.starts_at && new Date(r.starts_at as string) > agora) continue;
    if (r.ends_at && new Date(r.ends_at as string) < agora) continue;

    const productId = r.product_id as string;
    const lista = mapa.get(productId) ?? [];
    lista.push({
      minQty: r.min_qty as number,
      unitPriceCents: (r.unit_price_cents as number | null) ?? null,
      discountPercent: (r.discount_percent as number | null) ?? null,
      label: (r.label as string | null) ?? null,
      isActive: true,
    });
    mapa.set(productId, lista);
  }

  return mapa;
}

/**
 * Lê o carrinho inteiro com preço recalculado NA HORA a partir do banco —
 * nunca reaproveita um preço que possa ter ficado guardado em algum lugar.
 * É a única fonte de verdade de "quanto este carrinho custa hoje", usada
 * tanto pela UI (drawer, /carrinho) quanto pela criação do pedido
 * (src/app/checkout/actions.ts): o pedido nasce com o snapshot que ESTA
 * função devolveu no momento do envio, não com nada que o navegador mandou.
 */
export async function lerCarrinhoCompleto(): Promise<CartView> {
  const cartId = await obterCarrinhoIdAtual();
  if (!cartId) {
    return { cartId: null, items: [], subtotalSemDescontoCents: 0, subtotalCents: 0, discountCents: 0, totalCents: 0 };
  }

  const { data: linhas } = await admin()
    .from("cart_items")
    .select("id, variant_id, quantity")
    .eq("cart_id", cartId)
    .order("created_at");

  const itensBrutos = linhas ?? [];
  if (itensBrutos.length === 0) {
    return { cartId, items: [], subtotalSemDescontoCents: 0, subtotalCents: 0, discountCents: 0, totalCents: 0 };
  }

  const variantIds = itensBrutos.map((l) => l.variant_id as string);
  const { data: variantes } = await admin()
    .from("product_variants")
    .select("id, product_id, color_id, size_id, gray_level_id, length_cm, price_cents, compare_at_price_cents, stock_qty")
    .in("id", variantIds);

  const variantesPorId = new Map((variantes ?? []).map((v) => [v.id as string, v]));

  const productIds = Array.from(new Set(Array.from(variantesPorId.values()).map((v) => v.product_id as string)));
  const colorIds = Array.from(
    new Set(Array.from(variantesPorId.values()).map((v) => v.color_id as string | null).filter((id): id is string => Boolean(id)))
  );
  const sizeIds = Array.from(
    new Set(Array.from(variantesPorId.values()).map((v) => v.size_id as string | null).filter((id): id is string => Boolean(id)))
  );
  const grayLevelIds = Array.from(
    new Set(Array.from(variantesPorId.values()).map((v) => v.gray_level_id as string | null).filter((id): id is string => Boolean(id)))
  );

  const [{ data: produtos }, { data: cores }, { data: tamanhos }, { data: niveisGrisalho }, regrasPorProduto] =
    await Promise.all([
      productIds.length > 0 ? admin().from("products").select("id, name").in("id", productIds) : Promise.resolve({ data: [] }),
      colorIds.length > 0 ? admin().from("colors").select("id, name, photo_url").in("id", colorIds) : Promise.resolve({ data: [] }),
      sizeIds.length > 0 ? admin().from("sizes").select("id, label").in("id", sizeIds) : Promise.resolve({ data: [] }),
      grayLevelIds.length > 0
        ? admin().from("gray_levels").select("id, label").in("id", grayLevelIds)
        : Promise.resolve({ data: [] }),
      buscarRegrasVigentesPorProduto(productIds),
    ]);

  const produtosPorId = new Map((produtos ?? []).map((p) => [p.id as string, p.name as string]));
  const coresPorId = new Map((cores ?? []).map((c) => [c.id as string, c]));
  const tamanhosPorId = new Map((tamanhos ?? []).map((s) => [s.id as string, s.label as string]));
  const niveisPorId = new Map((niveisGrisalho ?? []).map((g) => [g.id as string, g.label as string]));

  const items: CartItemView[] = itensBrutos.flatMap((linha): CartItemView[] => {
    const variante = variantesPorId.get(linha.variant_id as string);
    // Variante removida do catálogo depois de estar no carrinho — descarta
    // a linha da leitura em vez de quebrar a página; ela continua existindo
    // em cart_items até alguém remover explicitamente ou o carrinho
    // converter (não é objetivo desta entrega fazer limpeza automática).
    if (!variante) return [];

    const cor = variante.color_id ? coresPorId.get(variante.color_id as string) : null;
    const quantidade = linha.quantity as number;
    const precoBase = variante.price_cents as number;
    const regrasDoProduto = regrasPorProduto.get(variante.product_id as string) ?? [];
    const resultado = applyQuantityDiscount(precoBase, quantidade, regrasDoProduto as QuantityDiscountRule[]);

    return [
      {
        cartItemId: linha.id as string,
        variantId: variante.id as string,
        productName: produtosPorId.get(variante.product_id as string) ?? "Produto",
        variantLabel: montarLabelVariante({
          colorName: (cor?.name as string | undefined) ?? null,
          sizeLabel: variante.size_id ? tamanhosPorId.get(variante.size_id as string) ?? null : null,
          grayLevelLabel: variante.gray_level_id ? niveisPorId.get(variante.gray_level_id as string) ?? null : null,
          lengthCm: (variante.length_cm as number | null) ?? null,
        }),
        colorPhotoUrl: (cor?.photo_url as string | null | undefined) ?? null,
        quantity: quantidade,
        stockQty: variante.stock_qty as number,
        basePriceCents: precoBase,
        compareAtPriceCents: (variante.compare_at_price_cents as number | null) ?? null,
        unitPriceCents: resultado.unitPriceCents,
        subtotalCents: resultado.subtotalCents,
        discountCents: resultado.discountCents,
        discountRules: regrasPorProduto.get(variante.product_id as string) ?? [],
      },
    ];
  });

  const subtotalSemDescontoCents = items.reduce((acc, i) => acc + i.basePriceCents * i.quantity, 0);
  const discountCents = items.reduce((acc, i) => acc + i.discountCents, 0);
  const subtotalCents = items.reduce((acc, i) => acc + i.subtotalCents, 0);

  return {
    cartId,
    items,
    subtotalSemDescontoCents,
    subtotalCents,
    discountCents,
    // Frete entra na etapa seguinte (fora do escopo desta entrega, ver
    // src/lib/shipping) — o total aqui é só o que o carrinho já sabe.
    totalCents: subtotalCents,
  };
}

/**
 * Reivindica o carrinho para virar pedido — a trava contra o duplo clique.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE (P1, 27/08/2026)
 * ===========================================================================
 * `criarPedidoAction` convertia o carrinho no FIM, depois de gravar cliente,
 * endereço, pedido e itens. Entre ler o carrinho e convertê-lo havia uma
 * janela — e é dentro dela que o segundo clique entra.
 *
 * Reproduzido em 27/08/2026 contra o banco real: dois envios simultâneos do
 * mesmo carrinho criaram DOIS pedidos, dois clientes e dois endereços. Não
 * cobra duas vezes (cada pedido tem sua própria cobrança), mas suja o painel
 * da dona, e dois pedidos pagos do mesmo carrinho viram duas etiquetas —
 * cada uma debitando a carteira da SuperFrete.
 *
 * A trava é a MESMA de `confirmarPagamento` e de `gerarEtiquetaAction`:
 * um update condicional que só acerta quem ainda estava no estado esperado.
 * Quem encontra zero linhas entende que perdeu a corrida. Quem decide é o
 * Postgres, num comando atômico — não um `if` no meio de duas consultas,
 * que teria exatamente a mesma janela que estamos fechando.
 *
 * Fica ANTES de qualquer gravação de propósito: o perdedor da corrida não
 * pode deixar cliente nem endereço órfãos para trás.
 */
export async function reivindicarCarrinhoParaPedido(cartId: string): Promise<boolean> {
  const { data } = await admin()
    .from("carts")
    .update({ status: "converted", updated_at: new Date().toISOString() })
    .eq("id", cartId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  return Boolean(data);
}

/**
 * Devolve o carrinho para 'open' quando a criação do pedido falhou depois da
 * reivindicação.
 *
 * Sem isto, um erro no meio do caminho deixaria a pessoa com a sacola
 * "convertida" e nenhum pedido: ela veria o carrinho vazio, sem pedido
 * nenhum, e sem entender o que aconteceu com as peças que escolheu. Mesmo
 * raciocínio do `devolverStatus()` em src/app/admin/(protected)/pedidos/etiqueta.ts.
 */
export async function devolverCarrinhoParaAberto(cartId: string): Promise<void> {
  await admin()
    .from("carts")
    .update({ status: "open", updated_at: new Date().toISOString() })
    .eq("id", cartId)
    .eq("status", "converted");
}
