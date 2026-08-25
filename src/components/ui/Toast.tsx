"use client";

export type ToastVariant = "success" | "error" | "info";

export interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onClose?: () => void;
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "bg-moss text-paper",
  error: "bg-red-700 text-paper",
  info: "bg-ink text-paper",
};

// Só o componente visual — sem fila nem timer de auto-close ainda. Quem
// chama decide quando desmontar (ou implementa um hook próprio depois).
export function Toast({ message, variant = "info", onClose }: ToastProps) {
  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-4 rounded-md px-4 py-3 text-sm ${VARIANT_CLASSES[variant]}`}
    >
      <span>{message}</span>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Fechar aviso" className="opacity-80 hover:opacity-100">
          ✕
        </button>
      ) : null}
    </div>
  );
}
