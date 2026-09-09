"use client";

// Formulário da ferramenta "Ajude-me a descobrir minha cor" — usado dentro
// da seção #ajuda de /cores (ver page.tsx). O envio passa por Route Handler,
// que recusa pelo Content-Length antes de processar multipart grande. O
// painel ainda pode aceitar vídeos grandes via Server Action sem abrir essa
// porta pública para arquivos de até 30 MB.
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";

export function ColorHelpForm() {
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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

    if (arquivo.size > 5 * 1024 * 1024) {
      setErro("A imagem precisa ter até 5MB.");
      return;
    }

    const formData = new FormData();
    formData.set("customerName", customerName);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("photo", arquivo);

    setEnviando(true);
    let resultado: { error?: string; ok?: true };
    try {
      const resposta = await fetch("/api/ajuda-cor", { method: "POST", body: formData });
      resultado = (await resposta.json()) as { error?: string; ok?: true };
    } catch {
      resultado = { error: "Não foi possível enviar a foto agora. Tente novamente." };
    }
    setEnviando(false);

    if (!resultado.ok) {
      setErro(resultado.error ?? "Não foi possível enviar a foto agora. Tente novamente.");
      return;
    }

    setEnviado(true);
    setCustomerName("");
    setEmail("");
    setPhone("");
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

      <FormField label="E-mail" hint="Para nossa equipe responder." error={null}>
        {(props) => (
          <input
            {...props}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        )}
      </FormField>

      <FormField label="WhatsApp" hint="Opcional — se preferir, nossa equipe pode falar com você por lá." error={null}>
        {(props) => (
          <input
            {...props}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
