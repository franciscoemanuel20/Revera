import { describe, expect, it } from "vitest";
import {
  TRUSTBAR,
  CHAVES_TRUSTBAR,
  itensDaTrustBar,
} from "@/lib/conteudo/registro/trustbar";
import {
  REGISTRO,
  PAGINAS,
  chavesDaPagina,
  rotaDaPagina,
  type ChaveDeTexto,
} from "@/lib/conteudo/registro";
import { SEM_EDICOES } from "@/lib/conteudo/textos";

/**
 * A TrustBar é o único conteúdo do site que vive em duas páginas ao mesmo
 * tempo (home e página de produto). O grupo "trustbar" existe para as duas
 * lerem EXATAMENTE as mesmas chaves, com a mesma regra de fallback do resto
 * do registro: linha ausente no banco = texto do código.
 *
 * Estes testes são a prova de que o grupo continua compartilhável — uma só
 * fonte, um só padrão, e a edição do painel valendo nos dois lugares.
 */
describe("registro/trustbar — o grupo compartilhado da barra de selos", () => {
  it("existe pelo menos um selo (senão o resto deste arquivo não prova nada)", () => {
    expect(CHAVES_TRUSTBAR.length).toBeGreaterThan(0);
  });

  it("CHAVES_TRUSTBAR deriva de TRUSTBAR, na ordem de declaração", () => {
    // A ordem importa: é a ordem em que os selos aparecem na barra. Derivar do
    // próprio TRUSTBAR (em vez de uma segunda lista à mão) é o que impede uma
    // lista esquecer um selo novo.
    expect(CHAVES_TRUSTBAR).toEqual(Object.keys(TRUSTBAR));
  });

  it("todo selo mora na página 'trustbar' — uma pagina = um grupo = uma consulta", () => {
    // Se um selo tivesse `pagina: 'home'`, editar pela home mudaria só a home
    // e o site passaria a dizer duas coisas sobre a mesma garantia. O grupo
    // próprio é justamente o que impede isso.
    for (const chave of CHAVES_TRUSTBAR) {
      expect(TRUSTBAR[chave].pagina).toBe("trustbar");
    }
  });

  it("o grupo está exportado pelo índice do registro, como qualquer outra página", () => {
    // As chaves precisam existir em REGISTRO (o catálogo que o painel mostra e
    // que ChaveDeTexto sai) — senão a página de leitura nem enxergaria o grupo.
    for (const chave of CHAVES_TRUSTBAR) {
      expect(REGISTRO[chave as ChaveDeTexto]).toBe(TRUSTBAR[chave]);
    }
    // chavesDaPagina('trustbar') deve devolver exatamente as chaves do grupo,
    // na mesma ordem — é como a home e o produto pedem "os selos desta barra".
    expect(chavesDaPagina("trustbar")).toEqual(CHAVES_TRUSTBAR);
  });

  it("a página 'trustbar' tem nome e rota para o painel agrupar e revalidar", () => {
    const pagina = PAGINAS.trustbar;
    expect(pagina).toBeDefined();
    expect(pagina!.nome.length).toBeGreaterThan(0);
    // A rota existe para o painel ter para onde revalidar o cache da home
    // (a página de produto é dinâmica e não depende disso).
    expect(rotaDaPagina("trustbar")).toBe(pagina!.rota);
  });
});

describe("itensDaTrustBar — o que a home e o produto renderizam", () => {
  it("sem banco (SEM_EDICOES) devolve o texto do código — a regra de fallback", () => {
    // É o caminho de "banco fora do ar / migration não aplicada / linha
    // apagada": o site mostra o `padrao` do registro, nunca uma barra vazia.
    const itens = itensDaTrustBar(SEM_EDICOES);
    expect(itens).toEqual(
      CHAVES_TRUSTBAR.map((chave) => ({ label: TRUSTBAR[chave].padrao }))
    );
  });

  it("aplica a edição do painel por cima do padrão, selo a selo", () => {
    // Um leitor como o de textosDaPagina: edição quando existe, padrão quando
    // não. Aqui só o primeiro selo foi editado.
    const primeira = CHAVES_TRUSTBAR[0]!;
    const edicoes = new Map<string, string>([[primeira, "Selo editado no painel"]]);
    const t = (chave: ChaveDeTexto) => edicoes.get(chave) ?? REGISTRO[chave].padrao;

    const itens = itensDaTrustBar(t);
    expect(itens[0]).toEqual({ label: "Selo editado no painel" });
    for (let i = 1; i < CHAVES_TRUSTBAR.length; i++) {
      // Os não editados continuam no texto do código.
      expect(itens[i]).toEqual({ label: TRUSTBAR[CHAVES_TRUSTBAR[i]!].padrao });
    }
  });

  it("home e produto, lendo o MESMO grupo, chegam ao MESMO resultado", () => {
    // As duas páginas chamam esta mesma função com o leitor de
    // textosDaPagina('trustbar'). Dado o mesmo leitor, o resultado é idêntico —
    // é o que garante que a barra nunca diverge entre as duas telas.
    const edicoes = new Map<string, string>([[CHAVES_TRUSTBAR[0]!, "7 dias úteis de garantia"]]);
    const t = (chave: ChaveDeTexto) => edicoes.get(chave) ?? REGISTRO[chave].padrao;

    const naHome = itensDaTrustBar(t);
    const noProduto = itensDaTrustBar(t);
    expect(naHome).toEqual(noProduto);
  });

  it("preserva a ordem dos selos declarada no registro", () => {
    const itens = itensDaTrustBar(SEM_EDICOES);
    expect(itens.map((i) => i.label)).toEqual(
      CHAVES_TRUSTBAR.map((chave) => TRUSTBAR[chave].padrao)
    );
  });
});
