import { describe, expect, it } from "vitest";
import { motivoDeImagemInvalida } from "@/lib/conteudo/midia";
import { REGISTRO, type ChaveDeTexto } from "@/lib/conteudo/registro";

/**
 * A foto de uma página passou a ser editável pelo painel em 02/09/2026
 * (tipo: "imagem" no registro). Isso criou um caminho novo para um valor
 * escolhido por uma pessoa chegar dentro do `src` de um <Image> do Next.
 *
 * E o next/image não degrada: `src` que ele não aceita não deixa a foto
 * quebrada, derruba a PÁGINA inteira. Isso contraria a promessa que governa
 * todo o conteúdo editável — "nenhuma edição no painel consegue derrubar a
 * página" (cabeçalho da migration 12).
 *
 * A defesa é recusar o valor na gravação. Estes testes são a prova de que a
 * recusa cobre os casos que de fato chegariam ali.
 */
describe("motivoDeImagemInvalida — o que pode virar src de uma página", () => {
  it("aceita arquivo de public/, que é o padrão de toda foto do registro", () => {
    expect(motivoDeImagemInvalida("/media/base/base-com-fios.jpg")).toBeNull();
    expect(motivoDeImagemInvalida("/media/hero/produto-close-2.jpeg")).toBeNull();
  });

  it("aceita a URL pública do bucket site-media, que é o que o upload devolve", () => {
    expect(
      motivoDeImagemInvalida(
        "https://ngnaemfiytutyplolgxb.supabase.co/storage/v1/object/public/site-media/foto-a1b2c3.jpg"
      )
    ).toBeNull();
  });

  it("recusa vazio — apagar uma foto sem querer não pode deixar a página sem imagem", () => {
    expect(motivoDeImagemInvalida("")).not.toBeNull();
    expect(motivoDeImagemInvalida("   ")).not.toBeNull();
  });

  it("recusa caminho relativo: some em qualquer rota aninhada, sem dar erro", () => {
    expect(motivoDeImagemInvalida("media/base/foto.jpg")).not.toBeNull();
  });

  it("recusa URL de protocolo relativo — parece caminho local e não é", () => {
    expect(motivoDeImagemInvalida("//outro-site.com/foto.jpg")).not.toBeNull();
  });

  it("recusa host de terceiro: não está em images.remotePatterns, então quebraria a página", () => {
    expect(motivoDeImagemInvalida("https://exemplo.com/foto.jpg")).not.toBeNull();
  });

  it("recusa http — remotePatterns só libera https", () => {
    expect(
      motivoDeImagemInvalida(
        "http://ngnaemfiytutyplolgxb.supabase.co/storage/v1/object/public/site-media/foto.jpg"
      )
    ).not.toBeNull();
  });

  it("recusa os buckets privados: a URL assinada deles expira e vira foto quebrada", () => {
    expect(
      motivoDeImagemInvalida(
        "https://ngnaemfiytutyplolgxb.supabase.co/storage/v1/object/public/pedidos-fotos/foto.jpg"
      )
    ).not.toBeNull();
  });

  it("recusa data: e blob:, que o otimizador do Next não processa", () => {
    expect(motivoDeImagemInvalida("data:image/png;base64,iVBORw0KGgo=")).not.toBeNull();
    expect(motivoDeImagemInvalida("blob:https://exemplo.com/abc")).not.toBeNull();
  });
});

/**
 * O `padrao` de uma chave de imagem é a foto que o site mostra quando NUNCA
 * ninguém editou — e é para onde ele volta em "voltar à foto original".
 *
 * Se um `padrao` fosse um valor que a própria validação recusa, o painel
 * ficaria num estado impossível de explicar: a foto no ar, mas nenhuma
 * edição equivalente aceitável.
 */
describe("registro — toda foto declarada no código é um src válido", () => {
  const chavesDeImagem = (Object.keys(REGISTRO) as ChaveDeTexto[]).filter(
    (c) => REGISTRO[c].tipo === "imagem"
  );

  it("existe pelo menos uma foto editável (senão este arquivo não prova nada)", () => {
    expect(chavesDeImagem.length).toBeGreaterThan(0);
  });

  it.each(chavesDeImagem)("%s tem um padrão que a validação aceita", (chave) => {
    expect(motivoDeImagemInvalida(REGISTRO[chave].padrao)).toBeNull();
  });
});
