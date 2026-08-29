"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CartTriggerButton } from "@/components/cart/CartTriggerButton";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";

const LINKS = [
  // "Próteses" primeiro, e de propósito (29/08/2026): sem esta entrada,
  // quatro dos cinco produtos ativos não eram alcançáveis por navegação
  // nenhuma — só a Micropele 0,08mm, pelos botões da home.
  { href: "/produtos", label: "Próteses" },
  { href: "/cores", label: "Cores" },
  { href: "/cuidados", label: "Cuidados" },
  { href: "/garantia", label: "Garantia" },
  { href: "/faq", label: "FAQ" },
];

// Três páginas novas da auditoria de 26/08/2026 (explicação, objeção de
// naturalidade, confiança) agrupadas num dropdown "Conheça" — 4 + 3 + 1
// (Para profissionais) link soltos ficariam 8 itens numa linha só, e o
// container tem max-w-5xl; testado de olho contra a largura da logo +
// botão de menu mobile, não cabe sem quebrar. Agrupar é o que a missão
// pediu ("se o menu ficar grande demais, agrupe com bom senso"), sem tirar
// nenhum link que já existia.
const LINKS_CONHECA = [
  { href: "/sobre-as-proteses", label: "Sobre as próteses" },
  { href: "/naturalidade", label: "Naturalidade" },
  { href: "/por-que-revera", label: "Por que Reverá" },
];

// Fora do dropdown, como os outros: é a página que capta lead de um público
// diferente (profissional, não cliente final) — enterrar num submenu de
// conteúdo institucional esconderia justamente o link que mais importa
// para esse público.
const LINK_PROFISSIONAIS = { href: "/para-profissionais", label: "Para profissionais" };

// Lista achatada para o menu mobile (details/summary vertical, sem
// necessidade de segundo nível — ver por quê no <details> lá embaixo).
const LINKS_MOBILE = [...LINKS, ...LINKS_CONHECA, LINK_PROFISSIONAIS];

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

  /**
   * CLICAR FORA (OU APERTAR ESC) FECHA OS MENUS (29/08/2026).
   *
   * Os dois menus deste header são <details>/<summary> nativos, escolhidos
   * de propósito para não depender de JS. O preço disso é que <details> só
   * fecha quando se clica no próprio <summary> de novo — clicar fora deixa o
   * menu aberto por cima do conteúdo, e a pessoa acha que a página travou.
   * Foi exatamente a queixa do Francisco em 29/08.
   *
   * Este efeito devolve o comportamento que todo mundo espera sem abrir mão
   * do <details>: fecha o que estiver aberto quando o clique acontece fora
   * dele. `pointerdown` em vez de `click` para responder já no toque, que no
   * celular é o que dá a sensação de resposta imediata.
   */
  useEffect(() => {
    function fecharAbertos(alvo: Node | null) {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>(
        "header details[open]"
      )) {
        if (alvo && menu.contains(alvo)) continue;
        menu.open = false;
      }
    }
    const aoApontar = (e: PointerEvent) => fecharAbertos(e.target as Node | null);
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharAbertos(null);
    };
    document.addEventListener("pointerdown", aoApontar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoApontar);
      document.removeEventListener("keydown", aoTeclar);
    };
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

        {/* Agrupa nav desktop + sacola + menu mobile num único item flex à
            direita — justify-between do container pai só espera DOIS
            filhos (logo | resto); um terceiro filho sempre visível (a
            sacola) quebraria esse espaçamento se ficasse solto aqui. */}
        <div className="flex items-center gap-4">
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

          {/* Dropdown "Conheça" — mesmo padrão <details>/<summary> do menu
              mobile logo abaixo, só que inline. Sem JS extra: <details>
              fecha ao clicar fora sozinho no Safari/Chrome recentes; onde
              não fecha, navegar por um dos links já desmonta o menu de
              qualquer forma. */}
          <details className="relative">
            <summary
              className="flex cursor-pointer list-none items-center gap-1 text-sm text-paper/85 transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold [&::-webkit-details-marker]:hidden"
            >
              Conheça
              <span aria-hidden="true" className="text-xs">▾</span>
            </summary>
            <nav className="surface-elevada absolute left-1/2 top-full mt-2 flex w-56 -translate-x-1/2 flex-col gap-1 rounded-md p-2 shadow-glow-gold">
              {LINKS_CONHECA.map((link) => (
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

          <Link
            href={LINK_PROFISSIONAIS.href}
            className="text-sm text-paper/85 transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
          >
            {LINK_PROFISSIONAIS.label}
          </Link>
        </nav>

        <CartTriggerButton className="text-paper/85 hover:text-gold" />

        {/* Mobile: <details>/<summary> em vez de drawer — não há gesto de
            "arrastar para fechar" nem trava de scroll do body, mas cobre o
            caso (abrir/fechar uma lista de links) sem JS extra nem
            biblioteca de menu. Lista achatada (LINKS_MOBILE): no vertical
            não existe a pressão de largura que motivou o dropdown
            "Conheça" no desktop, então aqui os 8 links vão soltos, na
            mesma ordem de antes + os novos no fim — w-44 virou w-56 só
            porque "Sobre as próteses" não cabia numa linha. */}
        <details className="relative sm:hidden">
          <summary
            aria-label="Abrir menu"
            className="flex min-h-toque min-w-toque list-none items-center justify-center text-paper [&::-webkit-details-marker]:hidden"
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              ≡
            </span>
          </summary>
          <nav className="surface-elevada absolute right-0 top-full mt-2 flex w-56 flex-col gap-1 rounded-md p-2 shadow-glow-gold">
            {LINKS_MOBILE.map((link) => (
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
      </div>
    </header>
  );
}
