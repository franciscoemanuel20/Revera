"use server";

// Server Action do formulário de /para-profissionais — grava em
// professional_leads (schema em supabase/migrations/00000000000001_init.sql,
// linha ~244). Usa createAdminClient() (service role), não createClient():
// a tabela tem RLS ligada e NENHUMA policy pública de insert (ver o
// comentário "Tudo mais: sem policy pública = só service role acessa" no
// fim da migration 1) — mesmo padrão que color_help_requests usa em
// src/app/cores/actions.ts. Isto não é uma rota de admin autenticado, é
// captura de lead público; sem policy própria, só o backend grava.
//
// Nada de tabela de preço, desconto ou condição comercial aqui — a missão
// que criou esta página foi explícita: só "equipe entra em contato para
// apresentar condições". Quem decide número é o Francisco, depois, fora
// deste formulário.
import { createAdminClient } from "@/lib/supabase/server";
// O schema vem de lead-schema.ts, não daqui: arquivo "use server" só
// exporta função async, e o formulário precisa da MESMA regra para avisar o
// visitante antes de mandar. Ver o comentário de lá.
import { leadSchema, type ProfessionalLeadInput } from "./lead-schema";

export type ProfessionalLeadResult = { error: string } | { ok: true };

export async function enviarLeadProfissionalAction(
  input: ProfessionalLeadInput
): Promise<ProfessionalLeadResult> {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Confira os dados do formulário." };
  }

  const dados = parsed.data;
  const supabase = createAdminClient();

  const { error } = await supabase.from("professional_leads").insert({
    full_name: dados.fullName,
    phone: dados.phone,
    email: dados.email,
    business_name: dados.businessName,
    city: dados.city,
    message: dados.message,
    status: "new",
  });

  if (error) {
    return { error: "Não foi possível enviar seu contato agora. Tente novamente em instantes." };
  }

  return { ok: true };
}
