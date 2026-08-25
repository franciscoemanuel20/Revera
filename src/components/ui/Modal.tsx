"use client";
import type { ReactNode } from "react";

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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
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
