"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { activateDialogFocus, isTopDialog } from "@/lib/ui/dialog-focus";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open && dialogRef.current) return activateDialogFocus(dialogRef.current);
  }, [open]);
  // Esc fecha — ver o mesmo raciocínio em CartDrawer.tsx (29/08/2026).
  useEffect(() => {
    if (!open) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape" && dialogRef.current && isTopDialog(dialogRef.current)) onClose();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [open, onClose]);

  if (!open) return null;

  return (
    /* Clicar no fundo fecha; clicar dentro do cartão, não — a checagem
       `e.target === e.currentTarget` é o que separa as duas coisas. */
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "Diálogo"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-paper p-6">
        <div className="flex items-center justify-between">
          {title ? <h2 id={titleId} className="font-display text-xl text-ink">{title}</h2> : <span />}
          <button type="button" onClick={onClose} aria-label="Fechar" className="min-h-toque min-w-toque">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
