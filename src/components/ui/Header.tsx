"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";

const LINKS = [
  { href: "/cores", label: "Cores" },
  { href: "/cuidados", label: "Cuidados" },
  { href: "/garantia", label: "Garantia" },
  { href: "/faq", label: "FAQ" },
];

/**
 * Header fixo — camada visual e de conversão, 25/08/2026.
 *
 * Começa "transparente" sobre o hero escuro da home, e vira preto sólido +
 * filete dourado embaixo depois de ~80px de rolagem — mas SÓ na home. Nas
 * outras páginas públicas (cores, produto, faq, cuidados, garantia) o topo
 * é --paper (claro), sem hero nenhum por baixo do header, e o texto do
 * header é claro (text-paper) — cálculo de contraste feito na entrega
 * (ver conta abaixo) mostrou que um header semitransparente sobre página
 * clara mistura ink+paper e cai pra ~3,1:1, abaixo do mínimo WCAG AA
 * (4,5:1). Por isso o estado "flutuante" só existe onde o fundo por trás
 * É de fato escuro (home, antes de rolar); em qualquer outra rota o header
 * já nasce sólido, do mesmo jeito que fica depois de rolar.
 *
 * Conta (25/08/2026): texto --paper sobre o degradê ink/70→30 misturado com
 * --paper por trás dá ≈3,13:1; o mesmo texto sobre --ink puro (home, hero)
 * dá ≈18,68:1. A diferença é só ISSO — de onde vem a regra acima.
 */
export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const aoRolar = () => setScrolled(window.scrollY > 80);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  // Mesmo padrão do Footer (src/components/ui/Footer.tsx): o admin tem seu
  // próprio header/nav em src/app/admin/(protected)/layout.tsx, então este
  // não aparece ali.
  if (pathname?.startsWith("/admin")) {
    return null;
  }

  // "Flutuante" (sem fundo sólido) só na home, e só antes de rolar — é a
  // única rota com hero escuro logo atrás do header. Em qualquer outra
  // página, ou depois de rolar na própria home, o header é sólido.
  const flutuante = pathname === "/" && !scrolled;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-300 ${
        flutuante
          ? "border-b border-transparent bg-gradient-to-b from-ink/70 via-ink/30 to-transparent"
          : "border-b border-gold/30 bg-ink"
      }`}
      style={{ height: HEADER_HEIGHT_PX }}
    >
      <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-between px-6">
        <Link href="/" className="shrink-0" aria-label="Reverá — início">
          {/* logo-revera.png é a versão com alfa para fundo escuro (ver
              comentário em src/app/page.tsx) — o header nunca fica sobre
              fundo claro sem o degradê escuro acima, então é sempre seguro
              usar esta versão aqui. */}
          <Image
            src="/media/marca/logo-revera.png"
            alt="Reverá"
            width={1500}
            height={920}
            priority
            className="h-8 w-auto sm:h-9"
          />
        </Link>

        <nav className="hidden items-center gap-8 sm:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-paper/85 transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mobile: <details>/<summary> em vez de drawer — não há gesto de
            "arrastar para fechar" nem trava de scroll do body, mas cobre o
            caso (abrir/fechar uma lista de 4 links) sem JS extra nem
            biblioteca de menu. */}
        <details className="relative sm:hidden">
          <summary
            aria-label="Abrir menu"
            className="flex min-h-toque min-w-toque list-none items-center justify-center text-paper [&::-webkit-details-marker]:hidden"
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              ≡
            </span>
          </summary>
          <nav className="surface-elevada absolute right-0 top-full mt-2 flex w-44 flex-col gap-1 rounded-md p-2 shadow-glow-gold">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="min-h-toque rounded px-3 py-2 text-sm text-paper/90 transition-colors hover:bg-ink hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
