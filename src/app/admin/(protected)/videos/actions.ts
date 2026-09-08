"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { REGISTRO, type ChaveDeTexto } from "@/lib/conteudo/registro";
import {
  BUCKET_MIDIA,
  TAMANHO_MAXIMO_BYTES_VIDEO,
  motivoDeImagemInvalida,
  nomeArquivoSeguro,
} from "@/lib/conteudo/midia";
import { salvarTexto, restaurarOriginal } from "../textos/actions";

// Server Actions do painel /admin/videos (08/09/2026). Mesmo desenho de
// /admin/textos (ver o comentário no topo daquele actions.ts): a tela nunca
// CRIA chave nova, só grava ou apaga a edição de uma chave que já está no
// REGISTRO com tipo "video". `salvarTexto`/`restaurarOriginal` são os
// MESMOS de lá — reexportados aqui para o VideosManager não precisar
// importar de duas pastas diferentes.
export { restaurarOriginal };

export type ResultadoTrocarVideo = { error: string } | { ok: true; url: string };

const chaveSchema = z
  .string()
  .trim()
  .min(1, "Chave inválida.")
  .refine((c): c is ChaveDeTexto => c in REGISTRO, "Este vídeo não existe no registro do site.");

/**
 * Envia um vídeo do computador e já o coloca no lugar de `chave` — um passo
 * só, mesmo desenho de `trocarImagem` (textos/actions.ts): upload e
 * gravação vivem juntos para o caso "subiu mas não colou" ter dono (a
 * órfã no bucket é apagada antes do erro sair). Ver o comentário de lá
 * para o raciocínio completo — aqui só muda o tipo de arquivo aceito e o
 * tamanho máximo.
 */
export async function trocarVideo(
  chave: string,
  formData: FormData
): Promise<ResultadoTrocarVideo> {
  const parsedChave = chaveSchema.safeParse(chave);
  if (!parsedChave.success) {
    return { error: parsedChave.error.issues[0]?.message ?? "Chave inválida." };
  }
  if (REGISTRO[parsedChave.data].tipo !== "video") {
    return { error: "Este item do site não é um vídeo." };
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Escolha um vídeo antes de enviar." };
  }
  // Só MP4 — é o único formato de vídeo que o bucket site-media aceita
  // (migration 12, allowed_mime_types) e que a tag <video><source> da home
  // já espera.
  if (arquivo.type !== "video/mp4") {
    return { error: "Formato não aceito. Envie um vídeo em MP4." };
  }
  if (arquivo.size > TAMANHO_MAXIMO_BYTES_VIDEO) {
    return {
      error: "O vídeo é grande demais. O tamanho máximo é 25 MB — comprima o arquivo e tente de novo.",
    };
  }

  const supabase = await createClient();
  const caminho = nomeArquivoSeguro(arquivo.name, arquivo.type);

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_MIDIA)
    .upload(caminho, await arquivo.arrayBuffer(), {
      contentType: arquivo.type,
      upsert: false, // o nome já sai com sufixo aleatório; colisão aqui seria bug
    });

  if (erroUpload) {
    const bucketAusente = erroUpload.message?.toLowerCase().includes("bucket not found");
    return {
      error: bucketAusente
        ? "O espaço de mídia do site ainda não foi criado no banco (falta aplicar supabase/aplicar/CONTEUDO-BUCKET.sql). Avise quem cuida do site."
        : "Não foi possível enviar o vídeo agora. Tente de novo em instantes.",
    };
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET_MIDIA).getPublicUrl(caminho);
  const url = publicUrlData.publicUrl;

  // A MESMA validação da digitação à mão, aplicada ao que o próprio Storage
  // devolveu — ver o comentário gêmeo em trocarImagem.
  const motivo = motivoDeImagemInvalida(url);
  if (motivo) {
    await supabase.storage.from(BUCKET_MIDIA).remove([caminho]);
    return {
      error: "O vídeo foi enviado, mas o endereço gerado não serve para o site. Avise quem cuida do site.",
    };
  }

  const resultado = await salvarTexto(parsedChave.data, url);
  if ("error" in resultado) {
    // Não colou: o vídeo não pode ficar no bucket sem dono.
    await supabase.storage.from(BUCKET_MIDIA).remove([caminho]);
    return resultado;
  }

  await registrarAuditoria(supabase, {
    action: "videos.trocarVideo",
    entityType: "site_texts",
    entityId: parsedChave.data,
    diff: { arquivo: caminho, nomeOriginal: arquivo.name, tamanho: arquivo.size },
  });

  revalidatePath("/admin/midia");
  return { ok: true, url };
}
