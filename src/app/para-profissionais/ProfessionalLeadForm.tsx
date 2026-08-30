"use client";

// Formulário de cadastro de profissional — mesmo padrão de
// src/app/admin/(protected)/produtos/ProductForm.tsx: estado local por
// campo, conversão texto->null feita aqui (não no zod da action), Toast
// para erro, e aqui também para sucesso (a action não redireciona, porque
// não há "página seguinte" — o formulário só limpa e mostra confirmação).
//
// Os rótulos vêm prontos por prop, não de `textosDaPagina` chamado aqui
// dentro: isto é componente cliente, e quem lê o registro de conteúdo é
// sempre a página server (ver page.tsx, 30/08/2026) — mistura das duas
// coisas faria o texto editável depender de uma consulta ao banco rodando
// no navegador do visitante.
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";
import { enviarLeadProfissionalAction } from "./actions";

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";

export interface ProfessionalLeadFormTextos {
  nomeRotulo: string;
  telefoneRotulo: string;
  telefoneDica: string;
  emailRotulo: string;
  emailDica: string;
  empresaRotulo: string;
  empresaDica: string;
  cidadeRotulo: string;
  cidadeDica: string;
  mensagemRotulo: string;
  mensagemDica: string;
  botaoEnviar: string;
  mensagemSucesso: string;
}

export function ProfessionalLeadForm({ textos }: { textos: ProfessionalLeadFormTextos }) {
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
        message={textos.mensagemSucesso}
        variant="success"
        onClose={() => setEnviado(false)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      <FormField label={textos.nomeRotulo} error={null}>
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

      <FormField label={textos.telefoneRotulo} hint={textos.telefoneDica} error={null}>
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

      <FormField label={textos.emailRotulo} hint={textos.emailDica} error={null}>
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

      <FormField label={textos.empresaRotulo} hint={textos.empresaDica} error={null}>
        {(props) => (
          <input
            {...props}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className={inputClass}
          />
        )}
      </FormField>

      <FormField label={textos.cidadeRotulo} hint={textos.cidadeDica} error={null}>
        {(props) => (
          <input
            {...props}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputClass}
          />
        )}
      </FormField>

      <FormField label={textos.mensagemRotulo} hint={textos.mensagemDica} error={null}>
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
        {enviando ? "Enviando…" : textos.botaoEnviar}
      </Button>
    </form>
  );
}
