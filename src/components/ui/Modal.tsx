"use client";
import { useEffect, type ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

// Genérico — CartDrawer não usa isto por baixo (é um painel lateral fixo,
// não um modal centralizado), mas pedido de garantia, ajuda de cor e
// confirmação de admin devem usar este componente em vez de reimplementar
// overlay/foco.
export function Modal({ open, onClose, title, children }: ModalProps) {
  // Esc fecha — ver o mesmo raciocínio em CartDrawer.tsx (29/08/2026).
  useEffect(() => {
    if (!open) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onClose();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [open, onClose]);

  if (!open) return null;

  return (
    /* Clicar no fundo fecha; clicar dentro do cartão, não — a checagem
       `e.target === e.currentTarget` é o que separa as duas coisas. */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-paper p-6">
        <div className="flex items-center justify-between">
          {title ? <h2 className="font-display text-xl text-ink">{title}</h2> : <span />}
          <button type="button" onClick={onClose} aria-label="Fechar" className="min-h-toque min-w-toque">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
