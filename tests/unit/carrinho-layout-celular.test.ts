import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Regressão da sacola no celular (30/09/2026): em 375 px a linha do item
// (foto + seletor de quantidade + "remover" + preço) não cabia e, como item
// de flex não encolhe abaixo do conteúdo, a página /carrinho ficava com 438
// px de largura e o preço saía cortado; a gaveta rolava para o lado. A
// correção é a linha quebrar (`flex-wrap`) com o preço descendo alinhado à
// direita (`ml-auto`). Não há renderização de DOM nos testes do projeto —
// este teste lê o fonte, no mesmo padrão de site-i18n.test.ts, e trava as
// classes que impedem a regressão.
const raiz = join(__dirname, "..", "..");

function fonte(caminho: string) {
  return readFileSync(join(raiz, caminho), "utf8");
}

function linhaDoItem(codigo: string, ancora: string) {
  const inicio = codigo.indexOf(ancora);
  expect(inicio, `âncora não encontrada: ${ancora}`).toBeGreaterThan(-1);
  return codigo.slice(inicio, codigo.indexOf("</li>", inicio));
}

describe("sacola no celular não fica mais larga que a tela", () => {
  it("a linha do item em /carrinho quebra e o preço desce alinhado à direita", () => {
    const codigo = fonte("src/app/carrinho/CarrinhoPageClient.tsx");
    const linha = linhaDoItem(codigo, "<li key={item.cartItemId}");

    expect(linha).toContain('className="flex flex-wrap gap-4"');
    expect(linha).toContain('className="flex min-w-0 flex-1 flex-col gap-1"');
    expect(linha).toContain('className="mt-2 flex flex-wrap items-center gap-4"');
    expect(linha).toContain('className="ml-auto text-right"');
  });

  it("a linha do item na gaveta quebra e o preço desce alinhado à direita", () => {
    const codigo = fonte("src/components/ui/CartDrawer.tsx");
    const linha = linhaDoItem(codigo, "<li key={item.id}");

    expect(linha).toContain('className="flex flex-wrap gap-3"');
    expect(linha).toContain('className="min-w-0 flex-1"');
    expect(linha).toContain('className="mt-2 flex flex-wrap items-center gap-4"');
    expect(linha).toContain('<span className="ml-auto">');
  });

  it("o seletor de quantidade continua com alvo de toque de 44 px", () => {
    // A quebra de linha não pode ser "resolvida" encolhendo os botões: o
    // alvo mínimo de toque é regra de acessibilidade do projeto
    // (tailwind.config.ts, token `toque`).
    const codigo = fonte("src/components/ui/QuantitySelector.tsx");
    expect(codigo.match(/min-h-toque min-w-toque/g)?.length).toBe(2);
  });
});
