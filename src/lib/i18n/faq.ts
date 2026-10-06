import type { SiteLocale } from "./site";

type FaqText = { question: string; answer: string };

const EN: FaqText[] = [
  { question: "What is the thickness of Revera’s best-selling micro-skin system?", answer: "0.08 mm." },
  { question: "Can you help me choose the color?", answer: "Yes. Compare the color chart and, if needed, send a photo of your natural hair to our team for guidance." },
  { question: "Do you ship internationally?", answer: "Yes. International delivery is quoted live by DHL at checkout for available destinations." },
  { question: "What grey-hair options are available?", answer: "Systems with up to 50% grey use synthetic grey strands so the remaining hair can be toned without changing the white strands. Do not use high heat. Systems with 65%, 80%, 90% and 100% grey use human hair." },
  { question: "How does the warranty work?", answer: "You have 7 business days after delivery to report a manufacturing defect. Every system is quality-checked before dispatch." },
  { question: "Can I wash it normally?", answer: "Wash the hair once or twice a week with salt-free conditioner. On other days, protect the system with a shower cap." },
  { question: "Can I use a hair dryer?", answer: "Yes, but only on cool or warm settings—never hot." },
  { question: "Can I swim in the sea or a pool?", answer: "Yes, provided maintenance is up to date. If you are travelling, schedule maintenance about three days beforehand." },
  { question: "Can I use a flat iron?", answer: "No. Flat irons are not permitted; use a dryer only on cool or warm settings." },
  { question: "How often should I perform maintenance?", answer: "Every 7–12 days for intense physical activity or oily skin; otherwise, about every 15 days." },
  { question: "What most damages a hair system?", answer: "Do not scratch the system with your nails; press gently instead." },
  { question: "How do I choose the size?", answer: "The standard base size is 20 × 25 cm." },
  { question: "What is the basic care routine?", answer: "Apply heat-protection spray daily, comb gently with a paddle brush, use deep-conditioning oil three times a week and sleep with a satin cap or pillowcase." },
  { question: "How long does a hair system last after application?", answer: "Its lifespan depends directly on use, maintenance and daily care." },
  { question: "Do you sell to professionals?", answer: "Yes. Use the Professionals page to contact our team." },
  { question: "How long does the 0.08 mm micro-skin system usually last?", answer: "With proper care, it usually lasts about 8 to 12 months." },
];

const ES: FaqText[] = [
  { question: "¿Cuál es el grosor de la micro piel más vendida de Reverá?", answer: "0,08 mm." },
  { question: "¿Ayudan a elegir el color?", answer: "Sí. Compara la carta de colores y, si lo necesitas, envía una foto de tu cabello natural a nuestro equipo." },
  { question: "¿Realizan envíos internacionales?", answer: "Sí. DHL calcula el envío en vivo durante el checkout para los destinos disponibles." },
  { question: "¿Qué opciones de canas existen?", answer: "Hasta 50% de canas se utilizan hebras grises sintéticas para permitir la tonalización sin alterar los cabellos blancos. No uses calor intenso. En 65%, 80%, 90% y 100% las hebras son humanas." },
  { question: "¿Cómo funciona la garantía?", answer: "Tienes 7 días hábiles desde la entrega para comunicar un defecto de fabricación. Todas las prótesis pasan por control de calidad." },
  { question: "¿Puedo lavarla normalmente?", answer: "Lava el cabello una o dos veces por semana con acondicionador sin sal. Los demás días, protege la prótesis con un gorro de ducha." },
  { question: "¿Puedo usar secador?", answer: "Sí, solo en modo frío o tibio; nunca caliente." },
  { question: "¿Puedo entrar al mar o a la piscina?", answer: "Sí, con el mantenimiento al día. Si vas a viajar, haz el mantenimiento unos tres días antes." },
  { question: "¿Puedo usar plancha?", answer: "No. La plancha está prohibida; usa el secador solo en frío o tibio." },
  { question: "¿Cada cuánto debo hacer el mantenimiento?", answer: "Cada 7–12 días si haces actividad física intensa o tienes piel grasa; en caso contrario, aproximadamente cada 15 días." },
  { question: "¿Qué es lo que más daña la prótesis?", answer: "No la rasques con las uñas; presiónala suavemente." },
  { question: "¿Cómo elijo el tamaño?", answer: "El tamaño estándar de la base es 20 × 25 cm." },
  { question: "¿Cuál es la rutina básica de cuidados?", answer: "Usa protector térmico a diario, peina suavemente, aplica aceite de hidratación profunda tres veces por semana y duerme con gorro o funda de satén." },
  { question: "¿Cuánto dura una prótesis después de aplicarla?", answer: "La duración depende directamente del uso, mantenimiento y cuidados diarios." },
  { question: "¿Venden a profesionales?", answer: "Sí. Contacta con nuestro equipo desde la página Para profesionales." },
  { question: "¿Cuánto suele durar la micro piel de 0,08 mm?", answer: "Con los cuidados correctos, suele durar entre 8 y 12 meses." },
];

