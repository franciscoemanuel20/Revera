"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { motivoDeImagemInvalida, tipoDeMidiaPelaUrl } from "@/lib/conteudo/midia";

/**
 * Server Actions das FOTOS DO PRODUTO (/admin/produtos/[id]) — 03/09/2026.
 *
 * Até hoje o painel não gravava uma linha de `product_media` sequer: as fotos
 * que existem no site foram criadas por script (scripts/criar-full-lace-e-
 * australia.mjs). A Biblioteca de Fotos já dizia "copie a URL para usar no
 * cadastro de um produto" — e não havia cadastro nenhum onde colar.
 *
 * O que destrancou este arquivo é `variant_id`: é ele que faz a página do
 * produto trocar a foto grande pela peça NAQUELA cor (ver ProdutoInterativo,
 * `fotoDaCor`). Sem uma tela que preencha esse campo, aquele caminho ficava
 * dependendo de SQL na mão.
 *
 * Como todo o resto do admin: `createClient()` (client de SESSÃO, sob RLS),
 * nunca `createAdminClient()`. Quem decide se a gravação pode é a policy
 * "admin manage product_media" da migration 2, não esta função.
 */

const fotoSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  /**
   * A variante que esta foto retrata, ou null para foto genérica do produto.
   * Vem da tela como "a cor da peça" — variante É (produto × cor) neste
   * catálogo. A conferência de que a variante pertence a ESTE produto é feita
   * no servidor, abaixo: um id de variante de outro produto faria a página
   * mostrar a foto de uma peça em cima do nome de outra.
   */
  variantId: z
    .string()
    .uuid()
    .nullable()
    .or(z.literal("").transform(() => null)),
  url: z.string().trim().min(1, "A URL da foto é obrigatória"),
  altText: z.string().trim().max(200).nullable(),
  sortOrder: z.number().int().min(0).max(999),
  isPrimary: z.boolean(),
});

export type FotoProdutoEntrada = z.input<typeof fotoSchema>;
export type ResultadoFoto = { error: string } | { ok: true; id: string };

