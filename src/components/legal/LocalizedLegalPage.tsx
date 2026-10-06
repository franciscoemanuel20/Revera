import type { ReactNode } from "react";
import { PaginaLegal } from "./PaginaLegal";
import type { SiteLocale } from "@/lib/i18n/site";

type LegalCopy = { title: string; updated: string; intro: string; sections: Array<{ title: string; body: ReactNode }> };

const CONTACT = <a className="underline hover:text-ink" href="https://wa.me/5512981409901">+55 12 98140-9901</a>;

const COPY: Record<Exclude<SiteLocale, "pt">, Record<"privacidade" | "termos" | "cookies", LegalCopy>> = {
  en: {
    privacidade: { title: "Privacy Policy", updated: "September 9, 2026", intro: "Revera processes the data needed to sell, receive payment, deliver orders and support customers. This page explains how that data is used.", sections: [
      { title: "Data we collect", body: <><p>At checkout we collect name, email, telephone number and delivery address. We also record technical data needed for security and purchase attribution, such as IP address, browser, session identifiers and campaign source.</p><p>When you voluntarily request color assistance, we may also receive a photograph. It is stored privately and is not displayed publicly.</p></> },
      { title: "How we use data", body: <p>We use data to create and manage orders and payments, prevent fraud, quote and track delivery, provide support and—only with optional-cookie consent—measure campaign performance.</p> },
      { title: "Data sharing", body: <p>We share only what is necessary with payment providers, DHL and shipping platforms, hosting and database providers. With consent, Meta and Google may receive minimized technical identifiers and browsing events.</p> },
      { title: "Retention and security", body: <p>Data is retained as needed to fulfil orders, provide support, comply with legal obligations and resolve disputes. Revera uses access controls and private storage, although no internet-connected system can eliminate every risk.</p> },
      { title: "Your rights and contact", body: <p>You may request access, correction, deletion where applicable, information about sharing or withdrawal of consent. Contact our team at {CONTACT}.</p> },
    ] },
    termos: { title: "Terms of Use", updated: "September 9, 2026", intro: "By browsing and purchasing from Revera, you agree to use the website lawfully and provide accurate payment and delivery information.", sections: [
      { title: "Purchase and availability", body: <p>Products, prices, delivery conditions and availability may change before the order is confirmed. A purchase is approved only after confirmation by the payment provider.</p> },
      { title: "International delivery", body: <p>DHL price and estimated delivery are calculated from the destination address. Customs clearance may affect delivery time. Import duties, taxes and customs fees are not included unless expressly shown and remain the buyer’s responsibility.</p> },
      { title: "Content", body: <p>Texts, photographs, trademarks and website elements belong to Revera or are used with permission. Commercial copying or distribution requires authorization.</p> },
      { title: "Contact", body: <p>For questions about an order or these terms, contact {CONTACT}.</p> },
    ] },
    cookies: { title: "Cookie Policy", updated: "September 9, 2026", intro: "Cookies are small files that help the website work and, when authorized, measure navigation and campaigns.", sections: [
      { title: "Necessary cookies", body: <p>Necessary cookies maintain the session, shopping cart, security, language choice and checkout. They cannot be disabled through the banner because the purchase flow depends on them.</p> },
      { title: "Optional analytics cookies", body: <p>With your permission, Revera activates Meta and Google tools to measure visits and campaign results.</p> },
      { title: "Your choice", body: <p>You may accept or decline optional cookies. Declining does not prevent browsing or purchasing.</p> },
    ] },
  },
  es: {
    privacidade: { title: "Política de privacidad", updated: "9 de septiembre de 2026", intro: "Reverá trata los datos necesarios para vender, cobrar, entregar pedidos y atender a los clientes.", sections: [
      { title: "Datos que recopilamos", body: <><p>En el checkout recopilamos nombre, correo electrónico, teléfono y dirección de entrega, además de datos técnicos necesarios para seguridad y atribución.</p><p>Si solicitas ayuda con el color, también podemos recibir una fotografía, almacenada de forma privada.</p></> },
      { title: "Cómo utilizamos los datos", body: <p>Los utilizamos para pedidos, pagos, prevención del fraude, cotización y seguimiento de DHL, atención y, solo con consentimiento, medición de campañas.</p> },
      { title: "Con quién se comparten", body: <p>Compartimos únicamente lo necesario con proveedores de pago, DHL, alojamiento y base de datos. Con consentimiento, Meta y Google pueden recibir identificadores técnicos minimizados.</p> },
      { title: "Conservación y seguridad", body: <p>Conservamos los datos para cumplir pedidos, prestar soporte, atender obligaciones legales y resolver disputas, aplicando controles de acceso y almacenamiento privado.</p> },
      { title: "Tus derechos y contacto", body: <p>Puedes solicitar acceso, corrección, eliminación cuando corresponda e información sobre el tratamiento. Contacta con {CONTACT}.</p> },
    ] },
    termos: { title: "Términos de uso", updated: "9 de septiembre de 2026", intro: "Al navegar y comprar en Reverá, aceptas utilizar el sitio legalmente y proporcionar datos correctos.", sections: [
      { title: "Compra y disponibilidad", body: <p>Productos, precios, entrega y disponibilidad pueden cambiar antes de la confirmación. La compra se aprueba únicamente tras la confirmación del proveedor de pago.</p> },
      { title: "Entrega internacional", body: <p>DHL calcula el precio y plazo estimado según la dirección. La aduana puede afectar el plazo; aranceles e impuestos no incluidos expresamente son responsabilidad del comprador.</p> },
      { title: "Uso del contenido", body: <p>Los textos, fotos, marcas y elementos del sitio pertenecen a Reverá o se utilizan con autorización.</p> },
      { title: "Contacto", body: <p>Para dudas sobre pedidos o estos términos, contacta con {CONTACT}.</p> },
    ] },
    cookies: { title: "Política de cookies", updated: "9 de septiembre de 2026", intro: "Las cookies ayudan al funcionamiento del sitio y, cuando se autorizan, a medir la navegación y las campañas.", sections: [
      { title: "Cookies necesarias", body: <p>Mantienen la sesión, el carrito, la seguridad, el idioma y el checkout. No se pueden desactivar desde el aviso.</p> },
      { title: "Cookies opcionales", body: <p>Con tu permiso, Reverá activa herramientas de Meta y Google para medir visitas y resultados.</p> },
      { title: "Tu elección", body: <p>Puedes aceptar o rechazar las cookies opcionales sin impedir la navegación ni la compra.</p> },
    ] },
  },
  fr: {
    privacidade: { title: "Politique de confidentialité", updated: "9 septembre 2026", intro: "Reverá traite les données nécessaires pour vendre, encaisser, livrer et assister ses clients.", sections: [
      { title: "Données collectées", body: <><p>Lors du paiement, nous collectons le nom, l’adresse e-mail, le téléphone et l’adresse de livraison, ainsi que les données techniques nécessaires à la sécurité et à l’attribution.</p><p>Si vous demandez de l’aide pour la couleur, nous pouvons également recevoir une photo, conservée de manière privée.</p></> },
      { title: "Utilisation des données", body: <p>Nous les utilisons pour les commandes, paiements, prévention de la fraude, devis et suivi DHL, assistance et, uniquement avec consentement, mesure des campagnes.</p> },
      { title: "Partage", body: <p>Nous partageons uniquement le nécessaire avec les prestataires de paiement, DHL, l’hébergement et la base de données. Avec consentement, Meta et Google peuvent recevoir des identifiants techniques minimisés.</p> },
      { title: "Conservation et sécurité", body: <p>Les données sont conservées pour exécuter les commandes, fournir l’assistance, respecter les obligations légales et résoudre les litiges.</p> },
      { title: "Vos droits et contact", body: <p>Vous pouvez demander l’accès, la correction, l’effacement lorsque cela s’applique et des informations sur le traitement. Contactez {CONTACT}.</p> },
    ] },
    termos: { title: "Conditions d’utilisation", updated: "9 septembre 2026", intro: "En naviguant et en achetant chez Reverá, vous acceptez d’utiliser le site légalement et de fournir des informations exactes.", sections: [
      { title: "Achat et disponibilité", body: <p>Les produits, prix, conditions de livraison et disponibilités peuvent changer avant confirmation. L’achat n’est approuvé qu’après confirmation du prestataire de paiement.</p> },
      { title: "Livraison internationale", body: <p>DHL calcule le prix et le délai estimé selon l’adresse. Le dédouanement peut modifier le délai ; les droits et taxes non expressément inclus restent à la charge de l’acheteur.</p> },
      { title: "Utilisation du contenu", body: <p>Les textes, photos, marques et éléments du site appartiennent à Reverá ou sont utilisés avec autorisation.</p> },
      { title: "Contact", body: <p>Pour toute question, contactez {CONTACT}.</p> },
    ] },
    cookies: { title: "Politique relative aux cookies", updated: "9 septembre 2026", intro: "Les cookies permettent au site de fonctionner et, avec votre autorisation, de mesurer la navigation et les campagnes.", sections: [
      { title: "Cookies nécessaires", body: <p>Ils maintiennent la session, le panier, la sécurité, la langue et le paiement. Ils ne peuvent pas être désactivés depuis la bannière.</p> },
      { title: "Cookies facultatifs", body: <p>Avec votre accord, Reverá active les outils Meta et Google pour mesurer les visites et les résultats.</p> },
      { title: "Votre choix", body: <p>Vous pouvez accepter ou refuser les cookies facultatifs sans empêcher la navigation ni l’achat.</p> },
    ] },
  },
  de: {
    privacidade: { title: "Datenschutzerklärung", updated: "9. September 2026", intro: "Reverá verarbeitet die Daten, die für Verkauf, Zahlung, Lieferung und Kundenbetreuung erforderlich sind.", sections: [
      { title: "Erhobene Daten", body: <><p>Im Checkout erfassen wir Name, E-Mail, Telefonnummer und Lieferadresse sowie technische Daten für Sicherheit und Zuordnung.</p><p>Bei einer freiwilligen Farbberatung können wir außerdem ein Foto erhalten, das privat gespeichert wird.</p></> },
      { title: "Verwendung", body: <p>Wir verwenden Daten für Bestellungen, Zahlungen, Betrugsprävention, DHL-Angebote und Tracking, Support und – nur mit Einwilligung – Kampagnenmessung.</p> },
      { title: "Weitergabe", body: <p>Wir teilen nur notwendige Daten mit Zahlungsanbietern, DHL, Hosting- und Datenbankdiensten. Mit Einwilligung können Meta und Google minimierte technische Kennungen erhalten.</p> },
      { title: "Speicherung und Sicherheit", body: <p>Daten werden zur Auftragserfüllung, Unterstützung, Einhaltung gesetzlicher Pflichten und Streitbeilegung aufbewahrt und durch Zugriffskontrollen geschützt.</p> },
      { title: "Ihre Rechte und Kontakt", body: <p>Sie können Auskunft, Berichtigung, gegebenenfalls Löschung und Informationen zur Verarbeitung verlangen. Kontakt: {CONTACT}.</p> },
    ] },
    termos: { title: "Nutzungsbedingungen", updated: "9. September 2026", intro: "Mit der Nutzung und dem Kauf bei Reverá verpflichten Sie sich zur rechtmäßigen Nutzung und zu korrekten Angaben.", sections: [
      { title: "Kauf und Verfügbarkeit", body: <p>Produkte, Preise, Lieferbedingungen und Verfügbarkeit können sich vor Bestätigung ändern. Ein Kauf gilt erst nach Bestätigung durch den Zahlungsanbieter als genehmigt.</p> },
      { title: "Internationaler Versand", body: <p>DHL berechnet Preis und voraussichtliche Dauer anhand der Adresse. Die Zollabfertigung kann die Lieferzeit beeinflussen; nicht ausdrücklich enthaltene Einfuhrabgaben trägt der Käufer.</p> },
      { title: "Inhalte", body: <p>Texte, Fotos, Marken und Website-Elemente gehören Reverá oder werden mit Genehmigung verwendet.</p> },
      { title: "Kontakt", body: <p>Bei Fragen kontaktieren Sie {CONTACT}.</p> },
    ] },
    cookies: { title: "Cookie-Richtlinie", updated: "9. September 2026", intro: "Cookies unterstützen die Website und messen mit Ihrer Zustimmung Navigation und Kampagnen.", sections: [
      { title: "Notwendige Cookies", body: <p>Sie erhalten Sitzung, Warenkorb, Sicherheit, Sprache und Checkout und können über das Banner nicht deaktiviert werden.</p> },
      { title: "Optionale Cookies", body: <p>Mit Ihrer Einwilligung aktiviert Reverá Meta- und Google-Tools zur Messung von Besuchen und Ergebnissen.</p> },
      { title: "Ihre Wahl", body: <p>Sie können optionale Cookies ablehnen, ohne Navigation oder Kauf zu verhindern.</p> },
    ] },
  },
};

export function LocalizedLegalPage({ locale, page }: { locale: Exclude<SiteLocale, "pt">; page: "privacidade" | "termos" | "cookies" }) {
  const copy = COPY[locale][page];
  return <PaginaLegal titulo={copy.title} atualizadoEm={copy.updated}>{copy.intro && <p>{copy.intro}</p>}{copy.sections.map((section) => <section key={section.title}><h2 className="font-display text-2xl text-ink">{section.title}</h2><div className="mt-3 space-y-3">{section.body}</div></section>)}</PaginaLegal>;
}

