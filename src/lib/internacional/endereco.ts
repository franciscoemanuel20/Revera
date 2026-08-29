import { z } from "zod";
import { ehPaisSuportado, idiomaDoPais, regraDoPais } from "./paises";
import { textos, type Idioma } from "./idioma";

/**
 * Endereço de entrega — um tipo, duas formas.
 *
 * ===========================================================================
 * O PONTO ÚNICO DE DECISÃO (27/08/2026)
 * ===========================================================================
 * Um endereço brasileiro e um americano não são o mesmo objeto com campos
 * faltando: são formas diferentes de descrever onde alguém mora. Rua e
 * número separados, com bairro, é endereçamento brasileiro; "1600
 * Pennsylvania Ave NW, Apt 2" é uma linha só, e bairro não existe.
 *
 * Modelar isso como "os campos brasileiros, alguns opcionais" produz um tipo
 * que mente: nada no tipo impede um endereço americano com bairro nem um
 * brasileiro sem CEP. E como nada impede, cada tela precisa lembrar da
 * regra.
 *
 * A união discriminada resolve na origem. `endereco.pais === "BR"` estreita
 * o tipo, e a partir daí o compilador entrega `cep` e `bairro` como strings
 * garantidas. No ramo internacional, tentar ler `.bairro` nem compila.
 *
 * Consequência prática: existe UM lugar no sistema que pergunta de que país
 * é o endereço — a validação, aqui. Depois disso o código trabalha com um
 * dos dois lados e não pergunta mais.
 */

export interface EnderecoBR {
  pais: "BR";
  destinatario: string;
  empresa: string | null;
  cep: string;
  rua: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  telefone: string;
}

export interface EnderecoInternacional {
  pais: string;
  destinatario: string;
  empresa: string | null;
  linha1: string;
  linha2: string | null;
  cidade: string;
  regiao: string | null;
  codigoPostal: string;
  /** Sempre com DDI, só dígitos. "+1 415 555 0123" vira "14155550123". */
  telefone: string;
}

export type Endereco = EnderecoBR | EnderecoInternacional;

export function ehEnderecoBR(e: Endereco): e is EnderecoBR {
  return e.pais === "BR";
}

/* =========================================================================
 * VALIDAÇÃO
 * =======================================================================*/

const soDigitos = (v: string) => v.replace(/\D/g, "");

/**
 * O telefone internacional não pode usar a regra brasileira (10 ou 11
 * dígitos com DDD). Números variam de 8 dígitos a 15 no padrão E.164, e
 * recusar por tamanho errado deixaria clientes de fora por engano.
 *
 * O piso de 8 existe para pegar campo digitado pela metade; o teto de 15 é
 * o máximo do E.164.
 */
const telefoneInternacional = z
  .string()
  .trim()
  .transform(soDigitos)
  .refine((v) => v.length >= 8 && v.length <= 15, {
    message: "Telefone inválido — inclua o código do país.",
  });

export const enderecoBRSchema = z.object({
  pais: z.literal("BR"),
  destinatario: z.string().trim().min(3, "Informe o nome completo."),
  empresa: z.string().trim().nullable().default(null),
  cep: z
    .string()
    .trim()
    .refine((v) => /^\d{5}-?\d{3}$/.test(v), "CEP inválido — use o formato 00000-000.")
    .transform(soDigitos),
  rua: z.string().trim().min(1, "Informe a rua."),
  numero: z.string().trim().min(1, "Informe o número."),
  complemento: z.string().trim().nullable().default(null),
  bairro: z.string().trim().min(1, "Informe o bairro."),
  cidade: z.string().trim().min(1, "Informe a cidade."),
  uf: z
    .string()
    .trim()
    .refine((v) => /^[A-Za-z]{2}$/.test(v), "UF precisa ter 2 letras (ex.: SP).")
    .transform((v) => v.toUpperCase()),
  telefone: z
    .string()
    .trim()
    .refine((v) => {
      const d = soDigitos(v);
      return d.length === 10 || d.length === 11;
    }, "Telefone inválido — use DDD + número.")
    .transform(soDigitos),
});

