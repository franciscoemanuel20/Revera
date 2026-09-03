import { describe, expect, it } from "vitest";
import { motivoDeImagemInvalida, tipoDeMidiaPelaUrl } from "@/lib/conteudo/midia";

/**
 * A tela de fotos do produto (/admin/produtos/[id], 03/09/2026) grava
 * `product_media` — a primeira vez que o painel escreve nessa tabela; até
 * aqui as fotos do site só existiam porque um script as criou.
 *
 * Duas decisões dessa gravação são feitas por função pura e por isso podem
 * ser provadas aqui: de que TIPO é a mídia, e se a URL pode virar `src` de
 * um <Image> do Next sem derrubar a página do produto.
 */
describe("tipoDeMidiaPelaUrl — o que a coluna type recebe", () => {
  it("trata foto como imagem, que é o caso de todas as fotos do catálogo", () => {
    expect(tipoDeMidiaPelaUrl("/media/cores/1b50.jpg")).toBe("image");
    expect(tipoDeMidiaPelaUrl("/media/produtos/afro.jpg")).toBe("image");
    expect(tipoDeMidiaPelaUrl("/media/hero/produto-close-1.jpeg")).toBe("image");
  });

  it("reconhece vídeo pela extensão — um .mp4 marcado como imagem iria para o next/image e derrubaria a página", () => {
    expect(tipoDeMidiaPelaUrl("/media/hero/implantacao.mp4")).toBe("video");
    expect(tipoDeMidiaPelaUrl("/x/a.webm")).toBe("video");
    expect(tipoDeMidiaPelaUrl("/x/a.MOV")).toBe("video");
  });

  it("ignora query e âncora: a URL do bucket costuma vir com parâmetro de cache", () => {
    expect(tipoDeMidiaPelaUrl("/media/hero/implantacao.mp4?v=2")).toBe("video");
    expect(tipoDeMidiaPelaUrl("/media/cores/5.jpg?v=2")).toBe("image");
    expect(tipoDeMidiaPelaUrl("/media/hero/implantacao.mp4#t=3")).toBe("video");
  });

  it("nome que apenas CONTÉM a extensão no meio não é vídeo", () => {
    expect(tipoDeMidiaPelaUrl("/media/produtos/foto-mp4-final.jpg")).toBe("image");
  });
});

describe("motivoDeImagemInvalida — o que a tela de fotos do produto aceita gravar", () => {
  it("aceita as fotos que vieram com o site, que é o que a tela oferece hoje", () => {
    expect(motivoDeImagemInvalida("/media/cores/1b50.jpg")).toBeNull();
    expect(motivoDeImagemInvalida("/media/produtos/micropele-na-mao.jpg")).toBeNull();
  });

  it("aceita a foto enviada pelo painel", () => {
    expect(
      motivoDeImagemInvalida(
        "https://ngnaemfiytutyplolgxb.supabase.co/storage/v1/object/public/site-media/peca-cor-5-a1b2c3.jpg"
      )
    ).toBeNull();
  });

  it("recusa foto de site de terceiro — o host não está em remotePatterns e a página do produto cairia", () => {
    expect(motivoDeImagemInvalida("https://exemplo.com/peca.jpg")).not.toBeNull();
  });

  it("recusa endereço vazio, relativo e de protocolo relativo", () => {
    expect(motivoDeImagemInvalida("   ")).not.toBeNull();
    expect(motivoDeImagemInvalida("media/cores/5.jpg")).not.toBeNull();
    expect(motivoDeImagemInvalida("//exemplo.com/peca.jpg")).not.toBeNull();
  });
});

/**
 * Achado do Codex em 03/09/2026: a validação conferia protocolo e um TRECHO
 * do caminho, e o caminho quem escreve é quem digita a URL. Host de terceiro
 * com o caminho certo passava aqui e era recusado pelo next/image na hora de
 * renderizar — e o next/image não deixa a foto quebrada, derruba a página.
 */
describe("motivoDeImagemInvalida — o host é conferido, não só o caminho", () => {
  it("recusa host de terceiro que imita o caminho do bucket", () => {
    expect(
      motivoDeImagemInvalida(
        "https://site-de-terceiro.com/storage/v1/object/public/site-media/peca.jpg"
      )
    ).not.toBeNull();
  });

  it("recusa caminho do bucket enfiado no meio de outro caminho", () => {
    expect(
      motivoDeImagemInvalida(
        "https://ngnaemfiytutyplolgxb.supabase.co/qualquer/storage/v1/object/public/site-media/peca.jpg"
      )
    ).not.toBeNull();
  });

  it("continua aceitando a URL que o upload do painel devolve", () => {
    expect(
      motivoDeImagemInvalida(
        "https://ngnaemfiytutyplolgxb.supabase.co/storage/v1/object/public/site-media/peca-a1b2c3.jpg"
      )
    ).toBeNull();
  });
});
