"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Atraso em ms, para escalonar uma lista de itens (cards, grades). */
  delayMs?: number;
}

// Sempre renderiza um <div> — quem precisa de <section> semântica envolve
// o Reveal por fora (<section><Reveal>...</Reveal></section>). Tag
// dinâmica aqui só complicaria o tipo do ref sem ganho nenhum.

/**
 * Reveal — fade + leve translateY(16px) ao entrar na tela, uma vez só.
 *
 * Câmera visual e de conversão, 25/08/2026. Decisão: IntersectionObserver
 * nativo, sem framer-motion nem GSAP — o projeto pediu para continuar leve
 * (ver instrução da entrega), e "aparecer uma vez ao rolar" não precisa de
 * biblioteca nenhuma.
 *
 * prefers-reduced-motion é checado aqui dentro, no JS, não só delegado ao
 * CSS: quem tem a preferência ligada nunca deve ver SEQUER o instante
 * inicial em opacity:0 — o componente já nasce com data-visible="true" e
 * nem registra o observer. Ver globals.css para a camada de defesa em CSS
 * puro (cobre o caso do JS não ter rodado ainda).
 */
export function Reveal({ children, className = "", delayMs = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const prefereReduzido =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefereReduzido) {
      setVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    // threshold baixo (15%) — a seção não precisa estar quase inteira na
    // tela para começar a revelar; em blocos altos (galeria, vídeo) esperar
    // 100% visível deixaria a animação disparando tarde demais.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-visible={visible}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={`reveal ${className}`}
    >
      {children}
    </div>
  );
}