/**
 * O schema internacional é uma FÁBRICA por idioma, não um const.
 *
 * Mensagem de validação é texto que o comprador lê — e quem lê o checkout
 * americano lê inglês. Um schema fixo obrigaria a traduzir a mensagem
 * DEPOIS, no lugar que a exibe, e aí a tradução dependeria de cada tela
 * lembrar de fazê-la. Aqui a mensagem já nasce na língua certa.
 *
 * As duas instâncias são construídas uma vez (o `Map` abaixo) porque montar
 * schema Zod a cada submit é trabalho repetido à toa numa rota de checkout.
 */
function construirSchemaInternacional(idioma: Idioma) {
  const t = textos(idioma);
  const base = z.object({
    pais: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .refine((v) => ehPaisSuportado(v), {
        message: t.erroPaisNaoAtendido,
      }),
    destinatario: z.string().trim().min(3, t.erroNome),
    empresa: z.string().trim().nullable().default(null),
    linha1: z.string().trim().min(1, t.erroEnderecoObrigatorio),
    linha2: z.string().trim().nullable().default(null),
    cidade: z.string().trim().min(1, t.erroCidadeObrigatoria),
    regiao: z.string().trim().nullable().default(null),
    codigoPostal: z.string().trim().min(1, t.erroPostalObrigatorio),
    telefone: telefoneInternacional,
  });

  /**
   * As regras que dependem do país só podem ser aplicadas depois de saber
   * qual é — por isso vêm num `superRefine`, e não no campo.
   */
  return base.superRefine((valor, ctx) => {
    const regra = regraDoPais(valor.pais);
    if (!regra) return; // já reportado pelo refine do campo `pais`

    if (regra.iso === "BR") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pais"],
        message: t.erroEnderecoBrasileiro,
      });
      return;
    }

    if (!regra.postalRegex.test(valor.codigoPostal)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["codigoPostal"],
        message: t.erroPostalInvalido(regra.rotuloPostal, regra.postalExemplo),
      });
    }

    if (regra.exigeRegiao && !valor.regiao) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["regiao"],
        message: t.erroRegiaoObrigatoria(regra.rotuloRegiao ?? t.labelRegiaoPadrao),
      });
    }
  });
}

const SCHEMAS_INTERNACIONAIS = new Map<Idioma, ReturnType<typeof construirSchemaInternacional>>();

export function enderecoInternacionalSchemaDoIdioma(idioma: Idioma) {
  let schema = SCHEMAS_INTERNACIONAIS.get(idioma);
  if (!schema) {
    schema = construirSchemaInternacional(idioma);
    SCHEMAS_INTERNACIONAIS.set(idioma, schema);
  }
  return schema;
}

/** O de sempre, em português — para quem já o importava. */
export const enderecoInternacionalSchema = enderecoInternacionalSchemaDoIdioma("pt");

/**
 * Não existe um `z.discriminatedUnion` exportado aqui de propósito. Ele
 * exigiria uma variante literal por país, montada à mão, e a lista de
 * países é dado (paises.ts), não código. `validarEndereco()` abaixo já faz
 * o despacho pelo país e é a única porta de entrada — um segundo caminho de
 * validação seria a chance de os dois discordarem.
 */

export type ResultadoEndereco =
  | { ok: true; endereco: Endereco }
  | { ok: false; erros: Array<{ campo: string; mensagem: string }> };

/**
 * A porta de entrada. Recebe o que veio do formulário, devolve um endereço
 * com forma garantida — ou a lista de erros, com o campo de cada um.
 */
