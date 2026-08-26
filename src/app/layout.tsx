import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, Manrope } from "next/font/google";
import { Pixels } from "@/components/tracking/Pixels";
import { PageViewTracker } from "@/components/tracking/PageViewTracker";
import { CartProvider } from "@/components/cart/CartProvider";
import { Footer } from "@/components/ui/Footer";
import { Header } from "@/components/ui/Header";
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

export const metadata: Metadata = {
  title: "Reverá",
  description:
    "Próteses capilares premium. Base ultrafina, acabamento natural.",
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
        <Pixels />

        {/* PageView em toda troca de rota. Dentro de <Suspense> porque usa
            useSearchParams, e sem o limite o Next força a página inteira a
            virar dinâmica — as páginas estáticas do site perderiam o
            pré-render por causa de um script de métrica. */}
        <Suspense fallback={null}>
          <PageViewTracker />
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
