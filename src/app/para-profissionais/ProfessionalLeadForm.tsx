"use client";

// Formulário de cadastro de profissional — mesmo padrão de
// src/app/admin/(protected)/produtos/ProductForm.tsx: estado local por
// campo, conversão texto->null feita aqui (não no zod da action), Toast
// para erro, e aqui também para sucesso (a action não redireciona, porque
// não há "página seguinte" — o formulário só limpa e mostra confirmação).
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";
import { enviarLeadProfissionalAction } from "./actions";

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";

export function ProfessionalLeadForm() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [message, setMessage] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setEnviando(true);

    const resultado = await enviarLeadProfissionalAction({
      fullName,
      phone,
      email: email.trim() ? email : null,
      businessName: businessName.trim() ? businessName : null,
      city: city.trim() ? city : null,
      message: message.trim() ? message : null,
    });

    setEnviando(false);

    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }

    setEnviado(true);
    setFullName("");
    setPhone("");
    setEmail("");
    setBusinessName("");
    setCity("");
    setMessage("");
  }

  if (enviado) {
    return (
      <Toast
        message="Recebemos seu contato. Nossa equipe entra em contato para apresentar as condições."
        variant="success"
        onClose={() => setEnviado(false)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      <FormField label="Nome" error={null}>
        {(props) => (
          <input
            {...props}
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
          />
        )}
      </FormField>

      <FormField label="Telefone" hint="Com DDD." error={null}>
        {(props) => (
          <input
            {...props}
            required
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        )}
      </FormField>

      <FormField label="E-mail" hint="Opcional." error={null}>
        {(props) => (
          <input
            {...props}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        )}
      </FormField>

      <FormField label="Nome do salão ou barbearia" hint="Opcional." error={null}>
        {(props) => (
          <input
            {...props}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className={inputClass}
          />
        )}
      </FormField>

      <FormField label="Cidade" hint="Opcional." error={null}>
        {(props) => (
          <input
            {...props}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputClass}
          />
        )}
      </FormField>

      <FormField label="Mensagem" hint="Conte um pouco sobre o volume que você trabalha. Opcional." error={null}>
        {(props) => (
          <textarea
            {...props}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={inputClass}
          />
        )}
      </FormField>

      <Button type="submit" disabled={enviando}>
        {enviando ? "Enviando…" : "Quero ser contatado"}
      </Button>
    </form>
  );
}