const FR: FaqText[] = [
  { question: "Quelle est l’épaisseur de la micro-peau la plus vendue par Reverá ?", answer: "0,08 mm." },
  { question: "Pouvez-vous m’aider à choisir la couleur ?", answer: "Oui. Comparez le nuancier et, si nécessaire, envoyez une photo de vos cheveux naturels à notre équipe." },
  { question: "Livrez-vous à l’international ?", answer: "Oui. DHL calcule le tarif en direct lors du paiement pour les destinations disponibles." },
  { question: "Quelles options de cheveux gris proposez-vous ?", answer: "Jusqu’à 50% de gris, des cheveux gris synthétiques permettent la coloration sans modifier les mèches blanches. Évitez la forte chaleur. À 65%, 80%, 90% et 100%, les cheveux sont humains." },
  { question: "Comment fonctionne la garantie ?", answer: "Vous disposez de 7 jours ouvrés après la livraison pour signaler un défaut de fabrication. Chaque prothèse est contrôlée avant expédition." },
  { question: "Puis-je la laver normalement ?", answer: "Lavez les cheveux une à deux fois par semaine avec un après-shampoing sans sel. Les autres jours, protégez la prothèse avec un bonnet de douche." },
  { question: "Puis-je utiliser un sèche-cheveux ?", answer: "Oui, uniquement à froid ou tiède, jamais chaud." },
  { question: "Puis-je aller à la mer ou à la piscine ?", answer: "Oui, si l’entretien est à jour. Avant un voyage, faites l’entretien environ trois jours avant." },
  { question: "Puis-je utiliser un fer à lisser ?", answer: "Non. Le fer à lisser est interdit ; utilisez uniquement un sèche-cheveux froid ou tiède." },
  { question: "À quelle fréquence faut-il faire l’entretien ?", answer: "Tous les 7 à 12 jours en cas d’activité physique intense ou de peau grasse ; sinon, environ tous les 15 jours." },
  { question: "Qu’est-ce qui abîme le plus une prothèse ?", answer: "Ne la grattez pas avec les ongles ; appuyez doucement à la place." },
  { question: "Comment choisir la taille ?", answer: "La taille standard de la base est de 20 × 25 cm." },
  { question: "Quelle est la routine de soins de base ?", answer: "Appliquez un protecteur thermique chaque jour, peignez doucement, utilisez une huile nourrissante trois fois par semaine et dormez avec un bonnet ou une taie en satin." },
  { question: "Combien de temps dure une prothèse après la pose ?", answer: "Sa durée dépend directement de l’utilisation, de l’entretien et des soins quotidiens." },
  { question: "Vendez-vous aux professionnels ?", answer: "Oui. Contactez notre équipe depuis la page Pour les professionnels." },
  { question: "Combien de temps dure généralement la micro-peau 0,08 mm ?", answer: "Avec des soins adaptés, elle dure généralement de 8 à 12 mois." },
];

const DE: FaqText[] = [
  { question: "Wie dick ist das meistverkaufte Mikrohaut-System von Reverá?", answer: "0,08 mm." },
  { question: "Helfen Sie bei der Farbauswahl?", answer: "Ja. Vergleichen Sie die Farbkarte und senden Sie unserem Team bei Bedarf ein Foto Ihres natürlichen Haars." },
  { question: "Liefern Sie international?", answer: "Ja. DHL berechnet den Versand für verfügbare Ziele live im Checkout." },
  { question: "Welche Grauanteile sind erhältlich?", answer: "Bis 50% Grau werden synthetische graue Haare verwendet, damit die übrigen Haare getönt werden können, ohne die weißen zu verändern. Keine starke Hitze verwenden. Bei 65%, 80%, 90% und 100% Grau sind die Haare menschlich." },
  { question: "Wie funktioniert die Garantie?", answer: "Sie haben nach der Lieferung 7 Werktage Zeit, einen Herstellungsfehler zu melden. Jedes System wird vor dem Versand geprüft." },
  { question: "Kann ich es normal waschen?", answer: "Waschen Sie die Haare ein- bis zweimal pro Woche mit salzfreiem Conditioner. Schützen Sie das System an den anderen Tagen mit einer Duschhaube." },
  { question: "Kann ich einen Föhn verwenden?", answer: "Ja, aber nur kalt oder lauwarm, niemals heiß." },
  { question: "Kann ich im Meer oder Pool schwimmen?", answer: "Ja, wenn die Pflege aktuell ist. Lassen Sie vor einer Reise die Pflege etwa drei Tage vorher durchführen." },
  { question: "Kann ich ein Glätteisen verwenden?", answer: "Nein. Glätteisen sind nicht erlaubt; föhnen Sie nur kalt oder lauwarm." },
  { question: "Wie oft ist eine Pflege erforderlich?", answer: "Bei intensiver körperlicher Aktivität oder fettiger Haut alle 7–12 Tage, sonst ungefähr alle 15 Tage." },
  { question: "Was schadet einem Haarsystem am meisten?", answer: "Kratzen Sie nicht mit den Nägeln; drücken Sie stattdessen sanft." },
  { question: "Wie wähle ich die Größe?", answer: "Die Standardgröße der Basis beträgt 20 × 25 cm." },
  { question: "Wie sieht die grundlegende Pflege aus?", answer: "Täglich Hitzeschutz verwenden, sanft bürsten, dreimal pro Woche Pflegeöl auftragen und mit Satinhaube oder Satinkissenbezug schlafen." },
  { question: "Wie lange hält ein Haarsystem nach der Befestigung?", answer: "Die Haltbarkeit hängt direkt von Nutzung, Pflege und täglicher Sorgfalt ab." },
  { question: "Verkaufen Sie an Fachleute?", answer: "Ja. Kontaktieren Sie unser Team über die Seite Für Profis." },
  { question: "Wie lange hält die 0,08-mm-Mikrohaut normalerweise?", answer: "Bei richtiger Pflege in der Regel etwa 8 bis 12 Monate." },
];

export function faqTraduzido(locale: SiteLocale): FaqText[] | null {
  return locale === "en" ? EN : locale === "es" ? ES : locale === "fr" ? FR : locale === "de" ? DE : null;
}

