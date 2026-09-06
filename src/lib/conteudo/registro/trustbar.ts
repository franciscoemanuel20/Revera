import type { TextoRegistrado } from "../registro";

/**
 * A barra de selos (TrustBar) — grupo PRÓPRIO, de propósito (06/09/2026).
 *
 * ===========================================================================
 * POR QUE NÃO ENTRA EM `home.ts` NEM EM UM REGISTRO POR PRODUTO
 * ===========================================================================
 * A TrustBar aparece na home E na página de todo produto, com o MESMO texto
 * — é a garantia da marca, não uma promessa por produto. Se ela vivesse em
 * `HOME`, editar pela tela de textos da home mudaria a home e deixaria a
 * página do produto (que é a que vende) com o texto velho até o cache
 * expirar sozinho. O comentário em `home.ts` já avisava disso desde 30/08 e
 * adiou o trabalho "para a rodada seguinte, com calma" — esta é ela.
 *
 * `pagina: "trustbar"` é o grupo compartilhado: uma edição aqui vale para
 * TODOS os lugares que chamam `textosDaPagina("trustbar")`, hoje a home e
 * `/produtos/[slug]`. `revalidarRotas()` (admin/textos/actions.ts) invalida
 * as duas rotas quando alguém salva um destes textos — ver o `if (pagina ===
 * "trustbar")` lá.
 *
 * ===========================================================================
 * POR QUE SÃO DUAS CHAVES, E NÃO UMA LISTA
 * ===========================================================================
 * O tipo do registro é chave→texto único, igual a todo o resto do sistema.
 * Uma chave "trustbar.itens" guardando os dois selos juntos, separados por
 * quebra de linha ou vírgula, criaria um formato só desta chave para o
 * painel entender e para quem editar não errar sem querer — contra a regra
 * do arquivo pai ("O QUE O PAINEL DESENHA... nunca invente formato novo").
 * Duas chaves, `trustbar.item1` e `trustbar.item2`, são cada uma uma caixa
 * de texto comum, e crescer para um terceiro selo é só acrescentar
 * `trustbar.item3` aqui — nunca reinterpretar um texto existente.
 */
export const TRUSTBAR = {
  "trustbar.item1": {
    pagina: "trustbar",
    rotulo: "Selo de confiança 1 (aparece na home e em todo produto)",
    tipo: "texto",
    padrao: "Teste de qualidade antes do envio",
  },
  "trustbar.item2": {
    pagina: "trustbar",
    rotulo: "Selo de confiança 2 (aparece na home e em todo produto)",
    tipo: "texto",
    padrao: "7 dias úteis de garantia",
  },
} as const satisfies Record<string, TextoRegistrado>;
