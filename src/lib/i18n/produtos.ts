import type { SiteLocale } from "./site";

type ProdutoTraduzido = { nome: string; resumo: string; descricao: string };

const PRODUTOS: Record<string, Record<Exclude<SiteLocale, "pt">, ProdutoTraduzido>> = {
  "micropele-008": {
    en: { nome: "Micro-skin 0.08 mm", resumo: "A balance of natural appearance, durability and everyday practicality.", descricao: "A lightweight 0.08 mm micro-skin base with a clean hairline and a natural finish for everyday wear." },
    es: { nome: "Micro piel 0,08 mm", resumo: "Equilibrio entre naturalidad, resistencia y practicidad para el día a día.", descricao: "Base ligera de micro piel de 0,08 mm, con línea frontal discreta y acabado natural para el uso diario." },
    fr: { nome: "Micro-peau 0,08 mm", resumo: "Équilibre entre naturel, résistance et praticité au quotidien.", descricao: "Base légère en micro-peau de 0,08 mm, avec ligne frontale discrète et finition naturelle au quotidien." },
    de: { nome: "Mikrohaut 0,08 mm", resumo: "Ausgewogenes Verhältnis von Natürlichkeit, Haltbarkeit und Alltagstauglichkeit.", descricao: "Leichte 0,08-mm-Mikrohautbasis mit diskreter Front und natürlichem Finish für den Alltag." },
  },
  "micropele-006": {
    en: { nome: "Micro-skin 0.06 mm", resumo: "An ultra-thin base for an even more discreet hairline.", descricao: "An ultra-thin 0.06 mm micro-skin base designed for maximum discretion and a natural-looking front." },
    es: { nome: "Micro piel 0,06 mm", resumo: "Base ultrafina para una línea frontal aún más discreta.", descricao: "Base ultrafina de micro piel de 0,06 mm para máxima discreción y una línea frontal natural." },
    fr: { nome: "Micro-peau 0,06 mm", resumo: "Base ultrafine pour une ligne frontale encore plus discrète.", descricao: "Base ultrafine en micro-peau de 0,06 mm pour une discrétion maximale et une ligne frontale naturelle." },
    de: { nome: "Mikrohaut 0,06 mm", resumo: "Ultradünne Basis für eine noch diskretere Front.", descricao: "Ultradünne 0,06-mm-Mikrohautbasis für maximale Diskretion und eine natürlich wirkende Front." },
  },
  "cacho-aberto": {
    en: { nome: "Loose curl", resumo: "Looser curls with natural movement and definition.", descricao: "A hair system with loose curls, natural movement and balanced definition." },
    es: { nome: "Rizo abierto", resumo: "Rizos más sueltos, con movimiento y definición natural.", descricao: "Prótesis capilar de rizo abierto, con movimiento natural y definición equilibrada." },
    fr: { nome: "Boucles souples", resumo: "Boucles plus souples, avec mouvement et définition naturels.", descricao: "Prothèse capillaire aux boucles souples, avec mouvement naturel et définition équilibrée." },
    de: { nome: "Lockere Locken", resumo: "Lockere Locken mit natürlicher Bewegung und Definition.", descricao: "Haarsystem mit lockeren Locken, natürlicher Bewegung und ausgewogener Definition." },
  },
  "cacho-fechado": {
    en: { nome: "Tight curl", resumo: "A coily texture with fuller, more defined curls.", descricao: "A hair system with tight, full curls and a naturally defined coily texture." },
    es: { nome: "Rizo cerrado", resumo: "Textura crespa con rizos más marcados y llenos.", descricao: "Prótesis capilar con rizos cerrados, llenos y una textura crespa naturalmente definida." },
    fr: { nome: "Boucles serrées", resumo: "Texture frisée aux boucles plus marquées et généreuses.", descricao: "Prothèse capillaire aux boucles serrées et généreuses, avec une texture naturellement définie." },
    de: { nome: "Dichte Locken", resumo: "Krause Textur mit stärker definierten, volleren Locken.", descricao: "Haarsystem mit dichten, vollen Locken und natürlich definierter krauser Textur." },
  },
  afro: {
    en: { nome: "Afro", resumo: "Defined afro volume and texture that preserve your identity.", descricao: "An afro-textured hair system with defined volume and a natural finish." },
    es: { nome: "Afro", resumo: "Volumen y textura afro definidos, preservando tu identidad.", descricao: "Prótesis capilar de textura afro, con volumen definido y acabado natural." },
    fr: { nome: "Afro", resumo: "Volume et texture afro définis, dans le respect de votre identité.", descricao: "Prothèse capillaire à texture afro, avec volume défini et finition naturelle." },
    de: { nome: "Afro", resumo: "Definiertes Afro-Volumen und Textur, die Ihre Identität bewahren.", descricao: "Haarsystem mit Afro-Textur, definiertem Volumen und natürlichem Finish." },
  },
  "full-lace": {
    en: { nome: "Full Lace", resumo: "A full lace base for lightness and a natural finish.", descricao: "A breathable full lace hair system designed for lightness and a natural finish across the entire base." },
    es: { nome: "Full Lace", resumo: "Base completa de encaje para ligereza y acabado natural.", descricao: "Prótesis capilar de encaje completo, transpirable, ligera y con acabado natural en toda la base." },
    fr: { nome: "Full Lace", resumo: "Base entièrement en tulle pour plus de légèreté et de naturel.", descricao: "Prothèse capillaire respirante entièrement en tulle, légère et naturelle sur toute la base." },
    de: { nome: "Full Lace", resumo: "Vollständige Lace-Basis für Leichtigkeit und ein natürliches Finish.", descricao: "Atmungsaktives Full-Lace-Haarsystem für Leichtigkeit und ein natürliches Finish auf der gesamten Basis." },
  },
  australia: {
    en: { nome: "Australia", resumo: "Lace where it shows and skin perimeter for a more secure hold.", descricao: "A hybrid base combining a natural-looking lace top with a skin perimeter for secure attachment." },
    es: { nome: "Australia", resumo: "Encaje donde se ve y perímetro de piel para una fijación más segura.", descricao: "Base híbrida con encaje natural en la parte superior y perímetro de piel para una fijación segura." },
    fr: { nome: "Australia", resumo: "Tulle visible et pourtour en micro-peau pour une fixation plus sûre.", descricao: "Base hybride avec tulle naturel sur le dessus et pourtour en micro-peau pour une fixation sûre." },
    de: { nome: "Australia", resumo: "Lace im sichtbaren Bereich und Mikrohautrand für sicheren Halt.", descricao: "Hybridbasis mit natürlich wirkendem Lace-Oberteil und Mikrohautrand für eine sichere Befestigung." },
  },
  "fita-20metros": {
    en: { nome: "20 m adhesive tape", resumo: "Adhesive tape for regular hair-system maintenance.", descricao: "A 20-metre roll of adhesive tape for hair-system attachment and maintenance." },
    es: { nome: "Cinta adhesiva de 20 m", resumo: "Cinta adhesiva para el mantenimiento periódico de la prótesis.", descricao: "Rollo de 20 metros de cinta adhesiva para fijación y mantenimiento de prótesis capilares." },
    fr: { nome: "Ruban adhésif 20 m", resumo: "Ruban adhésif pour l’entretien régulier de la prothèse.", descricao: "Rouleau de 20 mètres de ruban adhésif pour la fixation et l’entretien des prothèses capillaires." },
    de: { nome: "Klebeband 20 m", resumo: "Klebeband für die regelmäßige Pflege des Haarsystems.", descricao: "20-Meter-Rolle Klebeband zur Befestigung und Pflege von Haarsystemen." },
  },
  "controle-oleosidade": {
    en: { nome: "Oil-control treatment", resumo: "Helps prepare oily skin before attachment.", descricao: "Oil-control preparation for the scalp before attaching the hair system." },
    es: { nome: "Control de grasa", resumo: "Ayuda a preparar la piel grasa antes de la fijación.", descricao: "Preparación para controlar la grasa del cuero cabelludo antes de fijar la prótesis." },
    fr: { nome: "Contrôle du sébum", resumo: "Aide à préparer les peaux grasses avant la fixation.", descricao: "Préparation du cuir chevelu pour contrôler le sébum avant la fixation de la prothèse." },
    de: { nome: "Fettkontrolle", resumo: "Bereitet fettige Haut vor der Befestigung vor.", descricao: "Vorbereitung zur Kontrolle der Kopfhautfettung vor der Befestigung des Haarsystems." },
  },
  "cola-0015": {
    en: { nome: "15 ml adhesive", resumo: "Liquid adhesive for hair-system attachment.", descricao: "15 ml liquid adhesive for attaching and maintaining hair systems." },
    es: { nome: "Adhesivo de 15 ml", resumo: "Adhesivo líquido para fijar la prótesis capilar.", descricao: "Adhesivo líquido de 15 ml para fijación y mantenimiento de prótesis capilares." },
    fr: { nome: "Colle 15 ml", resumo: "Colle liquide pour la fixation de la prothèse capillaire.", descricao: "Colle liquide de 15 ml pour la fixation et l’entretien des prothèses capillaires." },
    de: { nome: "Kleber 15 ml", resumo: "Flüssigkleber zur Befestigung des Haarsystems.", descricao: "15 ml Flüssigkleber zur Befestigung und Pflege von Haarsystemen." },
  },
  removedor: {
    en: { nome: "Adhesive remover", resumo: "Helps remove adhesive during maintenance.", descricao: "Adhesive remover for safe hair-system maintenance and removal." },
    es: { nome: "Removedor de adhesivo", resumo: "Ayuda a retirar el adhesivo durante el mantenimiento.", descricao: "Removedor de adhesivo para retirar y mantener la prótesis capilar de forma segura." },
    fr: { nome: "Dissolvant d’adhésif", resumo: "Facilite le retrait de l’adhésif pendant l’entretien.", descricao: "Dissolvant d’adhésif pour retirer et entretenir la prothèse capillaire en toute sécurité." },
    de: { nome: "Klebstoffentferner", resumo: "Hilft, Klebstoff bei der Pflege zu entfernen.", descricao: "Klebstoffentferner für das sichere Abnehmen und Pflegen des Haarsystems." },
  },
};

export function produtoTraduzido(slug: string, locale: SiteLocale, fallbackName: string, fallbackDescription?: string | null): ProdutoTraduzido {
  if (locale === "pt") return { nome: fallbackName, resumo: fallbackDescription ?? "", descricao: fallbackDescription ?? "" };
  return PRODUTOS[slug]?.[locale] ?? { nome: fallbackName, resumo: fallbackDescription ?? "", descricao: fallbackDescription ?? "" };
}

