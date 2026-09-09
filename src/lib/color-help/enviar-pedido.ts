import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { avisarNovoContato } from "@/lib/notificacoes/novo-contato";

export const TAMANHO_MAXIMO_FOTO_AJUDA_COR_BYTES = 5 * 1024 * 1024;
const TIPOS_DE_IMAGEM_ACEITOS = new Set(["image/jpeg", "image/png", "image/webp"]);

const dadosSchema = z.object({
  customerName: z.string().trim().min(1, "Informe seu nome."),
  email: z.string().trim().email("Informe um e-mail válido.").or(z.literal("")),
  phone: z
    .string()
    .trim()
    .refine((value) => !value || value.replace(/\D/g, "").length >= 10, "Informe um WhatsApp válido."),
}).refine((dados) => Boolean(dados.email || dados.phone), {
  message: "Informe seu e-mail ou WhatsApp para contato.",
  path: ["email"],
});

export type ColorHelpResult = { error: string } | { ok: true };

export async function enviarPedidoAjudaCor(formData: FormData): Promise<ColorHelpResult> {
  const parsed = dadosSchema.safeParse({
    customerName: formData.get("customerName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Confira os dados do formulário." };
  }

  const foto = formData.get("photo");
  if (!(foto instanceof File) || foto.size === 0) {
    return { error: "Envie uma foto do seu cabelo." };
  }
  if (!TIPOS_DE_IMAGEM_ACEITOS.has(foto.type)) {
    return { error: "Envie uma imagem JPG, PNG ou WebP." };
  }
  if (foto.size > TAMANHO_MAXIMO_FOTO_AJUDA_COR_BYTES) {
    return { error: "A imagem precisa ter até 5MB." };
  }

  const supabase = createAdminClient();
  const extensao = foto.type === "image/jpeg" ? "jpg" : foto.type.split("/")[1];
  const caminho = `pedidos/${randomUUID()}.${extensao}`;
  const { error: erroUpload } = await supabase.storage
    .from("color-help")
    .upload(caminho, await foto.arrayBuffer(), { contentType: foto.type, upsert: false });
  if (erroUpload) return { error: "Não foi possível enviar a foto agora. Tente novamente." };

  const { error: erroInsert } = await supabase.from("color_help_requests").insert({
    customer_name: parsed.data.customerName,
    contact: parsed.data.email || parsed.data.phone,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    photo_url: caminho,
    status: "new",
  });
  if (erroInsert) return { error: "Não foi possível registrar seu pedido agora. Tente novamente." };

  await avisarNovoContato("ajuda_cor");
  return { ok: true };
}
