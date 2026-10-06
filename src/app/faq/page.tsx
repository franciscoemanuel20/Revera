import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { FAQ } from "@/components/ui/FAQ";
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import type { SiteLocale } from "@/lib/i18n/site";
import { faqTraduzido } from "@/lib/i18n/faq";

function jsonLdSeguro(valor: unknown) {
  return JSON.stringify(valor).replace(/</g, "\\u003c");
}

export const metadata: Metadata = {
  title: "Dúvidas sobre prótese capilar",
  description:
    "Respostas sobre prótese capilar Reverá: durabilidade, manutenção, garantia, envio, escolha de cor, naturalidade e compra online.",
  keywords: [
    "dúvidas sobre prótese capilar",
    "FAQ prótese capilar",
    "prótese capilar natural",
    "manutenção de prótese capilar",
  ],
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "Dúvidas sobre prótese capilar — Reverá",
    description:
      "Respostas sobre prótese capilar Reverá: durabilidade, manutenção, garantia, envio, escolha de cor, naturalidade e compra online.",
    url: "/faq",
  },
};

// Página pública de FAQ — as perguntas vêm direto de faq_items via a policy
// pública "public read faq" (is_visible = true, ver
// supabase/migrations/00000000000001_init.sql). Não há filtro por heurística
// de texto aqui: os itens com resposta "TODO: aguardando definição" já
// nascem is_visible=false no seed (seeds/faq.json) e a RLS os exclui antes
// mesmo de chegar neste componente — confiar em qualquer outra coisa seria
// reimplementar, pior, uma regra que já existe no banco.
const PAGE_COPY: Record<SiteLocale, { eyebrow: string; title: string; intro: string; cards: string[][] }> = {
  pt: { eyebrow: "Dúvidas", title: "Dúvidas sobre prótese capilar", intro: "Respostas diretas para escolher a peça, entender garantia, cuidar da prótese e comprar com mais segurança.", cards: [["Antes da compra", "Cor, naturalidade, textura e escolha do modelo."], ["Durante a compra", "Preço, carrinho, envio e revisão do pedido."], ["Depois que chega", "Teste dos fios, garantia, manutenção e cuidados."]] },
  en: { eyebrow: "Questions", title: "Hair system FAQ", intro: "Clear answers about choosing, warranty, care and international purchasing.", cards: [["Before buying", "Color, natural look, texture and model."], ["During checkout", "Price, cart, DHL shipping and order review."], ["After delivery", "Quality, warranty, maintenance and care."]] },
  es: { eyebrow: "Preguntas", title: "Preguntas sobre prótesis capilares", intro: "Respuestas claras para elegir, entender la garantía, cuidar la prótesis y comprar internacionalmente.", cards: [["Antes de comprar", "Color, naturalidad, textura y modelo."], ["Durante la compra", "Precio, carrito, DHL y revisión."], ["Después de la entrega", "Calidad, garantía, mantenimiento y cuidados."]] },
  fr: { eyebrow: "Questions", title: "Questions sur les prothèses capillaires", intro: "Des réponses claires pour choisir, comprendre la garantie, entretenir la prothèse et acheter à l’international.", cards: [["Avant l’achat", "Couleur, naturel, texture et modèle."], ["Pendant l’achat", "Prix, panier, DHL et vérification."], ["Après la livraison", "Qualité, garantie, entretien et soins."]] },
  de: { eyebrow: "Fragen", title: "Häufige Fragen zu Haarsystemen", intro: "Klare Antworten zu Auswahl, Garantie, Pflege und internationalem Kauf.", cards: [["Vor dem Kauf", "Farbe, Natürlichkeit, Textur und Modell."], ["Beim Kauf", "Preis, Warenkorb, DHL und Prüfung."], ["Nach der Lieferung", "Qualität, Garantie, Wartung und Pflege."]] },
};

async function FaqContent(locale: SiteLocale = "pt") {
  const copy = PAGE_COPY[locale];
  const supabase = await createClient();
  const { data: itens } = await supabase
    .from("faq_items")
    .select("id, question, answer")
    .order("sort_order");

  const translated = faqTraduzido(locale);
  const faqItems = translated ? translated.map((item, index) => ({ id: `faq-${locale}-${index}`, ...item })) : (itens ?? []).map((item) => ({
    id: item.id as string,
    question: item.question as string,
    answer: item.answer as string,
  }));

  const jsonLd =
    faqItems.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqItems.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer,
            },
          })),
        }
      : null;

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-12"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSeguro(jsonLd) }}
        />
      ) : null}

      <Reveal className="flex flex-col items-center gap-3 text-center">
        <span className="eyebrow-ink">{copy.eyebrow}</span>
        <h1 className="text-balance font-display text-3xl text-ink">
          {copy.title}
        </h1>
        <p className="max-w-2xl text-ink/70">
          {copy.intro}
        </p>
      </Reveal>

      <Reveal className="grid gap-3 sm:grid-cols-3">
        {copy.cards.map(([titulo, texto]) => (
          <div key={titulo} className="rounded-xl border border-sand bg-paper p-4">
            <h2 className="font-display text-base text-ink">{titulo}</h2>
            <p className="mt-2 text-sm leading-5 text-ink/70">{texto}</p>
          </div>
        ))}
      </Reveal>

      <Reveal>
        <FAQ items={faqItems} />
      </Reveal>
    </main>
  );
}

export default async function FaqPage(_props?: unknown, locale: SiteLocale = "pt") { return FaqContent(locale); }
