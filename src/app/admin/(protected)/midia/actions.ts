"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import {
  BUCKET_MIDIA,
  TAMANHO_MAXIMO_BYTES,
  nomeArquivoSeguro,
  tipoAceito,
} from "@/lib/conteudo/midia";

// Server Actions da Biblioteca de Fotos (/admin/midia) — 30/08/2026.
//
// ATENÇÃO para quem for testar upload de arquivo grande: next.config.js
// (fora do escopo desta entrega, não editado aqui) limita o corpo de toda
// Server Action a 6 MB — teto colocado em 26/08/2026 para a foto de
// /cores#ajuda. O bucket "site-media" aceita até 10 MB (migration 12). Isso
// significa que hoje um arquivo entre 6 MB e 10 MB é recusado pelo próprio
// Next ANTES de chegar em enviarImagem — com um erro de framework, não com
// a mensagem em português daqui embaixo. Não subi o teto porque isso fica
// em next.config.js, fora de src/app/admin/(protected)/midia/. Se quiser
// usar a faixa toda de 10 MB, esse arquivo precisa mudar.

export type EnviarImagemResultado =
  | { error: string }
  | { ok: true; url: string; caminho: string };

export async function enviarImagem(formData: FormData): Promise<EnviarImagemResultado> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Escolha uma foto antes de enviar." };
  }
  // Checagem pelo content-type real do arquivo, não pela extensão do nome —
  // mesmo critério de src/app/cores/actions.ts: o nome é escolhido por quem
  // envia, o type vem do navegador a partir do conteúdo do arquivo.
  if (!tipoAceito(arquivo.type)) {
    return { error: "Formato não aceito. Envie uma foto em JPG, PNG, WEBP, AVIF ou um vídeo MP4." };
  }
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return { error: "O arquivo é grande demais. O tamanho máximo é 10 MB." };
  }

  const supabase = await createClient();
  const caminho = nomeArquivoSeguro(arquivo.name, arquivo.type);

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_MIDIA)
    .upload(caminho, await arquivo.arrayBuffer(), {
      contentType: arquivo.type,
      upsert: false, // nome já sai com sufixo aleatório (ver nomeArquivoSeguro) — colisão aqui seria bug, não caso normal
    });

  if (erroUpload) {
    // "Bucket not found" é o erro mais provável num projeto Supabase onde a
    // migration 12 ainda não rodou — vale a pena distinguir esse caso do
    // erro genérico, porque a solução é bem diferente (colar a migration,
    // não "tentar de novo").
    const bucketAusente = erroUpload.message?.toLowerCase().includes("bucket not found");
    return {
      error: bucketAusente
        ? "A biblioteca de fotos ainda não foi configurada no banco (falta aplicar a migration 12). Avise quem cuida do site."
        : "Não foi possível enviar a foto agora. Tente de novo em instantes.",
    };
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET_MIDIA).getPublicUrl(caminho);

  await registrarAuditoria(supabase, {
    action: "midia.enviar",
    entityType: "storage.site-media",
    entityId: caminho,
    diff: { nomeOriginal: arquivo.name, tamanho: arquivo.size, tipo: arquivo.type },
  });

  revalidatePath("/admin/midia");
  return { ok: true, url: publicUrlData.publicUrl, caminho };
}

export type ExcluirImagemResultado = { error: string } | { ok: true };

/**
 * Apaga uma foto do bucket "site-media" — mas só depois de confirmar que
 * nada no site está usando ela. Requisito explícito da missão, não excesso
 * de zelo: apagar do Storage uma foto que um produto ou banner ainda
 * referencia deixa um card quebrado na vitrine sem nenhum aviso, e quem
 * excluiu nem vai desconfiar que a causa foi essa exclusão de dias atrás.
 *
 * A checagem é por LIKE no nome do arquivo (não por igualdade da URL
 * inteira) nas três colunas — inclusive nas duas que guardam a URL
 * completa (product_media.url, banners.imagem_url). É deliberado: o nome
 * gerado por nomeArquivoSeguro já é único por si só (sufixo aleatório), e
 * comparar só por ele tolera domínio/protocolo diferente na URL salva
 * (http vs https, ou a URL guardada sem o parâmetro de cache) sem abrir
 * mão de precisão — Francisco, se preferir o match exato de URL nas duas
 * colunas de imagem, é só trocar o ilike por eq(coluna, urlCompleta) aqui.
 */
export async function excluirImagem(caminho: string): Promise<ExcluirImagemResultado> {
  const caminhoLimpo = caminho.trim();
  if (!caminhoLimpo) {
    return { error: "Nenhum arquivo informado." };
  }

  const supabase = await createClient();
  const filtro = `%${caminhoLimpo}%`;

  const [emProduto, emBanner, emTexto] = await Promise.all([
    supabase.from("product_media").select("id").ilike("url", filtro).limit(1).maybeSingle(),
    supabase.from("banners").select("id, titulo").ilike("imagem_url", filtro).limit(1).maybeSingle(),
    supabase.from("site_texts").select("chave").ilike("valor", filtro).limit(1).maybeSingle(),
  ]);

  // Falha em QUALQUER uma das três consultas trava a exclusão — sem saber
  // se a foto está em uso em algum lugar (banners e site_texts só existem
  // depois da migration 12; se a tabela nem existir, a consulta erra),
  // apagar seria assumir um risco que não é desta função assumir.
  if (emProduto.error || emBanner.error || emTexto.error) {
    return { error: "Não foi possível confirmar se esta foto está em uso agora. Tente de novo em instantes." };
  }
  if (emProduto.data) {
    return { error: "Esta foto está em uso em um produto. Troque a foto do produto antes de excluir." };
  }
  if (emBanner.data) {
    const nomeBanner = (emBanner.data as { titulo?: string }).titulo ?? "sem título";
    return { error: `Esta foto está em uso no banner "${nomeBanner}". Troque a foto do banner antes de excluir.` };
  }
  if (emTexto.data) {
    return { error: "Esta foto está em uso em um texto do site (aba Conteúdo). Troque essa referência antes de excluir." };
  }

  const { error: erroDelete } = await supabase.storage.from(BUCKET_MIDIA).remove([caminhoLimpo]);
  if (erroDelete) {
    return { error: "Não foi possível excluir a foto agora. Tente de novo em instantes." };
  }

  await registrarAuditoria(supabase, {
    action: "midia.excluir",
    entityType: "storage.site-media",
    entityId: caminhoLimpo,
    diff: null,
  });

  revalidatePath("/admin/midia");
  return { ok: true };
}
