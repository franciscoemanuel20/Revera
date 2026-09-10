"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/admin/audit";
import {
  BUCKET_MIDIA,
  TAMANHO_MAXIMO_BYTES,
  motivoDeImagemInvalida,
  nomeArquivoSeguro,
  tipoAceito,
} from "@/lib/conteudo/midia";
import { createClient } from "@/lib/supabase/server";

const corSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1, "Código da cor é obrigatório.").max(40),
  name: z.string().trim().min(1, "Nome da cor é obrigatório.").max(80),
  photoUrl: z.string().trim().nullable(),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
});

const coresSchema = z.object({ cores: z.array(corSchema).max(100) });
export type CorEntrada = z.input<typeof corSchema>;
export type Resultado = { ok: true } | { error: string };

function revalidar() {
  revalidatePath("/cores");
  revalidatePath("/produtos");
  revalidatePath("/produtos/[slug]", "page");
  revalidatePath("/admin/cores");
}

/** Só apagamos arquivos que foram criados por esta tela no bucket atual. */
function caminhoDeFotoDaCor(url: string | null): string | null {
  if (!url) return null;
  try {
    const marcador = `/storage/v1/object/public/${BUCKET_MIDIA}/`;
    const caminho = new URL(url).pathname.split(marcador)[1];
    return caminho?.startsWith("cores/") ? decodeURIComponent(caminho) : null;
  } catch {
    return null;
  }
}

/** Server Actions podem ser chamadas sem renderizar o layout protegido. */
async function confirmarAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  return Boolean(adminUser);
}

/** Salva a cartela inteira para que ordem e visibilidade mudem juntas. */
export async function salvarCores(input: { cores: CorEntrada[] }): Promise<Resultado> {
  const parsed = coresSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const vistas = new Set<string>();
  for (const cor of parsed.data.cores) {
    const chave = cor.code.toLowerCase();
    if (vistas.has(chave)) return { error: `O código "${cor.code}" foi repetido.` };
    vistas.add(chave);
    if (cor.photoUrl && motivoDeImagemInvalida(cor.photoUrl)) {
      return { error: `A foto da cor ${cor.name} não é válida. Envie-a pelo botão de foto.` };
    }
  }

  const supabase = await createClient();
  if (!(await confirmarAdmin(supabase))) return { error: "Você não tem permissão para alterar as cores." };
  // Uma única função SQL: se qualquer cor falhar, o PostgreSQL desfaz todas
  // as alterações da cartela. Não deixamos o admin com uma parte salva e a
  // outra parte perdida depois de uma falha de rede ou de validação.
  const { error } = await supabase.rpc("salvar_cartela_cores", {
    p_cores: parsed.data.cores.map((cor) => ({
      id: cor.id ?? null,
      code: cor.code,
      name: cor.name,
      photo_url: cor.photoUrl || null,
      sort_order: cor.sortOrder,
      is_active: cor.isActive,
    })),
  });
  if (error) {
    return { error: "Não foi possível salvar as cores. Nenhuma alteração foi aplicada; confira os códigos e tente novamente." };
  }

  await registrarAuditoria(supabase, {
    action: "cores.salvar",
    entityType: "colors",
    entityId: null,
    diff: { quantidade: parsed.data.cores.length },
  });
  revalidar();
  return { ok: true };
}

/** Envia uma foto e já a associa à cor; não existe URL manual para evitar imagem quebrada. */
export async function trocarFotoDaCor(id: string, formData: FormData): Promise<{ ok: true; url: string } | { error: string }> {
  if (!z.string().uuid().safeParse(id).success) return { error: "Cor inválida." };
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Escolha uma foto antes de enviar." };
  if (!tipoAceito(arquivo.type) || !arquivo.type.startsWith("image/")) {
    return { error: "Envie uma foto em JPG, PNG, WEBP ou AVIF." };
  }
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) return { error: "A foto pode ter no máximo 5 MB." };

  const supabase = await createClient();
  if (!(await confirmarAdmin(supabase))) return { error: "Você não tem permissão para enviar fotos." };
  const { data: corAtual, error: erroCorAtual } = await supabase
    .from("colors")
    .select("photo_url")
    .eq("id", id)
    .maybeSingle();
  if (erroCorAtual || !corAtual) return { error: "A cor não foi encontrada ou você não tem permissão para alterá-la." };

  const caminho = `cores/${nomeArquivoSeguro(arquivo.name, arquivo.type)}`;
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_MIDIA)
    .upload(caminho, await arquivo.arrayBuffer(), { contentType: arquivo.type, upsert: false });
  if (erroUpload) return { error: "Não foi possível enviar a foto agora. Tente novamente." };

  const url = supabase.storage.from(BUCKET_MIDIA).getPublicUrl(caminho).data.publicUrl;
  const { data: corSalva, error: erroSalvar } = await supabase
    .from("colors")
    .update({ photo_url: url })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (erroSalvar || !corSalva) {
    await supabase.storage.from(BUCKET_MIDIA).remove([caminho]);
    return { error: "A foto foi enviada, mas não pôde ser associada à cor." };
  }

  await registrarAuditoria(supabase, {
    action: "cores.trocarFoto",
    entityType: "colors",
    entityId: id,
    diff: { arquivo: caminho },
  });
  const caminhoAnterior = caminhoDeFotoDaCor(corAtual.photo_url as string | null);
  if (caminhoAnterior && caminhoAnterior !== caminho) {
    // A nova URL já está no banco: uma falha de limpeza não desfaz a troca,
    // mas tentamos não acumular arquivos públicos sem referência.
    await supabase.storage.from(BUCKET_MIDIA).remove([caminhoAnterior]);
  }
  revalidar();
  return { ok: true, url };
}
