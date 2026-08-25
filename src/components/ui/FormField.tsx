"use client";
import { useId, type ReactNode } from "react";

type FormFieldRenderProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export interface FormFieldProps {
  label: string;
  error?: string | null;
  hint?: string;
  children: (props: FormFieldRenderProps) => ReactNode;
}

// Mesmo padrão do componente Campo do projeto irmão
// (saas-metodo-francisco/src/components/campo.tsx): label->input->erro
// associados por useId, erro com role="alert" para leitor de tela falar
// assim que aparece. Formulário de endereço, pedido de garantia e lead de
// profissional devem usar isto em vez de reimplementar a associação.
export function FormField({ label, error, hint, children }: FormFieldProps) {
  const id = useId();
  const erroId = `${id}-erro`;

  return (
    <div className="flex flex-col gap-2 text-left">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children({
        id,
        "aria-describedby": error ? erroId : undefined,
        "aria-invalid": Boolean(error),
      })}
      {hint && !error ? <p className="text-sm text-ink/50">{hint}</p> : null}
      {error ? (
        <p id={erroId} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
