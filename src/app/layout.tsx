import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
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
      <body>{children}</body>
    </html>
  );
}
