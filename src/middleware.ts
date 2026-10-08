import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_SITE_LOCALE,
  GEO_COUNTRY_COOKIE,
  GEO_COUNTRY_HEADER,
  LOCALE_COOKIE,
  LOCALE_GEO_PENDING_COOKIE,
  LOCALE_MANUAL_COOKIE,
  LOCALE_HEADER,
  isFullyLocalizedPath,
  localeFromCountry,
  localeFromPath,
  normalizeSiteLocale,
  stripLocaleFromPath,
} from "@/lib/i18n/site";

function registrarPais(response: NextResponse, request: NextRequest): NextResponse {
  const pais = request.headers.get("x-vercel-ip-country")?.trim().toUpperCase();
  if (pais && /^[A-Z]{2}$/.test(pais) && pais !== "XX") {
    response.cookies.set(GEO_COUNTRY_COOKIE, pais, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 });
  }
  return response;
}

function shouldIgnore(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/admin") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

/**
 * PREFETCH NÃO É ESCOLHA DE IDIOMA (06/10/2026).
 *
 * O seletor PT/EN/ES/FR/DE do cabeçalho e as abas de país do checkout são
 * `<Link>`, e o Next pré-carrega cada um deles em segundo plano. Cada
 * pré-carga passava por aqui como se fosse uma visita a /en, /fr, /de... e
 * gravava `revera_locale` + `revera_locale_manual=1` por um ano. O último
 * pré-carregamento a terminar "vencia": um brasileiro que só abriu
 * /checkout saía com o cookie em inglês (ou francês, ou alemão, por sorteio
 * de rede), e a navegação seguinte sem prefixo era redirecionada para o
 * checkout internacional. Pior: o POST do "Finalizar pedido" (server action
 * em /checkout) também era redirecionado — 307 para /en/checkout.
 *
 * Regra: só uma navegação de verdade (GET/HEAD que não é pré-carga) grava a
 * escolha ou é redirecionada pelo idioma; pré-carga e POST passam direto.
 * Os links de idioma e de país também saem com `prefetch={false}`, para o
 * clique sempre chegar ao servidor (uma pré-carga que seguiu redirect
 * deixava o Next reaproveitar a URL errada e o clique em PT não pegava).
 */
function ehPreCarga(request: NextRequest): boolean {
  const purpose = `${request.headers.get("purpose") ?? ""} ${request.headers.get("sec-purpose") ?? ""}`;
  return request.headers.has("next-router-prefetch") || /prefetch/i.test(purpose);
}

/**
 * PAÍS EXPLÍCITO NO CHECKOUT VENCE O IDIOMA (Codex, 08/10/2026). As abas de
 * país e o "comprar para o Brasil" levam a /checkout?pais=XX. Com
 * geolocalização US ou cookie manual "en", a entrada sem prefixo era
 * redirecionada para /en/checkout?pais=XX — e a rota localizada ignora o
 * parâmetro e impõe o mercado americano. Quem escolheu o destino escolheu o
 * mercado: a página decide (US continua indo para /en/checkout por lá).
 */
function paisExplicitoNoCheckout(request: NextRequest): boolean {
  const { pathname, searchParams } = request.nextUrl;
  return pathname === "/checkout" && /^[A-Za-z]{2}$/.test(searchParams.get("pais") ?? "");
}

function ehLeitura(request: NextRequest): boolean {
  return request.method === "GET" || request.method === "HEAD";
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (shouldIgnore(pathname)) return NextResponse.next();

  const gravaEscolha = ehLeitura(request) && !ehPreCarga(request);

  const localeInPath = localeFromPath(pathname);

  if (!localeInPath) {
    // A entrada sem prefixo representa uma nova visita e segue o país real
    // detectado na borda. Um cookie antigo de viagem/idioma não pode mandar
    // um comprador brasileiro de anúncio para /de ou /en.
    const escolhaManual = request.cookies.get(LOCALE_MANUAL_COOKIE)?.value === "1";
    const localeManual = escolhaManual
      ? normalizeSiteLocale(request.cookies.get(LOCALE_COOKIE)?.value)
      : null;
    const locale = localeManual ?? localeFromCountry(request.headers.get("x-vercel-ip-country"));
    // Pré-carga não redireciona nem marca geolocalização pendente: o clique
    // de verdade é que decide, e chega sem o cabeçalho de pré-carga.
    if (gravaEscolha && locale !== DEFAULT_SITE_LOCALE && isFullyLocalizedPath(pathname) && !paisExplicitoNoCheckout(request)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
      const response = NextResponse.redirect(url);
      response.cookies.set(LOCALE_GEO_PENDING_COOKIE, "1", {
        maxAge: 60,
        path: "/",
        sameSite: "lax",
      });
      return registrarPais(response, request);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, locale);
    const paisAtual = request.headers.get("x-vercel-ip-country")?.trim().toUpperCase();
    if (paisAtual && /^[A-Z]{2}$/.test(paisAtual) && paisAtual !== "XX") {
      requestHeaders.set(GEO_COUNTRY_HEADER, paisAtual);
    }

    return registrarPais(NextResponse.next({ request: { headers: requestHeaders } }), request);
  }

  const strippedPath = stripLocaleFromPath(pathname);
  const veioDaGeolocalizacao = request.cookies.get(LOCALE_GEO_PENDING_COOKIE)?.value === "1";
  const url = request.nextUrl.clone();
  url.pathname = strippedPath;
  url.search = search;

  if (
    localeInPath === DEFAULT_SITE_LOCALE ||
    shouldIgnore(strippedPath) ||
    !isFullyLocalizedPath(strippedPath)
  ) {
    const response = NextResponse.redirect(url);
    if (gravaEscolha) gravarIdioma(response, localeInPath, veioDaGeolocalizacao);
    return registrarPais(response, request);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, localeInPath);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (gravaEscolha) gravarIdioma(response, localeInPath, veioDaGeolocalizacao);
  return registrarPais(response, request);
}

function gravarIdioma(response: NextResponse, locale: string, veioDaGeolocalizacao: boolean) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
  if (veioDaGeolocalizacao) response.cookies.delete(LOCALE_GEO_PENDING_COOKIE);
  else {
    response.cookies.set(LOCALE_MANUAL_COOKIE, "1", {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
