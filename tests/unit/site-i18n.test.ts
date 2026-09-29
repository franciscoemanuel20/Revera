import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { middleware } from "@/middleware";
import { CATALOGO_COPY, hrefAjudaCorCatalogo } from "@/app/produtos/ProdutosContent";
import {
  DEFAULT_SITE_LOCALE,
  LOCALE_COOKIE,
  LOCALE_HEADER,
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

  it("middleware mantem o dominio sem prefixo em portugues por padrao", () => {
    const request = new NextRequest("https://www.reveraprotesecapilar.com/produtos", {
      headers: { "accept-language": "de-DE,de;q=0.9" },
    });

    const response = middleware(request);

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("pt");
  });

  it("middleware redireciona rota plenamente localizada quando existe escolha manual em cookie", () => {
    const request = new NextRequest("https://www.reveraprotesecapilar.com/cores");
    request.cookies.set(LOCALE_COOKIE, "en");

    const response = middleware(request);

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("en");

    const produtos = new NextRequest("https://www.reveraprotesecapilar.com/produtos");
    produtos.cookies.set(LOCALE_COOKIE, "en");

    expect(middleware(produtos).headers.get("location")).toBe(
      "https://www.reveraprotesecapilar.com/en/produtos"
    );
  });

  it("middleware preserva rotas localizadas diretas que ainda existem", () => {
    const response = middleware(new NextRequest("https://www.reveraprotesecapilar.com/en/produtos"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("en");
  });

  it("middleware preserva garantia localizada e limpa o prefixo portugues", () => {
    const localizada = middleware(new NextRequest("https://www.reveraprotesecapilar.com/es/garantia"));
    const portugues = middleware(new NextRequest("https://www.reveraprotesecapilar.com/pt/produtos"));

    expect(localizada.headers.get("location")).toBeNull();
    expect(localizada.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("es");
    expect(portugues.headers.get("location")).toBe("https://www.reveraprotesecapilar.com/produtos");
  });

  it("middleware grava idioma manual antes de limpar rota nao localizada", () => {
    const response = middleware(new NextRequest("https://www.reveraprotesecapilar.com/en/cores"));

    expect(response.headers.get("location")).toBe("https://www.reveraprotesecapilar.com/cores");
    expect(response.headers.get("set-cookie")).toContain(`${LOCALE_COOKIE}=en`);
  });

  it("mantem selos comerciais traduzidos no catalogo localizado", () => {
    const provasPt = CATALOGO_COPY.pt.provas;

    expect(CATALOGO_COPY.en.provas).not.toEqual(provasPt);
    expect(CATALOGO_COPY.es.provas).not.toEqual(provasPt);
    expect(CATALOGO_COPY.fr.provas).not.toEqual(provasPt);
    expect(CATALOGO_COPY.de.provas).not.toEqual(provasPt);
    expect(CATALOGO_COPY.en.provas).toContain("Shipping across Brazil");
    expect(CATALOGO_COPY.es.provas).toContain("Envio a todo Brasil");
    expect(CATALOGO_COPY.fr.provas).toContain("Livraison dans tout le Bresil");
    expect(CATALOGO_COPY.de.provas).toContain("Versand in ganz Brasilien");
  });

  it("nao envia catalogo localizado para ajuda de cor ainda portuguesa", () => {
    expect(hrefAjudaCorCatalogo("pt")).toBe("/cores#ajuda");
    expect(hrefAjudaCorCatalogo("en")).toBeNull();
    expect(hrefAjudaCorCatalogo("es")).toBeNull();
    expect(hrefAjudaCorCatalogo("fr")).toBeNull();
    expect(hrefAjudaCorCatalogo("de")).toBeNull();
  });

  it("mantem ajuda de cor pre-compra dentro do site, sem puxar WhatsApp", () => {
    const coresPage = readFileSync(join(process.cwd(), "src/app/cores/page.tsx"), "utf8");

    expect(CATALOGO_COPY.pt.heroCtaSecundario).toBe("Ver guia de cores");
    expect(CATALOGO_COPY.pt.provaTexto).toContain("a equipe confere antes do envio");
    expect(CATALOGO_COPY.pt.guiaTexto).toContain("Escolha a cor mais próxima agora");
    expect(CATALOGO_COPY.pt.guiaTexto).toContain("peça separada bate com a cor escolhida");
    expect(coresPage).not.toContain("ColorHelpForm");
    expect(coresPage).not.toContain("WhatsApp");
    expect(coresPage).toContain("Escolha a cor mais próxima e siga para a compra");
    expect(coresPage).toContain("peça separada bate com a cor escolhida");
  });
});
