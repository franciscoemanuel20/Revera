export const SITE_LOCALES = ["pt", "en", "es", "fr", "de"] as const;

export type SiteLocale = (typeof SITE_LOCALES)[number];

export const DEFAULT_SITE_LOCALE: SiteLocale = "pt";
export const LOCALE_COOKIE = "revera_locale";
// Nome trocado em 06/10/2026: o antigo `revera_locale_manual` foi gravado por
// PRÉ-CARGA de link em visitantes que nunca escolheram idioma (ver o
// middleware). Com nome novo, essas marcas contaminadas deixam de valer e o
// visitante volta a seguir o país; quem escolher de novo grava aqui.
export const LOCALE_MANUAL_COOKIE = "revera_idioma_escolhido";
export const LOCALE_GEO_PENDING_COOKIE = "revera_locale_geo_pending";
export const LOCALE_HEADER = "x-revera-locale";
export const GEO_COUNTRY_COOKIE = "revera_country";
export const GEO_COUNTRY_HEADER = "x-revera-country";

const LOCALE_SET = new Set<string>(SITE_LOCALES);

export function isSiteLocale(value: string | null | undefined): value is SiteLocale {
  return Boolean(value && LOCALE_SET.has(value));
}

export function normalizeSiteLocale(value: string | null | undefined): SiteLocale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().split("-")[0];
  return isSiteLocale(normalized) ? normalized : null;
}

export function localeFromAcceptLanguage(acceptLanguage: string | null | undefined): SiteLocale {
  if (!acceptLanguage) return DEFAULT_SITE_LOCALE;
  const candidates = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [rawTag, ...params] = part.split(";").map((item) => item.trim());
      const locale = normalizeSiteLocale(rawTag);
      const qParam = params.find((param) => param.toLowerCase().startsWith("q="));
      const parsedQ = qParam ? Number(qParam.slice(2)) : 1;
      const q = Number.isFinite(parsedQ) ? Math.max(0, Math.min(1, parsedQ)) : 0;
      return locale ? { locale, q, index } : null;
    })
    .filter((candidate): candidate is { locale: SiteLocale; q: number; index: number } =>
      Boolean(candidate && candidate.q > 0)
    )
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return candidates[0]?.locale ?? DEFAULT_SITE_LOCALE;
}

/** Idioma inicial da vitrine segundo o país detectado pela Vercel. */
export function localeFromCountry(country: string | null | undefined): SiteLocale {
  const iso = country?.trim().toUpperCase();
  // A abertura internacional é deliberadamente limitada aos quatro países
  // testados. Idioma compartilhado não autoriza inferir outro mercado.
  if (iso === "US") return "en";
  if (iso === "ES") return "es";
  if (iso === "FR") return "fr";
  if (iso === "DE") return "de";
  return DEFAULT_SITE_LOCALE;
}

export function localeFromPath(pathname: string): SiteLocale | null {
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return null;
  const exact = first.toLowerCase();
  return isSiteLocale(exact) ? exact : null;
}

export function stripLocaleFromPath(pathname: string): string {
  const locale = localeFromPath(pathname);
  if (!locale) return pathname;
  const [, , ...rest] = pathname.split("/");
  return rest.length > 0 ? `/${rest.join("/")}` : "/";
}

export function prefixForLocale(locale: SiteLocale): string {
  return locale === DEFAULT_SITE_LOCALE ? "" : `/${locale}`;
}

