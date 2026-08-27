import { describe, it, expect } from "vitest";
import {
  DESTINO_SEM_PRODUTO,
  escolherProdutoVitrine,
  linkDoProdutoVitrine,
  produtoEstaVendavel,
  type ProdutoVitrine,
} from "@/lib/catalog/vitrine";

/**
 * P0-1 — a home levava a 404 porque o slug estava fixo no código e ninguém
 * perguntava se o produto existia. Estes testes protegem o risco financeiro
 * de duas coisas distintas:
 *
 *   1. link morto no botão "Comprar agora" (perde 100% das vendas);
 *   2. produto ativado sem preço, que venderia a peça de R$ 1.600 por R$ 0.
 */

function produto(over: Partial<ProdutoVitrine> = {}): ProdutoVitrine {
  return {
    slug: "micropele-008",
    name: "Micropele 0,08mm",
    isFeatured: false,
    sortOrder: 0,
    variants: [{ isActive: true, priceCents: 160000, stockQty: 5 }],
    ...over,
  };
}

describe("produtoEstaVendavel", () => {
  it("aceita produto com variante ativa, com preço e com estoque", () => {
    expect(produtoEstaVendavel(produto())).toBe(true);
  });

  it("RECUSA preço zero — foi o estado real encontrado na auditoria de 26/08", () => {
    const p = produto({
      variants: [{ isActive: true, priceCents: 0, stockQty: 10 }],
    });
    expect(produtoEstaVendavel(p)).toBe(false);
  });

  it("recusa preço negativo", () => {
    const p = produto({
      variants: [{ isActive: true, priceCents: -1, stockQty: 10 }],
    });
    expect(produtoEstaVendavel(p)).toBe(false);
  });

  it("recusa variante inativa mesmo com preço válido", () => {
    const p = produto({
      variants: [{ isActive: false, priceCents: 160000, stockQty: 10 }],
    });
    expect(produtoEstaVendavel(p)).toBe(false);
  });

  it("recusa quando não há estoque", () => {
    const p = produto({
      variants: [{ isActive: true, priceCents: 160000, stockQty: 0 }],
    });
    expect(produtoEstaVendavel(p)).toBe(false);
  });

  it("produto sem variante nenhuma não é vendável", () => {
    expect(produtoEstaVendavel(produto({ variants: [] }))).toBe(false);
  });

  it("basta UMA variante boa entre várias ruins", () => {
    const p = produto({
      variants: [
        { isActive: true, priceCents: 0, stockQty: 10 },
        { isActive: false, priceCents: 160000, stockQty: 10 },
        { isActive: true, priceCents: 160000, stockQty: 1 },
      ],
    });
    expect(produtoEstaVendavel(p)).toBe(true);
  });
});

describe("escolherProdutoVitrine", () => {
  it("devolve null quando nada é vendável — o estado da loja hoje", () => {
    const draft = produto({
      variants: [{ isActive: false, priceCents: 0, stockQty: 10 }],
    });
    expect(escolherProdutoVitrine([draft])).toBeNull();
  });

  it("lista vazia devolve null, não quebra", () => {
    expect(escolherProdutoVitrine([])).toBeNull();
  });

  it("o destacado ganha, mesmo com sort_order pior", () => {
    const comum = produto({ slug: "a", name: "A", sortOrder: 1 });
    const destacado = produto({
      slug: "b",
      name: "B",
      sortOrder: 99,
      isFeatured: true,
    });
    expect(escolherProdutoVitrine([comum, destacado])?.slug).toBe("b");
  });

  it("sem destaque, vence o menor sort_order", () => {
    const a = produto({ slug: "a", name: "A", sortOrder: 5 });
    const b = produto({ slug: "b", name: "B", sortOrder: 2 });
    expect(escolherProdutoVitrine([a, b])?.slug).toBe("b");
  });

  it("empate em tudo desempata por nome, para a home não trocar sozinha", () => {
    const z = produto({ slug: "z", name: "Zebra" });
    const a = produto({ slug: "a", name: "Abacate" });
    expect(escolherProdutoVitrine([z, a])?.slug).toBe("a");
    expect(escolherProdutoVitrine([a, z])?.slug).toBe("a");
  });

  it("ignora o destacado quando ele não é vendável e cai no próximo", () => {
    const destacadoSemPreco = produto({
      slug: "destacado",
      name: "Destacado",
      isFeatured: true,
      variants: [{ isActive: true, priceCents: 0, stockQty: 10 }],
    });
    const vendavel = produto({ slug: "vendavel", name: "Vendável" });
    expect(escolherProdutoVitrine([destacadoSemPreco, vendavel])?.slug).toBe(
      "vendavel"
    );
  });

  it("não altera a lista que recebeu", () => {
    const lista = [
      produto({ slug: "a", name: "A", sortOrder: 9 }),
      produto({ slug: "b", name: "B", sortOrder: 1 }),
    ];
    const copia = [...lista];
    escolherProdutoVitrine(lista);
    expect(lista).toEqual(copia);
  });
});

describe("linkDoProdutoVitrine", () => {
  it("monta a URL a partir do slug do banco, não de um valor fixo", () => {
    expect(linkDoProdutoVitrine(produto({ slug: "outro-nome" }))).toBe(
      "/produtos/outro-nome"
    );
  });

  it("sem produto, manda para uma página que existe — nunca para 404", () => {
    expect(linkDoProdutoVitrine(null)).toBe(DESTINO_SEM_PRODUTO);
    expect(DESTINO_SEM_PRODUTO.startsWith("/produtos/")).toBe(false);
  });
});
