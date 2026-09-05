"use server";

// Server Action da ferramenta "Ajude-me a descobrir minha cor" (/cores#ajuda)
// — grava em color_help_requests e sobe a foto para o bucket privado
// "color-help" (ver supabase/migrations/00000000000004_storage_color_help.sql,
// ainda não aplicada). Usa createAdminClient() (service role): a tabela tem
// RLS ligada e nenhuma policy pública de insert (mesmo comentário de fim de
// 00000000000001_init.sql) — sem policy própria, só o backend grava. Isso
// vale tanto para a linha da tabela quanto para o objeto no storage: o
// upload aqui roda no servidor, então usar o client de service role em vez
// de depender só da policy de storage (que existe, mas é para o caminho
// alternativo de upload direto do navegador — ver comentário na migration).
//
// Recebe FormData (não um objeto tipado): é o formato nativo de uma Server
// Action que recebe arquivo — o <input type="file"> só viaja dentro de
// FormData, não dá para serializar um File dentro do payload JSON que as
// outras actions deste projeto usam (ex.: salvarProdutoAction).
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { avisarNovoContato } from "@/lib/notificacoes/novo-contato";

const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5MB — limite pedido na missão

const dadosSchema = z.object({
  customerName: z.string().trim().min(1, "Informe seu nome."),
  contact: z.string().trim().min(3, "Informe um telefone ou e-mail para contato."),
});

export type ColorHelpResult = { error: string } | { ok: true };

export async function enviarPedidoAjudaCorAction(formData: FormData): Promise<ColorHelpResult> {
  const parsed = dadosSchema.safeParse({
    customerName: formData.get("customerName"),
    contact: formData.get("contact"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Confira os dados do formulário." };
  }

  const foto = formData.get("photo");
  if (!(foto instanceof File) || foto.size === 0) {
    return { error: "Envie uma foto do seu cabelo." };
  }
  // Checagem por content-type do arquivo, não por extensão do nome: o nome
  // é controlado por quem envia, o type vem do navegador a partir do
  // conteúdo real do arquivo selecionado.
  if (!foto.type.startsWith("image/")) {
    return { error: "O arquivo precisa ser uma imagem (JPG, PNG ou similar)." };
  }
  if (foto.size > TAMANHO_MAXIMO_BYTES) {
    return { error: "A imagem precisa ter até 5MB." };
  }

  const supabase = createAdminClient();

  const extensao = foto.type.split("/")[1]?.toLowerCase().replace("jpeg", "jpg") || "jpg";
  const caminho = `pedidos/${randomUUID()}.${extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from("color-help")
    .upload(caminho, await foto.arrayBuffer(), {
      contentType: foto.type,
      upsert: false,
    });
  if (erroUpload) {
    return { error: "Não foi possível enviar a foto agora. Tente novamente." };
  }

  // photo_url guarda o CAMINHO dentro do bucket, não uma URL pública — o
  // bucket é privado (ver migration), então não existe URL pública para
  // gravar aqui. Quem for exibir a foto depois (painel administrativo,
  // fora do escopo desta entrega) precisa gerar uma signed URL com o
  // client de service role.
  const { error: erroInsert } = await supabase.from("color_help_requests").insert({
    customer_name: parsed.data.customerName,
    contact: parsed.data.contact,
    photo_url: caminho,
    status: "new",
  });
  if (erroInsert) {
    return { error: "Não foi possível registrar seu pedido agora. Tente novamente." };
  }

  // Mesma regra do lead profissional: grava, avisa, responde. O aviso nunca
  // derruba o formulário — ver novo-contato.ts.
  await avisarNovoContato("ajuda_cor");

  return { ok: true };
}
