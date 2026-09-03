import type { ChaveDeTexto, TextoRegistrado } from "../registro";

/**
 * A barra de selos de confiança (TrustBar).
 *
 * ===========================================================================
 * POR QUE ESTE GRUPO EXISTE SOZINHO (03/09/2026)
 * ===========================================================================
 * A TrustBar ("Teste de qualidade antes do envio", "7 dias úteis de
 * garantia") é o ÚNICO conteúdo do site que vive em duas páginas ao mesmo
 * tempo: a home (src/app/page.tsx) e a página de produto
 * (src/app/produtos/[slug]/ProdutoInterativo.tsx).
 *
 * O cabeçalho de registro/home.ts já avisava por que ela não podia entrar
 * junto do resto da home: se estas chaves morassem no grupo "home", editar
 * pela home mudaria só a home, e a página de produto passaria a dizer outra
 * coisa sobre a mesma garantia — o site falando duas verdades sobre um fato
 * único.
 *
 * A regra do painel é "uma `pagina` = um grupo = uma consulta ao banco"
 * (ver src/lib/conteudo/textos.ts). Dar à TrustBar uma `pagina` própria
 * ("trustbar") faz as duas páginas lerem EXATAMENTE as mesmas chaves: a
 * edição é uma só, guardada uma vez, e aparece nos dois lugares. Apagar a
 * linha do banco devolve o texto do código nos dois lugares também — a mesma
 * regra de fallback de todo o resto do registro.
 *
 * ===========================================================================
 * O TEXTO PADRÃO É FATO, NÃO COPY
 * ===========================================================================
 * Os dois itens vêm do fato de garantia dado pelo Francisco (mesmo texto de
 * seeds/faq.json, pergunta "Como funciona a garantia?"). Não invente item
 * novo aqui sem confirmar o fato primeiro — é o mesmo aviso que já estava no
 * componente TrustBar.tsx, agora com a fonte da verdade num lugar só.
 */
export const TRUSTBAR = {
  "trustbar.item1": {
    pagina: "trustbar",
    rotulo: "Selo de confiança 1 (aparece na home e na página do produto)",
    tipo: "texto",
    padrao: "Teste de qualidade antes do envio",
  },
  "trustbar.item2": {
    pagina: "trustbar",
    rotulo: "Selo de confiança 2 (aparece na home e na página do produto)",
    tipo: "texto",
    padrao: "7 dias úteis de garantia",
  },
} as const satisfies Record<string, TextoRegistrado>;

/**
 * As chaves da TrustBar, na ordem em que aparecem na barra. Deriva do próprio
 * TRUSTBAR para não existir uma segunda lista que alguém esquece de atualizar
 * ao acrescentar um selo.
 */
export const CHAVES_TRUSTBAR = Object.keys(TRUSTBAR) as Array<keyof typeof TRUSTBAR>;

/**
 * Monta os itens da TrustBar a partir de um leitor de texto de página.
 *
 * É o que garante, de fato, que a home e a página de produto leiam as MESMAS
 * chaves na MESMA ordem: as duas chamam esta função em vez de cada uma montar
 * a lista à mão. O leitor vem de `textosDaPagina("trustbar")` (ver textos.ts),
 * então já traz a edição do painel por cima do padrão do código.
 *
 * O tipo do parâmetro é `LeitorDeTexto` de textos.ts sem importá-lo, para não
 * criar um ciclo com a camada de leitura — é a mesma assinatura, só que
 * descrita aqui de forma estrutural.
 */
export function itensDaTrustBar(t: (chave: ChaveDeTexto) => string): Array<{ label: string }> {
  return CHAVES_TRUSTBAR.map((chave) => ({ label: t(chave) }));
}
