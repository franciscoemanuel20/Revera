import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, Manrope } from "next/font/google";
import { Pixels } from "@/components/tracking/Pixels";
import { PageViewTracker } from "@/components/tracking/PageViewTracker";
import { rastreamentoAtivoNesteAmbiente } from "@/lib/tracking/permissao";
import { CartProvider } from "@/components/cart/CartProvider";
import { Footer } from "@/components/ui/Footer";
import { Header } from "@/components/ui/Header";
import { baseUrl } from "@/lib/config/urls";
import "./globals.css";

// Fraunces: display serifado com itálico óptico, para headline e nome de
// produto. Manrope: corpo. Carregadas via next/font (self-hosted pelo
// build do Next, sem <link> externo) e expostas como CSS var para bater
// com --font-display/--font-body de src/styles/tokens.css — assim o
// tailwind.config.ts não precisa saber o nome real da fonte, só a var.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

/**
 * Base de SEO (P1, 27/08/2026).
 *
 * A auditoria de 26/08 mediu nove páginas públicas servindo o MESMO <title>
 * ("Reverá") e a MESMA description. Para o Google, isso não é um site com
 * nove páginas — é uma página repetida nove vezes, e ele escolhe sozinho
 * qual mostrar. Zero tags og: também significava que todo link colado no
 * WhatsApp aparecia sem título e sem imagem, justamente no canal por onde
 * esta marca é compartilhada.
 *
 * `title.template` faz cada página declarar só o próprio nome; o sufixo da
 * marca é aplicado aqui, num lugar só. `title.default` cobre a home.
 *
 * `metadataBase` é obrigatório para o Next resolver caminhos relativos em
 * openGraph.images — sem ele a imagem de compartilhamento sai com URL
 * relativa, que nenhum crawler resolve.
 */
export const metadata: Metadata = {
  metadataBase: new URL(baseUrl()),
  title: {
    default: "Reverá — Prótese capilar com acabamento natural",
    template: "%s — Reverá",
  },
  // 02/09/2026 — as três descrições abaixo citavam só a 0,08mm. A 0,06mm
  // está ativa no catálogo e é a mais fina; a descrição que o Google e o
  // WhatsApp mostram é o primeiro lugar em que alguém lê o que a loja vende.
  description:
    "Próteses capilares premium. Base ultrafina em 0,08mm e 0,06mm, acabamento natural na linha frontal. Envio para todo o Brasil.",
  applicationName: "Reverá",
  authors: [{ name: "Reverá" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Reverá",
    title: "Reverá — Prótese capilar com acabamento natural",
    description:
      "Base ultrafina em 0,08mm e 0,06mm, acabamento natural na linha frontal. Envio para todo o Brasil.",
    images: [
      {
        // Foto real do produto (public/media/hero), não arte gerada.
        url: "/media/hero/produto-close-1.jpeg",
        width: 1200,
        height: 630,
        alt: "Prótese capilar Reverá — acabamento da linha frontal",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reverá — Prótese capilar com acabamento natural",
    description:
      "Base ultrafina em 0,08mm e 0,06mm, acabamento natural na linha frontal.",
    images: ["/media/hero/produto-close-1.jpeg"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${manrope.variable}`}>
      <body className="flex min-h-screen flex-col">
        {/* Bases do Meta e do Google. Só carregam se o ID existir — sem
            variável configurada, nenhum script de terceiro entra na página.
            Ver src/components/tracking/Pixels.tsx para as duas armadilhas
            que este componente evita de propósito. */}
        <Pixels ativo={rastreamentoAtivoNesteAmbiente()} />

        {/* PageView em toda troca de rota. Dentro de <Suspense> porque usa
            useSearchParams, e sem o limite o Next força a página inteira a
            virar dinâmica — as páginas estáticas do site perderiam o
            pré-render por causa de um script de métrica. */}
        <Suspense fallback={null}>
          <PageViewTracker ativo={rastreamentoAtivoNesteAmbiente()} />
        </Suspense>

        {/* CartProvider por fora de Header/Footer: o contador de itens do
            Header, o drawer (renderizado dentro do próprio Provider, ver
            CartProvider.tsx) e o botão "comprar agora" de qualquer página de
            produto precisam do MESMO estado de carrinho, atualizado sem
            recarregar a página — daí um Provider no layout raiz, acima de
            tudo, em vez de estado local espalhado. */}
        <CartProvider>
          {/* Header é `fixed` (Header.tsx) — não entra no fluxo, então não
              empurra o conteúdo sozinho. Cada página pública compensa com
              padding-top próprio (HEADER_HEIGHT_PX), igual o hero da home já
              fazia antes de o header existir. */}
          <Header />
          <div className="flex-1">{children}</div>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
