import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
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
