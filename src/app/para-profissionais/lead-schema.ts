// Schema do lead de profissional — mora FORA da action de propósito.
//
// Arquivo "use server" só pode exportar função async, então um schema
// declarado dentro de actions.ts não pode ser importado pelo formulário. E
// sem poder importar, a conferência do navegador vira uma segunda escrita
// da mesma regra — foi o que aconteceu em 03/09/2026: um regex de e-mail
// escrito à mão aceitava "a..b@exemplo.com", que o zod recusa, e o cadastro
// se perdia calado. Uma regra, um lugar, os dois lados leem daqui.
//
// O servidor continua conferindo por conta própria (actions.ts): isto aqui
// é para o visitante corrigir na hora, não é barreira de segurança — quem
// chama a action direto não passa por este arquivo.
import { z } from "zod";

// Quem chama já converte campo vazio para null antes de mandar (ver
// ProfessionalLeadForm.tsx) — o schema só valida formato, não reimplementa
// a conversão texto->null.
export const leadSchema = z.object({
  fullName: z.string().trim().min(1, "Informe seu nome."),
  phone: z.string().trim().min(8, "Informe um telefone válido, com DDD."),
  email: z.string().trim().email("E-mail inválido.").nullable(),
  businessName: z.string().trim().nullable(),
  city: z.string().trim().nullable(),
  message: z.string().trim().nullable(),
});

export type ProfessionalLeadInput = z.infer<typeof leadSchema>;

/** Primeira mensagem de erro, ou `null` se está tudo certo. */
export function conferirLead(input: ProfessionalLeadInput): string | null {
  const parsed = leadSchema.safeParse(input);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "Confira os dados do formulário.";
}
