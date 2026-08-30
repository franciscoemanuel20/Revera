/**
 * O catálogo do que é editável no site — e o texto original de cada pedaço.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE, EM VEZ DE SEMEAR O BANCO (30/08/2026)
 * ===========================================================================
 * O caminho óbvio seria copiar os ~90 textos do site para dentro de
 * `site_texts` e deixar o painel listar a tabela. Ele tem dois defeitos, e
 * os dois só aparecem meses depois:
 *
 * 1. O painel começaria VAZIO até alguém rodar o seed — e um painel vazio
 *    parece quebrado para quem não sabe o que é um seed.
 * 2. O texto passaria a existir em dois lugares sem ninguém mandando nos
 *    dois. Alguém edita a página no código, o banco continua com a versão
 *    velha, e o site mostra a velha. O seed teria que ser refeito à mão a
 *    cada mudança, e não seria.
 *
 * Aqui o código declara o que é editável e qual é o original. O banco guarda
 * SÓ as alterações. O painel mostra este registro, não a tabela — então ele
 * nunca fica vazio, nunca fica desatualizado, e apagar a linha do banco é o
 * que devolve o texto original.
 *
 * ===========================================================================
 * A CHAVE É CONTRATO
 * ===========================================================================
 * Uma vez publicada, a chave não muda: ela é o que liga a edição do
 * Francisco ao lugar na página. Renomear "garantia.passo1" para
 * "garantia.teste.passo1" faz a edição dele sumir da tela sem aviso — o
 * texto volta ao original e ninguém entende por quê.
 *
 * Para APOSENTAR um texto, tire a entrada daqui e apague a linha do banco.
 * Para MOVER, mantenha a chave.
 *
 * ===========================================================================
 * O TIPO É A TRAVA
 * ===========================================================================
 * `ChaveDeTexto` sai deste objeto, então `t("cuidados.titlo")` não compila.
 * É a mesma escolha do dicionário de idiomas: erro de digitação em chave de
 * texto produziria um espaço em branco na página, e espaço em branco é o
 * defeito que ninguém vê até um cliente ver.
 */

import { CUIDADOS } from "./registro/cuidados";
import { PORQUE } from "./registro/porque";
import { NATURALIDADE } from "./registro/naturalidade";
import { SOBRE } from "./registro/sobre";
import { PROFISSIONAIS } from "./registro/profissionais";
import { GARANTIA } from "./registro/garantia";
import { HOME } from "./registro/home";

export interface TextoRegistrado {
  /** Em que página ele aparece. É como o painel agrupa. */
  pagina: string;
  /** O rótulo em português que o painel mostra. Nunca a chave crua. */
  rotulo: string;
  /** Caixa de uma linha ou área grande. */
  tipo: "texto" | "paragrafo";
  /** O texto que está no site hoje, e que volta quando a edição é apagada. */
  padrao: string;
}

/**
 * Os nomes das páginas, como o painel mostra. Separado do registro para o
 * painel não precisar adivinhar um título a partir do identificador.
 */
export interface PaginaRegistrada {
  /** Como o painel chama esta página. */
  nome: string;
  /**
   * A rota pública correspondente.
   *
   * Mora aqui, e não numa lista à parte no admin, porque uma lista à parte
   * é uma lista que alguém esquece: a página nova entraria no registro, o
   * texto apareceria no painel, salvar funcionaria — e a alteração só
   * apareceria no site quando o cache expirasse sozinho, até uma hora
   * depois. Um defeito que se manifesta como "o painel não funciona" sem
   * nada dar erro.
   *
   * Junto do nome, esquecer fica difícil: quem cadastra a página é obrigado
   * pelo tipo a dizer onde ela mora.
   */
  rota: string;
}

export const PAGINAS: Record<string, PaginaRegistrada> = {
  home: { nome: "Página inicial", rota: "/" },
  cuidados: { nome: "Cuidados com a prótese", rota: "/cuidados" },
  porque: { nome: "Por que a Reverá", rota: "/por-que-revera" },
  naturalidade: { nome: "Naturalidade", rota: "/naturalidade" },
  sobre: { nome: "Sobre as próteses", rota: "/sobre-as-proteses" },
  profissionais: { nome: "Para profissionais", rota: "/para-profissionais" },
  garantia: { nome: "Garantia", rota: "/garantia" },
};

/**
 * O registro é montado a partir de UM ARQUIVO POR PÁGINA, em
 * `registro/`. É organização, mas também é o que permite duas pessoas (ou
 * dois agentes) migrarem páginas diferentes ao mesmo tempo sem disputar o
 * mesmo arquivo.
 *
 * A ordem do spread é a ordem em que as páginas aparecem no painel.
 */
export const REGISTRO = {
  ...HOME,
  ...CUIDADOS,
  ...PORQUE,
  ...NATURALIDADE,
  ...SOBRE,
  ...PROFISSIONAIS,
  ...GARANTIA,
};

export type ChaveDeTexto = keyof typeof REGISTRO;

/** As chaves de uma página, na ordem em que foram declaradas aqui. */
export function chavesDaPagina(pagina: string): ChaveDeTexto[] {
  return (Object.keys(REGISTRO) as ChaveDeTexto[]).filter(
    (c) => REGISTRO[c].pagina === pagina
  );
}

/** As páginas que têm algum texto editável, na ordem de declaração. */
export function paginasComTexto(): string[] {
  const vistas: string[] = [];
  for (const chave of Object.keys(REGISTRO) as ChaveDeTexto[]) {
    const p = REGISTRO[chave].pagina;
    if (!vistas.includes(p)) vistas.push(p);
  }
  return vistas;
}

export function nomeDaPagina(pagina: string): string {
  return PAGINAS[pagina]?.nome ?? pagina;
}

/** A rota pública de uma página, para o painel mandar revalidar o cache. */
export function rotaDaPagina(pagina: string): string | null {
  return PAGINAS[pagina]?.rota ?? null;
}
