import { z } from "zod";
import { cpfValido, limparCPF } from "@/lib/format/cpf";

/**
 * Um texto de rastreamento, ou nada.
 *
 * O teto de 500 caracteres não é estética: sem ele, alguém pode mandar um
 * utm_campaign de dez megabytes e inflar a tabela de pedidos. Cinco centenas
 * cobre com folga qualquer nome de campanha real.
 */
const textoCurto = z.string().max(500).nullable().optional().catch(null);

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
  /**
   * País de entrega. Default 'BR' — e hoje esse é o único valor que o
   * checkout público oferece, porque não há como cobrar cliente
   * estrangeiro (ver paisesDoCheckout() em src/lib/internacional/paises.ts).
   *
   * O campo existe assim mesmo, e não "quando abrir o internacional",
   * porque é ele que carrega o país até o banco. Um pedido gravado sem país
   * viraria adivinhação depois.
   *
   * As validações abaixo (CPF, CEP, UF, bairro) continuam BRASILEIRAS e
   * continuam obrigatórias, exatamente como antes desta mudança: enquanto
   * `country` for 'BR', nada no comportamento nacional muda. O caminho
   * internacional tem validação própria, em src/lib/internacional/endereco.ts,
   * e não passa por este schema.
   */
  country: z
    .string()
    .trim()
    .default("BR")
    .transform((v) => v.toUpperCase())
    .refine((v) => v === "BR", "Ainda entregamos apenas no Brasil."),
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

  /**
   * Atribuição — de onde veio a pessoa. Opcional em tudo: bloqueador de
   * anúncio, navegação privada e visita orgânica deixam estes campos vazios,
   * e nada disso pode impedir alguém de comprar.
   *
   * Aceitar isto do navegador é seguro porque NADA aqui vale dinheiro: são
   * sinais de medição. O pior que alguém consegue mentindo é sujar o próprio
   * relatório. (Compare com `total`, que jamais é aceito do cliente — ver a
   * docstring de actions.ts.)
   *
   * `.catch(null)` em vez de erro de validação: um cookie estranho não pode
   * derrubar um checkout. Perde-se a atribuição daquele pedido; não se perde
   * a venda.
   */
  atribuicao: z
    .object({
      fbp: textoCurto,
      fbc: textoCurto,
      gaClientId: textoCurto,
      fbclid: textoCurto,
      gclid: textoCurto,
      utmSource: textoCurto,
      utmMedium: textoCurto,
      utmCampaign: textoCurto,
      utmContent: textoCurto,
      utmTerm: textoCurto,
    })
    .nullable()
    .optional()
    .catch(null),
});

// Formato que o CLIENTE envia (antes das transformações de zod) — é o que
// CheckoutForm.tsx monta a partir do estado dos campos.
export type CheckoutInput = z.input<typeof checkoutSchema>;
// Formato já validado/normalizado que a Server Action grava no banco.
export type CheckoutData = z.output<typeof checkoutSchema>;
