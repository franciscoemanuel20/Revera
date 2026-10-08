export type ShippingEmailLocale = "pt" | "en" | "es" | "fr" | "de";
export function shippingEmailDraft(locale: ShippingEmailLocale, orderNumber: string, tracking: string) {
  const templates = {
    pt: { subject: `Seu pedido ${orderNumber} está pronto para envio`, body: `Olá! A guia DHL do pedido ${orderNumber} foi criada. Código de rastreamento: ${tracking}. Nossa equipe confirmará o despacho quando a documentação estiver concluída.` },
    en: { subject: `Your order ${orderNumber} is ready for shipping`, body: `Hello! A DHL label has been created for order ${orderNumber}. Tracking number: ${tracking}. Our team will confirm dispatch once the documentation is complete.` },
    es: { subject: `Tu pedido ${orderNumber} está listo para el envío`, body: `¡Hola! Se ha creado una etiqueta DHL para el pedido ${orderNumber}. Número de seguimiento: ${tracking}. Nuestro equipo confirmará el despacho cuando la documentación esté completa.` },
    fr: { subject: `Votre commande ${orderNumber} est prête pour l'expédition`, body: `Bonjour ! Une étiquette DHL a été créée pour la commande ${orderNumber}. Numéro de suivi : ${tracking}. Notre équipe confirmera l'expédition lorsque les documents seront complets.` },
    de: { subject: `Ihre Bestellung ${orderNumber} ist für den Versand vorbereitet`, body: `Guten Tag! Für die Bestellung ${orderNumber} wurde ein DHL-Versandlabel erstellt. Sendungsnummer: ${tracking}. Unser Team bestätigt den Versand, sobald die Unterlagen vollständig sind.` },
  } as const;
  return templates[locale];
}
