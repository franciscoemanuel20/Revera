import { z } from "zod";
import { cpfValido, limparCPF } from "@/lib/format/cpf";

// Schema único do formulário de checkout — compartilhado entre o client
// (CheckoutForm.tsx, para tipar o payload) e a Server Action
// (actions.ts, para validar de verdade). A validação que importa é sempre
// a do servidor; o client só usa os tipos daqui, nunca decide sozinho se
// um dado é válido.
//
// CPF e CEP: valida o formato "como a pessoa digitou" (com ou sem máscara)
// e SÓ DEPOIS transforma para dígito puro — se transformasse antes,
// `refine` receberia só números e não pegaria erro nenhum de formato
// (não que isso mude o resultado aqui, mas a ordem importa se algum dia a
// regra de formato ficar mais específica).
export const checkoutSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo."),
  email: z
    .string()
    .trim()
    .email("E-mail inválido.")
    .transform((v) => v.toLowerCase()),
  phone: z
    .string()
    .trim()
    .refine((v) => {
      const digitos = v.replace(/\D/g, "");
      return digitos.length === 10 || digitos.length === 11;
    }, "Telefone inválido — use DDD + número.")
    .transform((v) => v.replace(/\D/g, "")),
  cpf: z
    .string()
    .trim()
    .refine((v) => cpfValido(v), "CPF inválido — confira os números digitados.")
    .transform((v) => limparCPF(v)),
  cep: z
    .string()
    .trim()
    .refine((v) => /^\d{5}-?\d{3}$/.test(v), "CEP inválido — use o formato 00000-000.")
    .transform((v) => v.replace(/\D/g, "")),
  street: z.string().trim().min(1, "Informe a rua."),
  number: z.string().trim().min(1, "Informe o número."),
  complement: z.string().trim().nullable(),
  neighborhood: z.string().trim().min(1, "Informe o bairro."),
  city: z.string().trim().min(1, "Informe a cidade."),
  state: z
    .string()
    .trim()
    .refine((v) => /^[A-Za-z]{2}$/.test(v), "UF precisa ter 2 letras (ex.: SP).")
    .transform((v) => v.toUpperCase()),
});

// Formato que o CLIENTE envia (antes das transformações de zod) — é o que
// CheckoutForm.tsx monta a partir do estado dos campos.
export type CheckoutInput = z.input<typeof checkoutSchema>;
// Formato já validado/normalizado que a Server Action grava no banco.
export type CheckoutData = z.output<typeof checkoutSchema>;