export function validarEndereco(bruto: unknown): ResultadoEndereco {
  const pais =
    typeof bruto === "object" && bruto !== null && "pais" in bruto
      ? String((bruto as { pais: unknown }).pais ?? "").toUpperCase()
      : "";

  // O idioma da mensagem de erro sai do país do ENDEREÇO — é ele que diz
  // quem vai ler. Endereço brasileiro segue em português por definição.
  const schema =
    pais === "BR" ? enderecoBRSchema : enderecoInternacionalSchemaDoIdioma(idiomaDoPais(pais));
  const r = schema.safeParse({ ...(bruto as object), pais });

  if (!r.success) {
    return {
      ok: false,
      erros: r.error.issues.map((i) => ({
        campo: String(i.path[0] ?? ""),
        mensagem: i.message,
      })),
    };
  }
  return { ok: true, endereco: r.data as Endereco };
}

/* =========================================================================
 * BANCO
 * =======================================================================*/

export interface LinhaEndereco {
  country: string;
  recipient_name: string;
  company: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string | null;
  line1: string | null;
  line2: string | null;
  postal_code: string | null;
  region: string | null;
}

/**
 * Do domínio para a tabela. O lado que não se aplica vai NULO — e não vazio:
 * a constraint `endereco_completo_por_pais` conta com isso, e string vazia
 * passaria por ela sem significar nada.
 */
export function paraLinha(e: Endereco): LinhaEndereco {
  if (ehEnderecoBR(e)) {
    return {
      country: "BR",
      recipient_name: e.destinatario,
      company: e.empresa,
      cep: e.cep,
      street: e.rua,
      number: e.numero,
      complement: e.complemento,
      neighborhood: e.bairro,
      city: e.cidade,
      state: e.uf,
      line1: null,
      line2: null,
      postal_code: null,
      region: null,
    };
  }
  return {
    country: e.pais,
    recipient_name: e.destinatario,
    company: e.empresa,
    cep: null,
    street: null,
    number: null,
    complement: null,
    neighborhood: null,
    city: e.cidade,
    state: null,
    line1: e.linha1,
    line2: e.linha2,
    postal_code: e.codigoPostal,
    region: e.regiao,
  };
}

/** Da tabela para o domínio. Devolve null se a linha estiver incoerente. */
export function daLinha(l: LinhaEndereco, telefone: string): Endereco | null {
  if (l.country === "BR") {
    if (!l.cep || !l.street || !l.number || !l.neighborhood || !l.state) return null;
    return {
      pais: "BR",
      destinatario: l.recipient_name,
      empresa: l.company,
      cep: l.cep,
      rua: l.street,
      numero: l.number,
      complemento: l.complement,
      bairro: l.neighborhood,
      cidade: l.city,
      uf: l.state,
      telefone,
    };
  }
  if (!l.line1 || !l.postal_code) return null;
  return {
    pais: l.country,
    destinatario: l.recipient_name,
    empresa: l.company,
    linha1: l.line1,
    linha2: l.line2,
    cidade: l.city,
    regiao: l.region,
    codigoPostal: l.postal_code,
    telefone,
  };
}

/** Uma linha por vez, para etiqueta, invoice e tela do admin. */
export function formatarEndereco(e: Endereco): string[] {
  if (ehEnderecoBR(e)) {
    return [
      e.destinatario,
      ...(e.empresa ? [e.empresa] : []),
      `${e.rua}, ${e.numero}${e.complemento ? ` — ${e.complemento}` : ""}`,
      e.bairro,
      `${e.cidade} — ${e.uf}`,
      `CEP ${e.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}`,
      "Brasil",
    ];
  }
  const regra = regraDoPais(e.pais);
  return [
    e.destinatario,
    ...(e.empresa ? [e.empresa] : []),
    e.linha1,
    ...(e.linha2 ? [e.linha2] : []),
    [e.cidade, e.regiao, e.codigoPostal].filter(Boolean).join(", "),
    (regra?.nomeEn ?? e.pais).toUpperCase(),
  ];
}
