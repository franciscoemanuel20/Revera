import { describe, expect, it } from "vitest";
import { SITE_COPY, labelForHref } from "@/lib/i18n/site";

// Regressão (30/09/2026): o bloco `pt` de SITE_COPY estava inteiro sem
// acento, e isso aparecia para o cliente — "Conheca" no menu, "so sao
// ativados se voce aceitar" no banner de cookies, "Inicio" e "Preferencias
// de cookies" nos rótulos lidos por leitor de tela.
describe("copy em português do site tem acentuação", () => {
  const pt = SITE_COPY.pt;

  it("menu e rótulos de navegação", () => {
    expect(pt.menuConheca).toBe("Conheça");
    expect(labelForHref("/", "pt", "inicio")).toBe("Início");
    expect(labelForHref("/produtos", "pt", "x")).toBe("Próteses");
    expect(labelForHref("/sobre-as-proteses", "pt", "x")).toBe("Sobre as próteses");
    expect(labelForHref("/por-que-revera", "pt", "x")).toBe("Por que Reverá");
  });

  it("banner de cookies", () => {
    expect(pt.cookies.aria).toBe("Preferências de cookies");
    expect(pt.cookies.texto).toBe(
      "Usamos cookies necessários para a loja funcionar. Cookies opcionais da Meta e do Google só são ativados se você aceitar.",
    );
  });

  it("nenhuma palavra conhecida volta a aparecer sem acento", () => {
    // Só os VALORES: a chave `menuConheca` contém "Conheca" e não é copy.
    const valores = (no: unknown): string[] =>
      typeof no === "string" ? [no] : Object.values(no as Record<string, unknown>).flatMap(valores);
    const tudo = valores(pt).join(" | ");
    for (const semAcento of ["Conheca", "Inicio", "Protese", "Revera ", "necessarios", " sao ", "voce", "Preferencias"]) {
      expect(tudo, semAcento).not.toContain(semAcento);
    }
  });
});
