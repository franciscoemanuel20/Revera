"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";

// site_settings é chave-valor em jsonb (ver supabase/migrations/00000000000001_init.sql):
// esta Server Action faz upsert por `key` — se a chave não existir, cria;
// se existir, sobrescreve. "Se a chave não existir ainda, criar" foi
// pedido explícito da missão, então isto nunca rejeita uma chave nova só
// por ser desconhecida (não existe uma lista fixa de chaves permitidas).
//
// O valor chega da tela como TEXTO (o textarea do formulário) e é
// interpretado como JSON aqui, no servidor — nunca confiar em JSON.parse
// só no client e mandar o objeto já pronto, porque um erro de digitação
// vira "undefined" silencioso do lado do navegador; aqui um JSON inválido
// vira erro claro para a dona corrigir.

const KEY_REGEX = /^[a-z][a-z0-9_]*$/;

const salvarConfiguracaoSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "A chave é obrigatória")
    .regex(KEY_REGEX, "A chave só pode ter letras minúsculas, números e underline, começando por letra"),
  valueJson: z.string().trim().min(1, "O valor não pode ficar em branco"),
});

export type SalvarConfiguracaoInput = z.infer<typeof salvarConfiguracaoSchema>;
export type AcaoResultado = { error: string } | { ok: true };

export async function salvarConfiguracaoAction(input: SalvarConfiguracaoInput): Promise<AcaoResultado> {
  const parsed = salvarConfiguracaoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido." };
  }

  let valor: unknown;
  try {
    valor = JSON.parse(parsed.data.valueJson);
  } catch {
    return {
      error:
        'O valor precisa ser JSON válido — texto simples vai entre aspas (ex.: "Reverá"), não solto.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key: parsed.data.key, value: valor as never, updated_at: new Date().toISOString() });
  if (error) {
    return { error: "Não foi possível salvar a configuração. Confira se você tem permissão de admin." };
  }

  await registrarAuditoria(supabase, {
    action: "configuracao.salvar",
    entityType: "site_settings",
    entityId: parsed.data.key,
    diff: { value: valor },
  });

  revalidatePath("/admin/configuracoes");
  return { ok: true };
}
