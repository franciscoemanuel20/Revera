import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_LOCALE,
  labelForHref,
  isFullyLocalizedPath,
  localeSwitchPath,
  localeFromAcceptLanguage,
  localeFromPath,
  localizePath,
  normalizeSiteLocale,
  stripLocaleFromPath,
} from "@/lib/i18n/site";
import { traducaoDeConteudo } from "@/lib/i18n/conteudo-publico";

describe("i18n publico do site", () => {
  it("normaliza idioma do navegador para as linguas publicas da Revera", () => {
    expect(normalizeSiteLocale("pt-BR")).toBe("pt");
    expect(normalizeSiteLocale("en-US")).toBe("en");
    expect(normalizeSiteLocale("es-ES")).toBe("es");
    expect(normalizeSiteLocale("fr-FR")).toBe("fr");
    expect(normalizeSiteLocale("de-DE")).toBe("de");
    expect(normalizeSiteLocale("it-IT")).toBeNull();
  });

  it("le o Accept-Language na ordem enviada pelo navegador", () => {
    expect(localeFromAcceptLanguage("es-ES,es;q=0.9,en;q=0.8")).toBe("es");
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9,en-US;q=0.8")).toBe("de");
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9")).toBe("fr");
    expect(localeFromAcceptLanguage("it-IT,it;q=0.9")).toBe(DEFAULT_SITE_LOCALE);
  });

  it("respeita o peso q do Accept-Language antes da ordem textual", () => {
    expect(localeFromAcceptLanguage("pt-BR;q=0.1,en-US;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("es-ES;q=0,en-US;q=0.5,pt-BR;q=0.4")).toBe("en");
  });

  it("reconhece e remove prefixo de idioma da URL", () => {
    expect(localeFromPath("/en/produtos")).toBe("en");
    expect(localeFromPath("/EN/produtos")).toBe("en");
    expect(localeFromPath("/es")).toBe("es");
    expect(localeFromPath("/fr/garantia")).toBe("fr");
    expect(localeFromPath("/de/garantia")).toBe("de");
    expect(localeFromPath("/produtos")).toBeNull();
    expect(localeFromPath("/en-US/produtos")).toBeNull();
    expect(localeFromPath("/pt-BR/produtos")).toBeNull();
    expect(stripLocaleFromPath("/en/produtos")).toBe("/produtos");
    expect(stripLocaleFromPath("/EN/produtos")).toBe("/produtos");
    expect(stripLocaleFromPath("/es")).toBe("/");
    expect(stripLocaleFromPath("/en-US/produtos")).toBe("/en-US/produtos");
  });

  it("gera URLs publicas com prefixo so quando precisa", () => {
    expect(localizePath("/produtos", "pt")).toBe("/produtos");
    expect(localizePath("/produtos", "en")).toBe("/en/produtos");
    expect(localizePath("/produtos", "fr")).toBe("/fr/produtos");
    expect(localizePath("/produtos", "de")).toBe("/de/produtos");
    expect(localizePath("/es/produtos", "en")).toBe("/en/produtos");
    expect(localizePath("/", "es")).toBe("/es");
  });

  it("gera URLs explicitas para troca manual, inclusive de volta ao portugues", () => {
    expect(localeSwitchPath("/en/produtos", "pt")).toBe("/pt/produtos");
    expect(localeSwitchPath("/es/produtos", "en")).toBe("/en/produtos");
    expect(localeSwitchPath("/", "pt")).toBe("/pt");
  });

  it("traduz labels da navegacao por href, sem depender do texto editado no admin", () => {
    expect(labelForHref("/produtos", "en", "Proteses")).toBe("Hair systems");
    expect(labelForHref("/produtos", "es", "Proteses")).toBe("Protesis capilares");
    expect(labelForHref("/produtos", "fr", "Proteses")).toBe("Protheses capillaires");
    expect(labelForHref("/produtos", "de", "Proteses")).toBe("Haarsysteme");
    expect(labelForHref("/rota-nova", "en", "Fallback")).toBe("Fallback");
  });

  it("traduz conteudo registrado das paginas publicas sem mexer no portugues", () => {
    expect(traducaoDeConteudo("cuidados.titulo", "pt")).toBeNull();
    expect(traducaoDeConteudo("cuidados.titulo", "en")).toBe("Hair system care");
    expect(traducaoDeConteudo("garantia.passo5.destaque", "es")).toBe("detente ahi");
    expect(traducaoDeConteudo("garantia.passo5.destaque", "fr")).toBe("arretez-vous la");
    expect(traducaoDeConteudo("garantia.passo5.destaque", "de")).toBe("stoppen Sie hier");
  });

  it("limita rotas que podem receber redirecionamento automatico de idioma", () => {
    expect(isFullyLocalizedPath("/")).toBe(true);
    expect(isFullyLocalizedPath("/produtos")).toBe(true);
    expect(isFullyLocalizedPath("/en/produtos")).toBe(true);
    expect(isFullyLocalizedPath("/garantia")).toBe(true);
    expect(isFullyLocalizedPath("/por-que-revera")).toBe(true);
    expect(isFullyLocalizedPath("/cuidados")).toBe(false);
    expect(isFullyLocalizedPath("/produtos/micropele-008")).toBe(false);
  });
});
