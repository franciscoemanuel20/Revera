import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import type { SiteLocale } from "@/lib/i18n/site";

export const metadata: Metadata = {
  title: "Cores de prótese capilar",
  description:
    "Veja a cartela de cores da prótese capilar Reverá, incluindo tons naturais e grisalhos. Compare as fotos e escolha o tom mais próximo com segurança.",
  keywords: [
    "cores de prótese capilar",
    "cartela de cores prótese capilar",
    "prótese capilar grisalha",
    "cor de cabelo para prótese",
  ],
  alternates: { canonical: "/cores" },
  openGraph: {
    title: "Cores de prótese capilar — Reverá",
    description:
      "Veja a cartela de cores da prótese capilar Reverá, incluindo tons naturais e grisalhos. Compare as fotos e escolha o tom mais próximo com segurança.",
    url: "/cores",
  },
};

// Página pública de cores — as 8 fotos reais baixadas do Drive em
// 25/08/2026 (ver seeds/colors.json), servidas via colors.photo_url, que já
// aponta para public/media/cores/*.jpg. Nome de exibição é só o próprio
// código (1B, 2, 3...): a marca ainda não definiu rótulo comercial (ex.:
// "Castanho Escuro"), então não inventamos um aqui — mesma nota do seed.
const COPY: Record<SiteLocale, { eyebrow:string; title:string; intro:string; how:string; cards:string[][]; photoSoon:string; guide:string; guideTitle:string; guideText:string; steps:string[][] }> = {
  pt: { eyebrow:"Linha micropele", title:"Cores de prótese capilar Reverá", intro:"Compare as fotos da cartela antes de escolher. A cor selecionada na página do produto define a peça que vai para o carrinho.", how:"Como escolher a cor", cards:[["Luz natural","Compare sua referência em luz clara, sem filtro e sem sombra forte."],["Raiz e laterais","Olhe o tom próximo da raiz e das laterais, não só a ponta do fio."],["Conferência Reverá","Escolha o tom mais próximo agora. A equipe confere o pedido antes do envio."]], photoSoon:"Foto em breve", guide:"Guia rápido de cor", guideTitle:"Escolha a cor mais próxima e siga para a compra", guideText:"Compare a cartela com seu cabelo em luz natural, escolha o tom mais parecido na página do produto e finalize o pedido. A equipe Reverá confere se a peça separada bate com a cor escolhida antes do envio.", steps:[["1. Compare sem filtro","Use uma foto em luz natural e observe a raiz e as laterais."],["2. Escolha no produto","Volte ao modelo desejado, marque a cor mais próxima e adicione à sacola."],["3. Conferimos antes","Seu pedido passa por conferência da peça e da cor antes de ser despachado."]] },
  en: { eyebrow:"Micro-skin range", title:"Revera hair-system colors", intro:"Compare the color chart before choosing. The color selected on the product page defines the item added to your cart.", how:"How to choose a color", cards:[["Natural light","Compare your reference in clear natural light, without filters or strong shadows."],["Roots and sides","Match the shade near the roots and sides, not only the ends."],["Revera check","Choose the closest shade now; our team checks the item before dispatch."]], photoSoon:"Photo coming soon", guide:"Quick color guide", guideTitle:"Choose the closest color and continue", guideText:"Compare the chart with your hair in natural light, select the closest shade on the product page and complete your order.", steps:[["1. Compare without filters","Use a photo in natural light and look at the roots and sides."],["2. Select on the product page","Return to your model, select the closest color and add it to the cart."],["3. We check before shipping","Our team checks the item and selected color before dispatch."]] },
  es: { eyebrow:"Línea micro piel", title:"Colores de prótesis capilar Reverá", intro:"Compara la carta antes de elegir. El color seleccionado en la página del producto define la pieza del carrito.", how:"Cómo elegir el color", cards:[["Luz natural","Compara la referencia con luz natural, sin filtros ni sombras fuertes."],["Raíz y laterales","Observa el tono de la raíz y los laterales, no solo las puntas."],["Revisión Reverá","Elige el tono más cercano; nuestro equipo revisa la pieza antes del envío."]], photoSoon:"Foto próximamente", guide:"Guía rápida de color", guideTitle:"Elige el color más cercano y continúa", guideText:"Compara la carta con tu cabello bajo luz natural, selecciona el tono más parecido y finaliza el pedido.", steps:[["1. Compara sin filtros","Usa una foto con luz natural y observa la raíz y los laterales."],["2. Elige en el producto","Vuelve al modelo, marca el color más cercano y añádelo al carrito."],["3. Revisamos antes","El equipo revisa la pieza y el color antes del envío."]] },
  fr: { eyebrow:"Gamme micro-peau", title:"Couleurs des prothèses capillaires Reverá", intro:"Comparez le nuancier avant de choisir. La couleur sélectionnée sur la page produit définit l’article ajouté au panier.", how:"Comment choisir la couleur", cards:[["Lumière naturelle","Comparez à la lumière naturelle, sans filtre ni ombre marquée."],["Racines et côtés","Observez la teinte près des racines et sur les côtés, pas seulement les pointes."],["Contrôle Reverá","Choisissez la teinte la plus proche ; notre équipe contrôle l’article avant expédition."]], photoSoon:"Photo bientôt disponible", guide:"Guide rapide des couleurs", guideTitle:"Choisissez la couleur la plus proche et continuez", guideText:"Comparez le nuancier à vos cheveux en lumière naturelle, sélectionnez la teinte la plus proche et finalisez la commande.", steps:[["1. Comparez sans filtre","Utilisez une photo en lumière naturelle et observez les racines et les côtés."],["2. Choisissez sur la page produit","Revenez au modèle, sélectionnez la couleur et ajoutez-la au panier."],["3. Nous contrôlons avant l’envoi","Notre équipe contrôle l’article et la couleur avant expédition."]] },
  de: { eyebrow:"Mikrohaut-Serie", title:"Reverá Haarsystem-Farben", intro:"Vergleichen Sie die Farbkarte vor der Auswahl. Die auf der Produktseite gewählte Farbe bestimmt den Warenkorbartikel.", how:"So wählen Sie die Farbe", cards:[["Natürliches Licht","Vergleichen Sie bei natürlichem Licht, ohne Filter oder starke Schatten."],["Ansatz und Seiten","Achten Sie auf den Farbton am Ansatz und an den Seiten, nicht nur auf die Spitzen."],["Reverá Prüfung","Wählen Sie den ähnlichsten Ton; unser Team prüft den Artikel vor dem Versand."]], photoSoon:"Foto folgt in Kürze", guide:"Kurzer Farbguide", guideTitle:"Passende Farbe wählen und fortfahren", guideText:"Vergleichen Sie die Farbkarte bei natürlichem Licht, wählen Sie den ähnlichsten Ton auf der Produktseite und schließen Sie die Bestellung ab.", steps:[["1. Ohne Filter vergleichen","Verwenden Sie ein Foto bei natürlichem Licht und betrachten Sie Ansatz und Seiten."],["2. Auf der Produktseite wählen","Gehen Sie zum Modell, wählen Sie die Farbe und legen Sie sie in den Warenkorb."],["3. Prüfung vor Versand","Unser Team prüft Artikel und Farbe vor dem Versand."]] },
};

