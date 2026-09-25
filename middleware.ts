import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_SITE_LOCALE,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  isFullyLocalizedPath,
  localeFromAcceptLanguage,
  localeFromPath,
  normalizeSiteLocale,
  stripLocaleFromPath,
  type SiteLocale,
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

function preferredLocale(request: NextRequest): SiteLocale {
  return (
    normalizeSiteLocale(request.cookies.get(LOCALE_COOKIE)?.value) ??
    localeFromAcceptLanguage(request.headers.get("accept-language"))
  );
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (shouldIgnore(pathname)) return NextResponse.next();

  const localeInPath = localeFromPath(pathname);

  if (!localeInPath) {
    const locale = preferredLocale(request);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, locale);

    if (locale !== DEFAULT_SITE_LOCALE && isFullyLocalizedPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
      return NextResponse.redirect(url);
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const strippedPath = stripLocaleFromPath(pathname);
  const url = request.nextUrl.clone();
  url.pathname = strippedPath;
  url.search = search;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, localeInPath);

  if (shouldIgnore(strippedPath) || !isFullyLocalizedPath(strippedPath)) {
    const response = NextResponse.redirect(url);
    response.cookies.set(LOCALE_COOKIE, localeInPath, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  const response =
    localeInPath === DEFAULT_SITE_LOCALE
      ? NextResponse.redirect(url)
      : NextResponse.next({ request: { headers: requestHeaders } });

  response.cookies.set(LOCALE_COOKIE, localeInPath, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
