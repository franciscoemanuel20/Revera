import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_SITE_LOCALE,
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

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (shouldIgnore(pathname)) return NextResponse.next();

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
    if (locale !== DEFAULT_SITE_LOCALE && isFullyLocalizedPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
      const response = NextResponse.redirect(url);
      response.cookies.set(LOCALE_GEO_PENDING_COOKIE, "1", {
        maxAge: 60,
        path: "/",
        sameSite: "lax",
      });
      return response;
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, locale);

    return NextResponse.next({ request: { headers: requestHeaders } });
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
    response.cookies.set(LOCALE_COOKIE, localeInPath, {
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
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, localeInPath);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(LOCALE_COOKIE, localeInPath, {
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
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