export function localizePath(pathname: string, locale: SiteLocale): string {
  const cleanPath = stripLocaleFromPath(pathname);
  if (/^(https?:|mailto:|tel:|#)/i.test(pathname)) return pathname;
  if (cleanPath === "/") return prefixForLocale(locale) || "/";
  return `${prefixForLocale(locale)}${cleanPath}`;
}

export function isFullyLocalizedPath(pathname: string): boolean {
  const cleanPath = stripLocaleFromPath(pathname);
  if (/^\/produtos\/[^/]+$/.test(cleanPath)) return true;
  return [
    "/",
    "/produtos",
    "/carrinho",
    "/garantia",
    "/por-que-revera",
    "/cuidados",
    "/naturalidade",
    "/sobre-as-proteses",
    "/para-profissionais",
    "/faq",
    "/cores",
    "/privacidade",
    "/termos",
    "/cookies",
    "/devolucao",
    "/aviso-legal",
    "/checkout",
  ].includes(cleanPath);
}

/**
 * URL usada pelo seletor manual de idioma.
 *
 * O portugues normalmente nao usa prefixo publico, mas o seletor precisa
 * mandar `/pt/...` quando a pessoa esta voltando de EN/ES: assim o
 * middleware sabe que foi uma escolha manual, grava o cookie `pt` e so entao
 * limpa a URL para `/...`.
 */
export function localeSwitchPath(pathname: string, locale: SiteLocale): string {
  const cleanPath = stripLocaleFromPath(pathname);
  const prefix = `/${locale}`;
  if (cleanPath === "/") return prefix;
  return `${prefix}${cleanPath}`;
}

export const LANG_BY_SITE_LOCALE: Record<SiteLocale, string> = {
  pt: "pt-BR",
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
};

export const OG_LOCALE_BY_SITE_LOCALE: Record<SiteLocale, string> = {
  pt: "pt_BR",
  en: "en_US",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
};

type SiteCopy = {
  menuConheca: string;
  abrirMenu: string;
  nav: Record<string, string>;
  footerGroups: {
    loja: string;
    saibaMais: string;
  };
  cookies: {
    aria: string;
    titulo: string;
    texto: string;
    aceitar: string;
    recusar: string;
    saibaMais: string;
  };
  seoSuffix: {
    title: string;
    description: string;
  };
};

export const SITE_COPY: Record<SiteLocale, SiteCopy> = {
  pt: {
    menuConheca: "Conheça",
    abrirMenu: "Abrir menu",
    nav: {
      "/": "Início",
      "/produtos": "Próteses",
      "/cores": "Cores",
      "/cuidados": "Cuidados",
      "/garantia": "Garantia",
      "/faq": "FAQ",
      "/sobre-as-proteses": "Sobre as próteses",
      "/naturalidade": "Naturalidade",
      "/por-que-revera": "Por que Reverá",
      "/para-profissionais": "Para profissionais",
      "/privacidade": "Privacidade",
      "/termos": "Termos de uso",
      "/cookies": "Cookies",
      "/devolucao": "Devolução",
      "/aviso-legal": "Aviso legal",
    },
    footerGroups: { loja: "Loja", saibaMais: "Saiba mais" },
    cookies: {
      aria: "Preferências de cookies",
      titulo: "Sua privacidade",
      texto:
        "Usamos cookies necessários para a loja funcionar. Cookies opcionais da Meta e do Google só são ativados se você aceitar.",
      aceitar: "Aceitar opcionais",
      recusar: "Recusar",
      saibaMais: "Saiba mais",
    },
    seoSuffix: {
      title: "Prótese capilar natural",
      description: "Próteses capilares Reverá com acabamento natural, escolha de cor e compra segura.",
    },
  },
  en: {
    menuConheca: "Learn",
    abrirMenu: "Open menu",
    nav: {
      "/": "Home",
      "/produtos": "Hair systems",
      "/cores": "Colors",
      "/cuidados": "Care",
      "/garantia": "Warranty",
      "/faq": "FAQ",
      "/sobre-as-proteses": "About hair systems",
      "/naturalidade": "Natural look",
      "/por-que-revera": "Why Revera",
      "/para-profissionais": "For professionals",
      "/privacidade": "Privacy",
      "/termos": "Terms of use",
      "/cookies": "Cookies",
      "/devolucao": "Returns",
      "/aviso-legal": "Legal notice",
    },
    footerGroups: { loja: "Shop", saibaMais: "Learn more" },
    cookies: {
      aria: "Cookie preferences",
      titulo: "Your privacy",
      texto:
        "We use necessary cookies to keep the store working. Optional Meta and Google cookies are enabled only if you accept them.",
      aceitar: "Accept optional",
      recusar: "Decline",
      saibaMais: "Learn more",
    },
    seoSuffix: {
      title: "Natural hair systems",
      description: "Revera hair systems with a natural finish, color guidance and secure checkout.",
    },
  },
  es: {
    menuConheca: "Conoce",
    abrirMenu: "Abrir menu",
    nav: {
      "/": "Inicio",
      "/produtos": "Protesis capilares",
      "/cores": "Colores",
      "/cuidados": "Cuidados",
      "/garantia": "Garantia",
      "/faq": "FAQ",
      "/sobre-as-proteses": "Sobre las protesis",
      "/naturalidade": "Naturalidad",
      "/por-que-revera": "Por que Revera",
      "/para-profissionais": "Para profesionales",
      "/privacidade": "Privacidad",
      "/termos": "Terminos de uso",
      "/cookies": "Cookies",
      "/devolucao": "Devoluciones",
      "/aviso-legal": "Aviso legal",
    },
    footerGroups: { loja: "Tienda", saibaMais: "Saber mas" },
    cookies: {
      aria: "Preferencias de cookies",
      titulo: "Tu privacidad",
      texto:
        "Usamos cookies necesarias para que la tienda funcione. Las cookies opcionales de Meta y Google solo se activan si las aceptas.",
      aceitar: "Aceptar opcionales",
      recusar: "Rechazar",
      saibaMais: "Saber mas",
    },
    seoSuffix: {
      title: "Protesis capilares naturales",
      description: "Protesis capilares Revera con acabado natural, orientacion de color y compra segura.",
    },
  },
  fr: {
    menuConheca: "Decouvrir",
    abrirMenu: "Ouvrir le menu",
    nav: {
      "/": "Accueil",
      "/produtos": "Protheses capillaires",
      "/cores": "Couleurs",
      "/cuidados": "Entretien",
      "/garantia": "Garantie",
      "/faq": "FAQ",
      "/sobre-as-proteses": "A propos des protheses",
      "/naturalidade": "Aspect naturel",
      "/por-que-revera": "Pourquoi Revera",
      "/para-profissionais": "Pour les professionnels",
      "/privacidade": "Confidentialite",
      "/termos": "Conditions d'utilisation",
      "/cookies": "Cookies",
      "/devolucao": "Retours",
      "/aviso-legal": "Mentions légales",
    },
    footerGroups: { loja: "Boutique", saibaMais: "En savoir plus" },
    cookies: {
      aria: "Preferences de cookies",
      titulo: "Votre confidentialite",
      texto:
        "Nous utilisons les cookies necessaires au fonctionnement de la boutique. Les cookies optionnels de Meta et Google ne sont actives que si vous les acceptez.",
      aceitar: "Accepter les optionnels",
      recusar: "Refuser",
      saibaMais: "En savoir plus",
    },
    seoSuffix: {
      title: "Protheses capillaires naturelles",
      description: "Protheses capillaires Revera avec finition naturelle, aide au choix de couleur et achat securise.",
    },
  },
  de: {
    menuConheca: "Entdecken",
    abrirMenu: "Menu offnen",
    nav: {
      "/": "Startseite",
      "/produtos": "Haarsysteme",
      "/cores": "Farben",
      "/cuidados": "Pflege",
      "/garantia": "Garantie",
      "/faq": "FAQ",
      "/sobre-as-proteses": "Uber Haarsysteme",
      "/naturalidade": "Naturlicher Look",
      "/por-que-revera": "Warum Revera",
      "/para-profissionais": "Fur Profis",
      "/privacidade": "Datenschutz",
      "/termos": "Nutzungsbedingungen",
      "/cookies": "Cookies",
      "/devolucao": "Widerruf",
      "/aviso-legal": "Impressum",
    },
    footerGroups: { loja: "Shop", saibaMais: "Mehr erfahren" },
    cookies: {
      aria: "Cookie-Einstellungen",
      titulo: "Ihre Privatsphare",
      texto:
        "Wir verwenden notwendige Cookies, damit der Shop funktioniert. Optionale Cookies von Meta und Google werden nur aktiviert, wenn Sie zustimmen.",
      aceitar: "Optionale akzeptieren",
      recusar: "Ablehnen",
      saibaMais: "Mehr erfahren",
    },
    seoSuffix: {
      title: "Naturliche Haarsysteme",
      description: "Revera Haarsysteme mit naturlicher Optik, Farbberatung und sicherem Checkout.",
    },
  },
};

export function labelForHref(href: string, locale: SiteLocale, fallback: string): string {
  const clean = stripLocaleFromPath(href);
  return SITE_COPY[locale].nav[clean] ?? fallback;
}
