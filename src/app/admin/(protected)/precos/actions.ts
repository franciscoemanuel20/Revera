"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { regraDescontoSchema, sincronizarRegrasDesconto } from "@/lib/admin/discount-rules";

// Server Action da visão consolidada de preços (/admin/precos) — chama o
// MESMO sincronizarRegrasDesconto que o formulário de produto usa (ver
// src/lib/admin/discount-rules.ts), só que a partir de uma tela dedicada a
// só isto, sem precisar abrir o formulário inteiro do produto para mexer
// numa faixa de desconto. Grava auditoria própria (produtos/actions.ts não
// grava — ver comentário em src/lib/admin/audit.ts sobre isso ser
// intencional).

const salvarPrecosSchema = z.object({
  productId: z.string().uuid(),
  discountRules: z.array(regraDescontoSchema),
});

export type SalvarPrecosInput = z.infer<typeof salvarPrecosSchema>;
export type SalvarPrecosResultado = { error: string } | { ok: true };

export async function salvarPrecosProdutoAction(input: SalvarPrecosInput): Promise<SalvarPrecosResultado> {
  const parsed = salvarPrecosSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dado inválido no formulário." };
  }
  const { productId, discountRules } = parsed.data;
  const supabase = await createClient();

  const erro = await sincronizarRegrasDesconto(supabase, productId, discountRules);
  if (erro) return { error: erro };

  await registrarAuditoria(supabase, {
    action: "precos.salvar_regras",
    entityType: "quantity_discount_rules",
    entityId: productId,
    diff: { productId, quantidadeRegras: discountRules.length },
  });

  revalidatePath("/admin/precos");
  revalidatePath(`/admin/precos/${productId}`);
  revalidatePath("/admin/produtos");
  revalidatePath(`/admin/produtos/${productId}`);
  return { ok: true };
}