async function CoresContent(locale: SiteLocale = "pt") {
  const copy = COPY[locale];
  const supabase = await createClient();
  const { data: colors } = await supabase
    .from("colors")
    .select("id, code, name, photo_url")
    .eq("is_active", true)
    .order("sort_order");

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-3 text-center">
        <span className="eyebrow-ink">{copy.eyebrow}</span>
        <h1 className="text-balance font-display text-3xl text-ink">{copy.title}</h1>
        <p className="max-w-2xl text-ink/70">
          {copy.intro}
        </p>
      </Reveal>

      <section aria-label={copy.how} className="grid gap-3 sm:grid-cols-3">
        {copy.cards.map(([titulo, texto]) => (
          <Reveal key={titulo} className="rounded-xl border border-sand bg-paper p-4">
            <h2 className="font-display text-lg text-ink">{titulo}</h2>
            <p className="mt-2 text-sm leading-5 text-ink/70">{texto}</p>
          </Reveal>
        ))}
      </section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(colors ?? []).map((color, i) => (
          <Reveal key={color.id as string} delayMs={i * 60} className="flex flex-col gap-2">
            <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-sand">
              {color.photo_url ? (
                <Image
                  src={color.photo_url as string}
                  alt={`Cor ${color.name as string}`}
                  fill
                  sizes="(min-width: 640px) 25vw, 50vw"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
              ) : (
                /**
                 * COR SEM FOTO NÃO É UM BURACO (03/09/2026).
                 *
                 * Até aqui a cor sem `photo_url` rendia um retângulo cor de
                 * areia e nada mais — e um quadrado vazio numa cartela de
                 * cores não se lê como "foto pendente", se lê como site
                 * quebrado. O caso deixou de ser hipotético quando o
                 * Francisco ativou a 3.20, a 3.30 e a 3.40, que existem no
                 * catálogo, têm preço e estoque, e ainda não foram
                 * fotografadas.
                 *
                 * A frase é o mínimo honesto: diz que a foto vem, sem
                 * inventar uma cor que ninguém conferiu. Some sozinha no dia
                 * em que a foto for cadastrada.
                 *
                 * `text-ink/70`, e não mais claro: sobre `bg-sand` o /45 dava
                 * 3,0:1 de contraste, abaixo dos 4,5:1 que a WCAG AA pede
                 * para texto deste tamanho (achado do Codex). O /70 dá 6,7:1.
                 */
                <span className="flex h-full w-full items-center justify-center px-2 text-center text-sm text-ink/70">
                  {copy.photoSoon}
                </span>
              )}
            </div>
            <span className="text-center font-display text-ink">
              {color.name as string}
            </span>
          </Reveal>
        ))}
      </div>

      <section id="ajuda" className="flex scroll-mt-28 flex-col gap-2 rounded-2xl border border-sand bg-sand/25 p-6 text-center">
        <span className="eyebrow-ink mx-auto">{copy.guide}</span>
        <h2 className="font-display text-2xl text-ink">
          {copy.guideTitle}
        </h2>
        <p className="mx-auto max-w-prose text-ink/80">
          {copy.guideText}
        </p>
        <div className="mx-auto mt-4 grid max-w-3xl gap-3 text-left text-sm text-ink/75 sm:grid-cols-3">
          {copy.steps.map(([title, text]) => <div key={title} className="rounded-xl border border-sand bg-paper p-4"><h3 className="font-semibold text-ink">{title}</h3><p className="mt-1 leading-6">{text}</p></div>)}
        </div>
      </section>
    </main>
  );
}

export default async function CoresPage(_props?: unknown, locale: SiteLocale = "pt") { return CoresContent(locale); }
