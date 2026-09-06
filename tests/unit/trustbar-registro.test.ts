import { describe, expect, it } from "vitest";
import {
  REGISTRO,
  chavesDaPagina,
  rotaDaPagina,
  type ChaveDeTexto,
} from "@/lib/conteudo/registro";
import { ITENS_PADRAO } from "@/components/ui/TrustBar";

/**
 * A TrustBar virou grupo compartilhado em 06/09/2026: a mesma edição vale
 * para a home E para toda página de produto — que é a que vende. Antes disso
 * ela vivia hardcoded nos dois lugares, e um comentário em `home.ts` desde
 * 30/08 avisava que fazer isso direito exigia passar pela página do produto
 * também, "com calma" — fica provado aqui que a segunda rota não ficou de
 * fora.
 */
describe("registro — grupo compartilhado da TrustBar", () => {
  it("existem exatamente as duas chaves da TrustBar, e as duas são do grupo 'trustbar'", () => {
    const chaves = chavesDaPagina("trustbar");
    expect(chaves).toEqual(["trustbar.item1", "trustbar.item2"]);
  });

  it("nenhuma delas ficou (de novo) dentro de 'home' — senão editar pela home não afetaria o produto", () => {
    const chavesHome = chavesDaPagina("home") as ChaveDeTexto[];
    expect(chavesHome).not.toContain("trustbar.item1");
    expect(chavesHome).not.toContain("trustbar.item2");
  });

  it("o grupo tem uma rota conhecida (para o painel navegar até ela)", () => {
    expect(rotaDaPagina("trustbar")).toBe("/");
  });

  // A SEGUNDA rota (/produtos/[slug]) não passa por `rotaDaPagina` — ela é
  // um caso especial em `revalidarRotas()` (admin/textos/actions.ts), porque
  // o tipo de PAGINAS só guarda uma rota por página. Não dá para testar a
  // chamada de `revalidatePath` sem o runtime do Next; o que este arquivo
  // pode garantir é que o CONTEÚDO fica correto — a cobertura da segunda
  // rota é o comentário e a leitura de código na revisão, não teste
  // automatizado.

  it("o padrão de cada chave é EXATAMENTE o que o componente já mostrava antes de virar editável", () => {
    // Se estas duas listas divergirem, alguém mudou um lado sem o outro — e
    // o site passaria a mostrar um selo diferente do que o painel diz que é
    // o "original" (o botão "voltar ao original" mentiria).
    //
    // O tamanho é conferido ANTES de indexar (noUncheckedIndexedAccess: cada
    // acesso por índice é `T | undefined`) — pego pela revisão do Codex.
    expect(ITENS_PADRAO).toHaveLength(2);
    const [item1, item2] = ITENS_PADRAO;
    expect(REGISTRO["trustbar.item1"].padrao).toBe(item1?.label);
    expect(REGISTRO["trustbar.item2"].padrao).toBe(item2?.label);
  });

  it("os dois têm tipo 'texto' (caixa de uma linha, não parágrafo nem imagem)", () => {
    expect(REGISTRO["trustbar.item1"].tipo).toBe("texto");
    expect(REGISTRO["trustbar.item2"].tipo).toBe("texto");
  });
});
