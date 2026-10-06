import type { Metadata } from "next";
import { LANG_BY_SITE_LOCALE, OG_LOCALE_BY_SITE_LOCALE, localizePath, type SiteLocale } from "./site";

type SeoText = { title: string; description: string };

const SEO: Record<Exclude<SiteLocale, "pt">, Record<string, SeoText>> = {
  en: {
    "/": { title: "Natural hair systems", description: "Revera natural-looking hair systems with secure international payment and tracked DHL delivery." },
    "/produtos": { title: "Hair systems", description: "Compare Revera hair systems by base, texture and natural finish, with prices in US dollars." },
    "/garantia": { title: "Warranty", description: "Understand Revera quality checks, warranty and how to report a manufacturing defect." },
    "/por-que-revera": { title: "Why Revera", description: "Natural finish, guided color selection and quality checks before international shipping." },
    "/faq": { title: "Hair system FAQ", description: "Answers about choosing, wearing, caring for and buying a Revera hair system." },
    "/cores": { title: "Hair system colors", description: "Compare Revera natural and grey hair-system colors before choosing your piece." },
    "/privacidade": { title: "Privacy Policy", description: "How Revera processes personal data for international purchases, delivery and support." },
    "/termos": { title: "Terms of Use", description: "Terms for browsing and purchasing from Revera internationally." },
    "/cookies": { title: "Cookie Policy", description: "How necessary and optional cookies are used on the Revera website." },
  },
  es: {
    "/": { title: "Prótesis capilares naturales", description: "Prótesis capilares Reverá de aspecto natural, pago internacional seguro y entrega DHL rastreada." },
    "/produtos": { title: "Prótesis capilares", description: "Compara prótesis Reverá por base, textura y acabado natural, con precios en euros." },
    "/garantia": { title: "Garantía", description: "Conoce la revisión de calidad, la garantía Reverá y cómo informar un defecto de fabricación." },
    "/por-que-revera": { title: "Por qué Reverá", description: "Acabado natural, elección guiada del color y revisión antes del envío internacional." },
    "/faq": { title: "Preguntas frecuentes", description: "Respuestas sobre cómo elegir, usar, cuidar y comprar una prótesis capilar Reverá." },
    "/cores": { title: "Colores de prótesis capilar", description: "Compara los colores naturales y canosos Reverá antes de elegir tu prótesis." },
    "/privacidade": { title: "Política de privacidad", description: "Cómo Reverá trata los datos personales en compras, entregas y atención internacional." },
    "/termos": { title: "Términos de uso", description: "Condiciones para navegar y comprar internacionalmente en Reverá." },
    "/cookies": { title: "Política de cookies", description: "Cómo se utilizan las cookies necesarias y opcionales en el sitio Reverá." },
  },
  fr: {
    "/": { title: "Prothèses capillaires naturelles", description: "Prothèses capillaires Reverá d’aspect naturel, paiement international sécurisé et livraison DHL suivie." },
    "/produtos": { title: "Prothèses capillaires", description: "Comparez les prothèses Reverá par base, texture et finition naturelle, avec prix en euros." },
    "/garantia": { title: "Garantie", description: "Découvrez le contrôle qualité, la garantie Reverá et comment signaler un défaut de fabrication." },
    "/por-que-revera": { title: "Pourquoi Reverá", description: "Finition naturelle, choix guidé de la couleur et contrôle avant l’expédition internationale." },
    "/faq": { title: "Questions fréquentes", description: "Réponses pour choisir, porter, entretenir et acheter une prothèse capillaire Reverá." },
    "/cores": { title: "Couleurs des prothèses capillaires", description: "Comparez les couleurs naturelles et grisonnantes Reverá avant de choisir." },
    "/privacidade": { title: "Politique de confidentialité", description: "Comment Reverá traite les données personnelles pour les achats, livraisons et l’assistance internationale." },
    "/termos": { title: "Conditions d’utilisation", description: "Conditions applicables à la navigation et aux achats internationaux chez Reverá." },
    "/cookies": { title: "Politique relative aux cookies", description: "Comment les cookies nécessaires et facultatifs sont utilisés sur le site Reverá." },
  },
  de: {
    "/": { title: "Natürlich wirkende Haarsysteme", description: "Natürlich wirkende Reverá Haarsysteme mit sicherer internationaler Zahlung und DHL-Versand mit Tracking." },
    "/produtos": { title: "Haarsysteme", description: "Vergleichen Sie Reverá Haarsysteme nach Basis, Textur und natürlichem Finish – mit Preisen in Euro." },
    "/garantia": { title: "Garantie", description: "Informationen zur Qualitätsprüfung, Reverá Garantie und Meldung eines Herstellungsfehlers." },
    "/por-que-revera": { title: "Warum Reverá", description: "Natürliches Finish, geführte Farbauswahl und Prüfung vor dem internationalen Versand." },
    "/faq": { title: "Häufige Fragen", description: "Antworten zur Auswahl, Nutzung, Pflege und zum Kauf eines Reverá Haarsystems." },
    "/cores": { title: "Haarsystem-Farben", description: "Vergleichen Sie natürliche und graue Reverá Farben vor Ihrer Auswahl." },
    "/privacidade": { title: "Datenschutzerklärung", description: "Wie Reverá personenbezogene Daten für internationale Käufe, Lieferungen und Support verarbeitet." },
    "/termos": { title: "Nutzungsbedingungen", description: "Bedingungen für die Nutzung und internationale Käufe bei Reverá." },
    "/cookies": { title: "Cookie-Richtlinie", description: "Wie notwendige und optionale Cookies auf der Reverá Website verwendet werden." },
  },
};

export function localizedMetadata(locale: Exclude<SiteLocale, "pt">, path: string): Metadata {
  const copy = SEO[locale][path] ?? SEO[locale]["/"]!;
  const canonical = localizePath(path, locale);
  const languages = Object.fromEntries([
    ["pt-BR", path || "/"], ["en-US", localizePath(path, "en")], ["es-ES", localizePath(path, "es")],
    ["fr-FR", localizePath(path, "fr")], ["de-DE", localizePath(path, "de")],
  ]);
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical, languages },
    openGraph: { title: `${copy.title} — Reverá`, description: copy.description, url: canonical, locale: OG_LOCALE_BY_SITE_LOCALE[locale] },
    other: { "content-language": LANG_BY_SITE_LOCALE[locale] },
  };
}

export function alternateLanguages(path: string): Record<string, string> {
  return { "pt-BR": path || "/", "en-US": localizePath(path, "en"), "es-ES": localizePath(path, "es"), "fr-FR": localizePath(path, "fr"), "de-DE": localizePath(path, "de") };
}