export async function salvarFotoProduto(entrada: FotoProdutoEntrada): Promise<ResultadoFoto> {
  const analise = fotoSchema.safeParse(entrada);
  if (!analise.success) {
    return { error: analise.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const dados = analise.data;

  /**
   * A MESMA trava do conteúdo editável, pelo mesmo motivo (ver
   * motivoDeImagemInvalida em lib/conteudo/midia.ts): esta URL vai parar
   * dentro do `src` de um <Image> do Next na página do produto, e `src` que o
   * next/image não aceita não deixa a foto quebrada — derruba a PÁGINA.
   * Barrado aqui, quem cadastrou lê uma frase em português; barrado na
   * leitura, o cliente encontraria a vitrine no ar quebrada.
   */
  const motivo = motivoDeImagemInvalida(dados.url);
  if (motivo) return { error: motivo };

  const supabase = await createClient();

  /**
   * A variante tem que ser DESTE produto. Não é paranoia: a tela oferece só
   * as variantes certas, mas esta função é uma Server Action — ela responde a
   * qualquer chamada autenticada como admin, com o corpo que vier.
   */
  if (dados.variantId) {
    const { data: variante, error } = await supabase
      .from("product_variants")
      .select("id, product_id")
      .eq("id", dados.variantId)
      .maybeSingle();

    if (error) return { error: "Não foi possível confirmar a cor escolhida agora. Tente de novo." };
    if (!variante || variante.product_id !== dados.productId) {
      return { error: "Essa cor não pertence a este produto." };
    }
  }

  /**
   * A PRIMEIRA FOTO DO PRODUTO JÁ NASCE PRINCIPAL (03/09/2026).
   *
   * A tela nunca adiciona foto marcada como principal — trocar a capa da
   * vitrine tem que ser uma decisão, não efeito colateral. Só que num produto
   * SEM foto nenhuma isso deixava zero principais, e aí quem abre a página é
   * quem o `sort_order` sortear. Com uma foto só não há decisão a proteger.
   */
  let isPrimary = dados.isPrimary;
  if (!dados.id && !isPrimary) {
    const { count } = await supabase
      .from("product_media")
      .select("id", { count: "exact", head: true })
      .eq("product_id", dados.productId);
    if ((count ?? 0) === 0) isPrimary = true;
  }

  const linha = {
    product_id: dados.productId,
    variant_id: dados.variantId,
    type: tipoDeMidiaPelaUrl(dados.url),
    url: dados.url,
    alt_text: dados.altText,
    sort_order: dados.sortOrder,
    is_primary: isPrimary,
  };

  /**
   * O UPDATE É ESCOPADO PELO PRODUTO (03/09/2026, achado do Codex).
   *
   * `.eq("id")` sozinho bastava para MOVER uma foto de um produto para outro:
   * id da foto do produto A, productId do produto B. Não é escalonamento de
   * privilégio — a policy "admin manage product_media" já dá a esta pessoa
   * poder total sobre a tabela — mas é o tipo de gravação que uma aba velha,
   * ou um id repetido por engano, faz sozinha e ninguém percebe até a foto
   * errada aparecer na vitrine do produto errado.
   *
   * Com os dois filtros, id e produto discordando não gravam NADA (a linha
   * não é encontrada) em vez de gravarem a mudança de dono.
   */
  const { data: salva, error: erroGravacao } = dados.id
    ? await supabase
        .from("product_media")
        .update(linha)
        .eq("id", dados.id)
        .eq("product_id", dados.productId)
        .select("id")
        .maybeSingle()
    : await supabase.from("product_media").insert(linha).select("id").maybeSingle();

  if (erroGravacao || !salva) {
    return { error: "Não foi possível salvar a foto agora. Tente de novo em instantes." };
  }

  /**
   * PRINCIPAL É UMA SÓ (03/09/2026).
   *
   * A galeria ordena por `is_primary` e depois por `sort_order` — com duas
   * fotos marcadas como principal, qual abre primeiro vira sorteio do banco.
   * O schema não tem índice único para isso, então quem garante é esta linha:
   * marcou uma, as outras deste produto desmarcam.
   */
  if (isPrimary) {
    const { error: erroDesmarcar } = await supabase
      .from("product_media")
      .update({ is_primary: false })
      .eq("product_id", dados.productId)
      .neq("id", salva.id);

    // Se a segunda metade falhar o produto fica com DUAS principais, e qual
    // abre a página vira sorteio do banco. Não dá para esconder isso atrás de
    // um "salvo": quem marcou precisa saber que precisa marcar de novo.
    if (erroDesmarcar) {
      return {
        error:
          "A foto foi salva, mas não deu para desmarcar a principal anterior. Marque a principal de novo.",
      };
    }
  }

  await registrarAuditoria(supabase, {
    action: dados.id ? "produto.foto.editar" : "produto.foto.criar",
    entityType: "product_media",
    entityId: salva.id,
    diff: linha,
  });

  await revalidarVitrine(supabase, dados.productId);
  return { ok: true, id: salva.id };
}

export type ResultadoExclusaoFoto = { error: string } | { ok: true };

export async function excluirFotoProduto(
  id: string,
  productId: string
): Promise<ResultadoExclusaoFoto> {
  const analise = z.object({ id: z.string().uuid(), productId: z.string().uuid() }).safeParse({
    id,
    productId,
  });
  if (!analise.success) return { error: "Foto inválida." };

  const supabase = await createClient();

  // Lê antes de apagar: precisa saber se a principal saiu (para promover
  // outra), e o registro de auditoria fica sem conteúdo se a linha sumir antes.
  // O filtro por produto é a mesma trava do update — id que não é deste
  // produto não apaga nada, em vez de apagar a foto de outro.
  const { data: foto } = await supabase
    .from("product_media")
    .select("id, product_id, url, variant_id, is_primary")
    .eq("id", analise.data.id)
    .eq("product_id", analise.data.productId)
    .maybeSingle();

  if (!foto) return { error: "Esta foto já não existe." };

  const { error } = await supabase
    .from("product_media")
    .delete()
    .eq("id", analise.data.id)
    .eq("product_id", analise.data.productId);
  if (error) return { error: "Não foi possível excluir a foto agora. Tente de novo em instantes." };

  /**
   * SAIU A PRINCIPAL, ENTRA OUTRA (03/09/2026).
   *
   * Sem isto o produto fica com zero principais e quem abre a página do
   * produto passa a ser quem o `sort_order` sortear — e a foto de capa da
   * vitrine muda sozinha, sem ninguém ter decidido nada. A escolhida é a
   * primeira da ordem, que é a que já apareceria primeiro na galeria.
   */
  if (foto.is_primary) {
    const { data: proxima, error: erroBusca } = await supabase
      .from("product_media")
      .select("id")
      .eq("product_id", analise.data.productId)
      .order("sort_order")
      .limit(1)
      .maybeSingle();

    const { error: erroPromocao } = proxima
      ? await supabase.from("product_media").update({ is_primary: true }).eq("id", proxima.id)
      : { error: null };

    /**
     * A foto JÁ FOI apagada quando se chega aqui — não dá para devolver erro
     * e fingir que nada aconteceu. Mas também não dá para dizer só "excluída"
     * e deixar o produto sem principal em silêncio: a capa da vitrine passaria
     * a ser quem o `sort_order` sortear, e ninguém saberia por quê.
     *
     * Então o desfecho é honesto nos dois pedaços: a exclusão valeu, e falta
     * escolher a principal. Produto que ficou sem foto nenhuma não entra aqui
     * (não há o que promover, e não há capa para escolher).
     */
    if (erroBusca || erroPromocao) {
      await registrarAuditoria(supabase, {
        action: "produto.foto.excluir",
        entityType: "product_media",
        entityId: analise.data.id,
        diff: { url: foto.url, variantId: foto.variant_id, eraPrincipal: true, promocaoFalhou: true },
      });
      await revalidarVitrine(supabase, foto.product_id as string);
      return {
        error:
          "A foto foi excluída, mas este produto ficou sem foto principal. Marque uma como principal.",
      };
    }
  }

  await registrarAuditoria(supabase, {
    action: "produto.foto.excluir",
    entityType: "product_media",
    entityId: analise.data.id,
    diff: { url: foto.url, variantId: foto.variant_id, eraPrincipal: foto.is_primary },
  });

  await revalidarVitrine(supabase, foto.product_id as string);
  return { ok: true };
}

/**
 * A foto aparece em três lugares: a tela de edição, a página do produto e a
 * lista de produtos (que mostra a foto principal). Revalidar só a do admin
 * deixaria a vitrine com a foto velha até o cache expirar sozinho — e quem
 * trocou a foto conferiria no site, veria a antiga e trocaria de novo.
 */
async function revalidarVitrine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string
): Promise<void> {
  revalidatePath(`/admin/produtos/${productId}`);
  revalidatePath("/produtos");

  const { data: produto } = await supabase
    .from("products")
    .select("slug")
    .eq("id", productId)
    .maybeSingle();

  if (produto?.slug) revalidatePath(`/produtos/${produto.slug}`);
}
