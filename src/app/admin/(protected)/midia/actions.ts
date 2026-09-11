"use server";

import { revalidatePath } from "next/cache";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import {
  BUCKET_MIDIA,
  TAMANHO_MAXIMO_BYTES,
  TAMANHO_MAXIMO_BYTES_VIDEO,
  nomeArquivoSeguro,
  tipoAceito,
} from "@/lib/conteudo/midia";
import { listarFotosDoRepositorio } from "@/lib/conteudo/fotos-do-repositorio";

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

type ResultadoFotoDoSite = { error: string } | { ok: true };

function revalidarFotosDoSite() {
  for (const rota of ["/", "/cores", "/sobre-as-proteses", "/naturalidade", "/produtos"]) revalidatePath(rota);
  revalidatePath("/produtos/[slug]", "page");
  revalidatePath("/admin/midia");
}

function caminhoStorageDoOriginal(caminho: string) {
  return `originais/${caminho.replace(/^\/media\//, "").replace(/[^a-zA-Z0-9._/-]/g, "-")}`;
}

function categoriaDoCaminho(caminho: string) {
  const parte = caminho.replace(/^\/media\//, "").split("/")[0] ?? "";
  const nomes: Record<string, string> = {
    hero: "Página inicial",
    produtos: "Produtos",
    cores: "Cores",
    base: "Bases",
    marca: "Marca",
  };
  return nomes[parte] ?? "Geral";
}

async function usuario(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

/** Copia, uma única vez, as fotos versionadas para o Storage público. */
export async function migrarFotosQueVieramComOSite(): Promise<ResultadoFotoDoSite> {
  const supabase = await createClient();
  const fotos = await listarFotosDoRepositorio();
  const existentes = await supabase.from("site_media_assets").select("source_path").not("source_path", "is", null);
  if (existentes.error) return { error: "A tabela da biblioteca ainda não existe. Aplique a migration 19 no Supabase." };
  const jaMigradas = new Set((existentes.data ?? []).map((f) => f.source_path));

  try {
    for (const foto of fotos) {
      if (jaMigradas.has(foto.caminho)) continue;
      const relativo = foto.caminho.replace(/^\//, "");
      const absoluto = path.join(process.cwd(), "public", relativo);
      const conteudo = await fs.readFile(absoluto);
      const storagePath = caminhoStorageDoOriginal(foto.caminho);
      const extensao = path.extname(storagePath).toLowerCase();
      const contentType = extensao === ".png" ? "image/png" : extensao === ".webp" ? "image/webp" : extensao === ".avif" ? "image/avif" : "image/jpeg";
      const upload = await supabase.storage.from(BUCKET_MIDIA).upload(storagePath, conteudo, { contentType, upsert: false });
      if (upload.error && !upload.error.message.toLowerCase().includes("already exists")) throw upload.error;
      const url = supabase.storage.from(BUCKET_MIDIA).getPublicUrl(storagePath).data.publicUrl;
      const gravar = await supabase.from("site_media_assets").upsert({
        source_path: foto.caminho, storage_path: storagePath, url, nome: path.basename(foto.caminho), tamanho: foto.tamanho, tipo: contentType, categoria: categoriaDoCaminho(foto.caminho), ativo: true, updated_at: new Date().toISOString(), updated_by: await usuario(supabase),
      }, { onConflict: "source_path" });
      if (gravar.error) throw gravar.error;
      // Referências já gravadas no banco deixam de depender do deploy.
      await Promise.all([
        supabase.from("colors").update({ photo_url: url }).eq("photo_url", foto.caminho),
        supabase.from("product_media").update({ url }).eq("url", foto.caminho),
        supabase.from("banners").update({ imagem_url: url }).eq("imagem_url", foto.caminho),
        supabase.from("site_texts").update({ valor: url }).eq("valor", foto.caminho),
      ]);
    }
  } catch (e) {
    return { error: e instanceof Error ? `Não foi possível migrar as fotos: ${e.message}` : "Não foi possível migrar as fotos agora." };
  }
  revalidarFotosDoSite();
  return { ok: true };
}

async function guardarArquivo(arquivo: File, prefixo: string) {
  if (!tipoAceito(arquivo.type)) throw new Error("Envie uma foto em JPG, PNG, WEBP ou AVIF, ou um vídeo em MP4.");
  const limite = arquivo.type.startsWith("video/") ? TAMANHO_MAXIMO_BYTES_VIDEO : TAMANHO_MAXIMO_BYTES;
  if (arquivo.size > limite) throw new Error(arquivo.type.startsWith("video/") ? "O vídeo é grande demais. O tamanho máximo é 25 MB." : "A foto é grande demais. O tamanho máximo é 5 MB.");
  const supabase = await createClient();
  const storagePath = `${prefixo}/${nomeArquivoSeguro(arquivo.name, arquivo.type)}`;
  const envio = await supabase.storage.from(BUCKET_MIDIA).upload(storagePath, await arquivo.arrayBuffer(), { contentType: arquivo.type, upsert: false });
  if (envio.error) throw envio.error;
  return { supabase, storagePath, url: supabase.storage.from(BUCKET_MIDIA).getPublicUrl(storagePath).data.publicUrl };
}

export async function adicionarFotoDoSite(formData: FormData): Promise<ResultadoFotoDoSite> {
  const arquivo = formData.get("arquivo");
  const categoria = String(formData.get("categoria") ?? "Geral").trim().slice(0, 60) || "Geral";
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Escolha uma mídia antes de adicionar." };
  try {
    const { supabase, storagePath, url } = await guardarArquivo(arquivo, "biblioteca");
    const { error } = await supabase.from("site_media_assets").insert({ storage_path: storagePath, url, nome: arquivo.name, tamanho: arquivo.size, tipo: arquivo.type, categoria, updated_by: await usuario(supabase) });
    if (error) throw error;
    revalidarFotosDoSite();
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : "Não foi possível adicionar a foto." }; }
}

export async function substituirFotoDoSite(id: string, formData: FormData): Promise<ResultadoFotoDoSite> {
  const arquivo = formData.get("arquivo");
  const categoria = String(formData.get("categoria") ?? "Geral").trim().slice(0, 60) || "Geral";
  if (!id || !(arquivo instanceof File) || arquivo.size === 0) return { error: "Escolha uma foto antes de substituir." };
  try {
    const { supabase, storagePath, url } = await guardarArquivo(arquivo, "substituicoes");
    const atual = await supabase.from("site_media_assets").select("storage_path, source_path, url, tipo").eq("id", id).maybeSingle();
    if (atual.error || !atual.data) throw new Error("Foto não encontrada.");
    if (Boolean(atual.data.tipo?.startsWith("video/")) !== Boolean(arquivo.type.startsWith("video/"))) {
      await supabase.storage.from(BUCKET_MIDIA).remove([storagePath]);
      return { error: "Uma foto só pode ser substituída por foto, e um vídeo só por vídeo." };
    }
    const { error } = await supabase.from("site_media_assets").update({ storage_path: storagePath, url, nome: arquivo.name, tamanho: arquivo.size, tipo: arquivo.type, categoria, ativo: true, updated_at: new Date().toISOString(), updated_by: await usuario(supabase) }).eq("id", id);
    if (error) throw error;
    await Promise.all([
      supabase.from("colors").update({ photo_url: url }).eq("photo_url", atual.data.url),
      supabase.from("product_media").update({ url }).eq("url", atual.data.url),
      supabase.from("banners").update({ imagem_url: url }).eq("imagem_url", atual.data.url),
      supabase.from("site_texts").update({ valor: url }).eq("valor", atual.data.url),
      supabase.storage.from(BUCKET_MIDIA).remove([atual.data.storage_path]),
    ]);
    revalidarFotosDoSite();
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : "Não foi possível substituir a foto." }; }
}

/**
 * A administradora pode excluir qualquer mídia, inclusive uma que esteja em
 * uso. A confirmação visual lista os usos; ao confirmar, estes vínculos são
 * retirados antes do arquivo. Se uma seção tiver conteúdo original, ela volta
 * para ele; produto sem mídia própria usa a galeria padrão. Assim a dona tem
 * controle total sem deixar uma URL quebrada exposta ao comprador.
 */
export async function excluirFotoDoSite(id: string): Promise<ResultadoFotoDoSite> {
  const supabase = await createClient();
  const { data: foto, error } = await supabase.from("site_media_assets").select("storage_path, url, source_path").eq("id", id).maybeSingle();
  if (error || !foto) return { error: "Foto não encontrada." };
  const valores = [foto.url, foto.source_path].filter(Boolean) as string[];
  const [cores, produtos, banners, textos] = await Promise.all([
    supabase.from("colors").select("id").in("photo_url", valores),
    supabase.from("product_media").select("id").in("url", valores),
    supabase.from("banners").select("id").in("imagem_url", valores),
    supabase.from("site_texts").select("chave").in("valor", valores),
  ]);
  if (cores.error || produtos.error || banners.error || textos.error) return { error: "Não foi possível confirmar onde esta mídia está sendo usada. Tente de novo em instantes." };
  const desvincular = await Promise.all([
    supabase.from("colors").update({ photo_url: null }).in("photo_url", valores),
    supabase.from("product_media").delete().in("url", valores),
    supabase.from("banners").update({ imagem_url: null }).in("imagem_url", valores),
    // Sem a edição, textosDaPagina() volta automaticamente para o original
    // que veio com o site, em vez de guardar uma URL apagada.
    supabase.from("site_texts").delete().in("valor", valores),
  ]);
  if (desvincular.some((resultado) => resultado.error)) {
    return { error: "Não foi possível retirar esta mídia de todos os locais. Nenhum arquivo foi apagado." };
  }
  const desativar = await supabase.from("site_media_assets").update({ ativo: false, updated_at: new Date().toISOString(), updated_by: await usuario(supabase) }).eq("id", id);
  if (desativar.error) return { error: "Não foi possível atualizar a Biblioteca antes de excluir o arquivo." };
  const removido = await supabase.storage.from(BUCKET_MIDIA).remove([foto.storage_path]);
  if (removido.error) {
    // O arquivo continua acessível; desfaz a desativação para a biblioteca e
    // o site não passarem a apontar para estados diferentes.
    await supabase.from("site_media_assets").update({ ativo: true, updated_at: new Date().toISOString(), updated_by: await usuario(supabase) }).eq("id", id);
    return { error: "Não foi possível excluir o arquivo agora. Nenhuma mudança foi publicada." };
  }
  await registrarAuditoria(supabase, { action: "midia.excluirSite", entityType: "site_media_assets", entityId: id, diff: { sourcePath: foto.source_path } });
  revalidarFotosDoSite();
  return { ok: true };
}

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
