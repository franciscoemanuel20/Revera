/**
 * O texto do site, com o código como chão.
 *
 * ===========================================================================
 * A REGRA, EM UMA FRASE (30/08/2026)
 * ===========================================================================
 * O texto original mora no código, em `registro.ts`. Esta camada só aplica
 * por cima o que o Francisco EDITOU no painel. Não existe caminho em que a
 * página fique sem texto.
 *
 * Banco fora do ar, migration não aplicada, linha apagada por engano,
 * consulta barrada por permissão: em todos esses casos o site mostra o que
 * sempre mostrou, porque o original nunca saiu de dentro do código.
 *
 * ===========================================================================
 * UMA CONSULTA POR PÁGINA, NÃO UMA POR TEXTO
 * ===========================================================================
 * Uma página tem dezenas de pedaços. Buscar um a um seriam dezenas de idas
 * ao banco para desenhar uma tela — cada uma podendo falhar sozinha e
 * produzindo a pior tela possível: metade editada, metade original, sem
 * ninguém entender por quê.
 *
 * Aqui a página busca tudo de uma vez. Uma ida, um resultado, e a falha é
 * total ou nenhuma: ou veio a edição inteira, ou vale o código inteiro.
 */

import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { REGISTRO, type ChaveDeTexto } from "./registro";

/**
 * O leitor de texto de uma página.
 *
 * Recebe só a chave: o texto original vem do registro, não de um argumento.
 * Assim não existe a chance de dois lugares passarem padrões diferentes para
 * a mesma chave — que é como um site começa a dizer duas coisas.
 */
export type LeitorDeTexto = (chave: ChaveDeTexto) => string;

/**
 * O cliente daqui NÃO lê cookie — e isso é a diferença entre uma página
 * estática e uma consulta por visitante.
 *
 * O cliente padrão do projeto (`@/lib/supabase/server`) usa `cookies()` para
 * carregar a sessão. Qualquer página que o chame vira dinâmica no Next, e a
 * primeira versão disto fez exatamente isso: /cuidados, /garantia,
 * /naturalidade, /por-que-revera e /sobre-as-proteses eram HTML pronto e
 * passaram a bater no banco a cada visita. Passou no build, passou nos
 * testes, e teria aparecido só na conta.
 *
 * Aqui não há sessão para ler: `site_texts` tem policy de leitura pública,
 * então a chave anon sozinha basta. Sem cookie, a página volta a ser gerada
 * uma vez e servida pronta — e `revalidate` volta a significar alguma coisa.
 */
function clienteDeLeitura() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createSupabaseJsClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Busca as edições de uma página. NUNCA lança.
 *
 * Um erro aqui viraria página de erro num site perfeitamente capaz de se
 * mostrar com o texto do código — trocaria um defeito pequeno por um grande.
 */
export async function edicoesDaPagina(pagina: string): Promise<Map<string, string>> {
  try {
    const supabase = clienteDeLeitura();
    if (!supabase) return new Map();
    const { data, error } = await supabase
      .from("site_texts")
      .select("chave, valor")
      .eq("pagina", pagina);

    if (error || !data) return new Map();

    return new Map(
      data
        // Valor em branco conta como "não editado". Salvar vazio é o jeito
        // mais provável de alguém apagar um título sem querer, e o resultado
        // disso não pode ser um H1 invisível.
        .filter((l) => typeof l.valor === "string" && l.valor.trim() !== "")
        .map((l) => [l.chave as string, l.valor as string])
    );
  } catch {
    // Silêncio proposital: o caminho bom (texto do código) já existe.
    return new Map();
  }
}

/** Carrega as edições e devolve o leitor pronto para a página usar. */
export async function textosDaPagina(pagina: string): Promise<LeitorDeTexto> {
  const edicoes = await edicoesDaPagina(pagina);
  return (chave) => edicoes.get(chave) ?? REGISTRO[chave].padrao;
}

/**
 * O leitor que não consulta nada — só os originais.
 *
 * Serve para teste e para página que ainda não precisa do banco: o
 * componente já pode chamar `t()` antes de existir uma linha sequer.
 */
export const SEM_EDICOES: LeitorDeTexto = (chave) => REGISTRO[chave].padrao;
