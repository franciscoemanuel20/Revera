import { describe, expect, it } from "vitest";
import { APARENCIA_PADRAO, validarAparenciaDoSite } from "@/lib/site/aparencia";

function aparenciaValida() {
  return {
    ...APARENCIA_PADRAO,
    menuPrincipal: APARENCIA_PADRAO.menuPrincipal.map((link) => ({ ...link })),
    menuConheca: APARENCIA_PADRAO.menuConheca.map((link) => ({ ...link })),
    linkProfissionais: { ...APARENCIA_PADRAO.linkProfissionais },
  };
}

describe("configuração pública do site", () => {
  it("aceita a configuração padrão", () => {
    expect(validarAparenciaDoSite(aparenciaValida()).ok).toBe(true);
  });

  it("recusa esquema javascript em qualquer link público", () => {
    const valor = aparenciaValida();
    valor.menuPrincipal[0]!.href = "javascript:alert(1)";
    expect(validarAparenciaDoSite(valor)).toEqual({
      ok: false,
      error: "Os links do menu principal devem apontar para páginas internas, começando com /.",
    });
  });

  it("aceita Instagram apenas no domínio oficial, sob HTTPS", () => {
    const seguro = aparenciaValida();
    seguro.instagramUrl = "https://www.instagram.com/revera/";
    expect(validarAparenciaDoSite(seguro).ok).toBe(true);

    const inseguro = aparenciaValida();
    inseguro.instagramUrl = "javascript:alert(1)";
    expect(validarAparenciaDoSite(inseguro).ok).toBe(false);
  });
});
