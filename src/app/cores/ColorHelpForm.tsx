"use client";

// Formulário da ferramenta "Ajude-me a descobrir minha cor" — usado dentro
// da seção #ajuda de /cores (ver page.tsx). Chama a Server Action com
// FormData (não com objeto JSON, ver comentário em actions.ts) porque o
// arquivo da foto só viaja assim.
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";
import { enviarPedidoAjudaCorAction } from "./actions";

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";

export function ColorHelpForm() {
  const [customerName, setCustomerName] = useState("");
  const [contact, setContact] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    const arquivo = fileInputRef.current?.files?.[0];
    if (!arquivo) {
      setErro("Envie uma foto do seu cabelo.");
      return;
    }

    const formData = new FormData();
    formData.set("customerName", customerName);
    formData.set("contact", contact);
    formData.set("photo", arquivo);

    setEnviando(true);
    const resultado = await enviarPedidoAjudaCorAction(formData);
    setEnviando(false);

    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }

    setEnviado(true);
    setCustomerName("");
    setContact("");
    setNomeArquivo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (enviado) {
    return (
      <Toast
        message="Recebemos sua foto. Nossa equipe indica a cor mais parecida entre as opções disponíveis."
        variant="success"
        onClose={() => setEnviado(false)}
      />
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-5 text-left"
      noValidate
    >
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      <FormField label="Nome" error={null}>
        {(props) => (
          <input
            {...props}
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className={inputClass}
          />
        )}
      </FormField>

      <FormField label="Telefone ou e-mail" hint="Para nossa equipe te responder." error={null}>
        {(props) => (
          <input
            {...props}
            required
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className={inputClass}
          />
        )}
      </FormField>

      <FormField
        label="Foto do seu cabelo"
        hint="Imagem, até 5MB. Usada só para nossa equipe indicar a cor — não é exibida publicamente."
        error={null}
      >
        {(props) => (
          <input
            {...props}
            ref={fileInputRef}
            type="file"
            accept="image/*"
            required
            onChange={(e) => setNomeArquivo(e.target.files?.[0]?.name ?? null)}
            className={`${inputClass} file:mr-3 file:min-h-toque file:cursor-pointer file:rounded file:border-0 file:bg-ink file:px-3 file:text-sm file:text-paper`}
          />
        )}
      </FormField>
      {nomeArquivo ? <p className="-mt-3 text-sm text-ink/60">Selecionada: {nomeArquivo}</p> : null}

      <Button type="submit" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar foto"}
      </Button>
    </form>
  );
}
