import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { middleware } from "@/middleware";
import { CATALOGO_COPY, hrefAjudaCorCatalogo } from "@/app/produtos/ProdutosContent";
import {
  DEFAULT_SITE_LOCALE,
  LOCALE_COOKIE,
  LOCALE_GEO_PENDING_COOKIE,
  LOCALE_MANUAL_COOKIE,
  LOCALE_HEADER,
  labelForHref,
  isFullyLocalizedPath,
  localeSwitchPath,
  localeFromAcceptLanguage,
  localeFromCountry,
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

  it("escolhe o idioma inicial pelo país detectado na borda", () => {
    expect(localeFromCountry("BR")).toBe("pt");
    expect(localeFromCountry("DE")).toBe("de");
    expect(localeFromCountry("FR")).toBe("fr");
    expect(localeFromCountry("MX")).toBe("pt");
    expect(localeFromCountry("US")).toBe("en");
    expect(localeFromCountry(null)).toBe("pt");
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

  it("limita o redirecionamento automatico as rotas integralmente traduzidas", () => {
    expect(isFullyLocalizedPath("/")).toBe(true);
    expect(isFullyLocalizedPath("/produtos")).toBe(true);
    expect(isFullyLocalizedPath("/en/produtos")).toBe(true);
    expect(isFullyLocalizedPath("/garantia")).toBe(true);
    expect(isFullyLocalizedPath("/por-que-revera")).toBe(true);
    expect(isFullyLocalizedPath("/cuidados")).toBe(true);
    expect(isFullyLocalizedPath("/naturalidade")).toBe(true);
    expect(isFullyLocalizedPath("/sobre-as-proteses")).toBe(true);
    expect(isFullyLocalizedPath("/para-profissionais")).toBe(true);
    expect(isFullyLocalizedPath("/produtos/micropele-008")).toBe(true);
    expect(isFullyLocalizedPath("/faq")).toBe(true);
    expect(isFullyLocalizedPath("/cores")).toBe(true);
    expect(isFullyLocalizedPath("/privacidade")).toBe(true);
    expect(isFullyLocalizedPath("/termos")).toBe(true);
    expect(isFullyLocalizedPath("/cookies")).toBe(true);
  });

  it("tem o conteudo editorial principal em frances e alemao", () => {
    for (const locale of ["fr", "de"] as const) {
      for (const chave of [
        "cuidados.titulo",
        "naturalidade.titulo",
        "sobre.titulo",
        "profissionais.titulo",
      ] as const) {
        const valor = traducaoDeConteudo(chave, locale);
        expect(valor, `${locale}.${chave}`).toBeTruthy();
        expect(valor, `${locale}.${chave}`).not.toMatch(/prothese capilar|pr[oó]tese capilar/i);
      }
    }
  });

  it("middleware mantem o dominio sem prefixo em portugues por padrao", () => {
    const request = new NextRequest("https://www.reveraprotesecapilar.com/produtos", {
      headers: { "accept-language": "de-DE,de;q=0.9" },
    });

    const response = middleware(request);

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("pt");
  });

  it("pré-carga de /en, /fr ou /de não grava escolha de idioma", () => {
    for (const [caminho, headers] of [
      ["/en/checkout", { "next-router-prefetch": "1", rsc: "1" }],
      ["/fr/checkout", { purpose: "prefetch" }],
      ["/de", { "sec-purpose": "prefetch" }],
    ] as const) {
      const request = new NextRequest(`https://www.reveraprotesecapilar.com${caminho}`, {
        headers: { ...headers, "x-vercel-ip-country": "BR" },
      });
      const response = middleware(request);
      expect(response.cookies.get(LOCALE_COOKIE)).toBeUndefined();
      expect(response.cookies.get(LOCALE_MANUAL_COOKIE)).toBeUndefined();
    }
  });

  it("pré-carga sem prefixo não redireciona nem marca geolocalização pendente", () => {
    const request = new NextRequest("https://www.reveraprotesecapilar.com/checkout?pais=FR", {
      headers: { "next-router-prefetch": "1", rsc: "1", "x-vercel-ip-country": "US" },
    });
    const response = middleware(request);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get(LOCALE_GEO_PENDING_COOKIE)).toBeUndefined();
  });

  it("marca manual antiga (revera_locale_manual) não prende mais o brasileiro", () => {
    const request = new NextRequest("https://www.reveraprotesecapilar.com/produtos", {
      headers: { "x-vercel-ip-country": "BR" },
    });
    request.cookies.set(LOCALE_COOKIE, "fr");
    request.cookies.set("revera_locale_manual", "1");
    expect(middleware(request).headers.get("location")).toBeNull();
  });

  it("clique de verdade em /en continua gravando a escolha", () => {
    const request = new NextRequest("https://www.reveraprotesecapilar.com/en/checkout", {
      headers: { rsc: "1", "x-vercel-ip-country": "BR" },
    });
    const response = middleware(request);
    expect(response.cookies.get(LOCALE_COOKIE)?.value).toBe("en");
    expect(response.cookies.get(LOCALE_MANUAL_COOKIE)?.value).toBe("1");
  });

  it("só carregamento de página (sec-fetch-dest: document) grava o idioma", () => {
    // Pré-carga e navegação RSC do Next chegam com sec-fetch-dest: empty — e,
    // em produção, sem next-router-prefetch. Não podem regravar o cookie.
    const preCarga = middleware(
      new NextRequest("https://www.reveraprotesecapilar.com/en/produtos?_rsc=x", {
        headers: { rsc: "1", "sec-fetch-dest": "empty", "x-vercel-ip-country": "BR" },
      }),
    );
    expect(preCarga.cookies.get(LOCALE_COOKIE)).toBeUndefined();
    expect(preCarga.cookies.get(LOCALE_MANUAL_COOKIE)).toBeUndefined();

    const pagina = middleware(
      new NextRequest("https://www.reveraprotesecapilar.com/en/produtos", {
        headers: { "sec-fetch-dest": "document", "x-vercel-ip-country": "BR" },
      }),
    );
    expect(pagina.cookies.get(LOCALE_COOKIE)?.value).toBe("en");
    expect(pagina.cookies.get(LOCALE_MANUAL_COOKIE)?.value).toBe("1");
  });

  it("em /en, clicar em PT e pré-cargas atrasadas de /en não devolvem o visitante ao inglês", () => {
    const cliquePt = middleware(
      new NextRequest("https://www.reveraprotesecapilar.com/pt", {
        headers: { "sec-fetch-dest": "document", "x-vercel-ip-country": "US" },
      }),
    );
    expect(cliquePt.headers.get("location")).toBe("https://www.reveraprotesecapilar.com/");
    expect(cliquePt.cookies.get(LOCALE_COOKIE)?.value).toBe("pt");

    const atrasada = middleware(
      new NextRequest("https://www.reveraprotesecapilar.com/en/cores?_rsc=y", {
        headers: { rsc: "1", "sec-fetch-dest": "empty", "x-vercel-ip-country": "US" },
      }),
    );
    expect(atrasada.cookies.get(LOCALE_COOKIE)).toBeUndefined();

    const produtos = new NextRequest("https://www.reveraprotesecapilar.com/produtos", {
      headers: { "sec-fetch-dest": "document", "x-vercel-ip-country": "US" },
    });
    produtos.cookies.set(LOCALE_COOKIE, "pt");
    produtos.cookies.set(LOCALE_MANUAL_COOKIE, "1");
    const resposta = middleware(produtos);
    expect(resposta.headers.get("location")).toBeNull();
    expect(resposta.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("pt");
  });

  it("seletor de idioma do cabeçalho é <a> comum, não <Link>", () => {
    const header = readFileSync(join(process.cwd(), "src/components/ui/Header.tsx"), "utf8");
    const seletor = header.slice(header.indexOf('aria-label="Idioma"'));
    expect(seletor).toMatch(/<a\s+key=\{l\}/);
    expect(seletor.slice(0, seletor.indexOf("</nav>"))).not.toMatch(/<Link\s|<\/Link>/);
  });

  it("POST do Finalizar pedido em /checkout nunca é redirecionado", () => {
    const request = new NextRequest("https://www.reveraprotesecapilar.com/checkout", {
      method: "POST",
      headers: { "next-action": "abc", "x-vercel-ip-country": "BR" },
    });
    request.cookies.set(LOCALE_COOKIE, "en");
    request.cookies.set(LOCALE_MANUAL_COOKIE, "1");
    const response = middleware(request);
    expect(response.headers.get("location")).toBeNull();
  });

  it("middleware ignora cookie antigo e usa o país na entrada sem prefixo", () => {
    const request = new NextRequest("https://www.reveraprotesecapilar.com/cores");
    request.cookies.set(LOCALE_COOKIE, "en");

    const response = middleware(request);

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("pt");

    const produtos = new NextRequest("https://www.reveraprotesecapilar.com/produtos", {
      headers: { "x-vercel-ip-country": "DE" },
    });
    produtos.cookies.set(LOCALE_COOKIE, "pt");

    expect(middleware(produtos).headers.get("location")).toBe(
      "https://www.reveraprotesecapilar.com/de/produtos"
    );
  });

  it.each([
    ["BR", null],
    ["DE", "https://www.reveraprotesecapilar.com/de"],
    ["FR", "https://www.reveraprotesecapilar.com/fr"],
    ["ES", "https://www.reveraprotesecapilar.com/es"],
    ["AR", null],
    ["US", "https://www.reveraprotesecapilar.com/en"],
  ])("abre a home correta para o país %s", (country, location) => {
    const request = new NextRequest("https://www.reveraprotesecapilar.com/", {
      headers: { "x-vercel-ip-country": country },
    });
    expect(middleware(request).headers.get("location")).toBe(location);
  });

  it("preserva uma escolha manual mesmo quando difere do país", () => {
    const escolha = middleware(new NextRequest("https://www.reveraprotesecapilar.com/pt"));
    expect(escolha.headers.get("set-cookie")).toContain(`${LOCALE_MANUAL_COOKIE}=1`);

    const proximaVisita = new NextRequest("https://www.reveraprotesecapilar.com/", {
      headers: { "x-vercel-ip-country": "US" },
    });
    proximaVisita.cookies.set(LOCALE_COOKIE, "pt");
    proximaVisita.cookies.set(LOCALE_MANUAL_COOKIE, "1");

    const response = middleware(proximaVisita);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("pt");
  });

  it("não transforma redirecionamento geográfico em escolha manual permanente", () => {
    const entrada = new NextRequest("https://www.reveraprotesecapilar.com/", {
      headers: { "x-vercel-ip-country": "DE" },
    });
    const redirect = middleware(entrada);
    expect(redirect.headers.get("location")).toBe("https://www.reveraprotesecapilar.com/de");
    expect(redirect.headers.get("set-cookie")).toContain(`${LOCALE_GEO_PENDING_COOKIE}=1`);

    const paginaAposRedirect = new NextRequest("https://www.reveraprotesecapilar.com/de");
    paginaAposRedirect.cookies.set(LOCALE_GEO_PENDING_COOKIE, "1");
    const pagina = middleware(paginaAposRedirect);
    expect(pagina.headers.get("set-cookie")).not.toContain(`${LOCALE_MANUAL_COOKIE}=1`);

    const voltaAoBrasil = new NextRequest("https://www.reveraprotesecapilar.com/", {
      headers: { "x-vercel-ip-country": "BR" },
    });
    voltaAoBrasil.cookies.set(LOCALE_COOKIE, "de");
    const brasileira = middleware(voltaAoBrasil);
    expect(brasileira.headers.get("location")).toBeNull();
    expect(brasileira.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("pt");
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

  it("middleware preserva guia de cores localizado", () => {
    const response = middleware(new NextRequest("https://www.reveraprotesecapilar.com/en/cores"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("en");
  });

  it("mantem selos comerciais traduzidos no catalogo localizado", () => {
    const provasPt = CATALOGO_COPY.pt.provas;

    expect(CATALOGO_COPY.en.provas).not.toEqual(provasPt);
    expect(CATALOGO_COPY.es.provas).not.toEqual(provasPt);
    expect(CATALOGO_COPY.fr.provas).not.toEqual(provasPt);
    expect(CATALOGO_COPY.de.provas).not.toEqual(provasPt);
    expect(CATALOGO_COPY.en.provas).toContain("Live DHL quote");
    expect(CATALOGO_COPY.es.provas).toContain("Cotización DHL en vivo");
    expect(CATALOGO_COPY.fr.provas).toContain("Tarif DHL en direct");
    expect(CATALOGO_COPY.de.provas).toContain("DHL-Live-Tarif");
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
