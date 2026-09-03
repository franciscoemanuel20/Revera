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
import { conferirLead } from "./lead-schema";

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

export function ProfessionalLeadForm({
  textos,
  whatsappHref,
}: {
  textos: ProfessionalLeadFormTextos;
  /**
   * Link do WhatsApp da Reverá, montado na página server (page.tsx) — é para
   * lá que o botão leva depois de gravar o lead. Vem por prop, e não montado
   * aqui, porque número e mensagem são conteúdo comercial: ficam num lugar
   * só, junto do comentário que explica por que o DDI é obrigatório.
   */
  whatsappHref: string;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [message, setMessage] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // 03/09/2026 — o botão deixou de ser um fim de linha. Antes ele gravava o
  // lead, mostrava "recebemos seu contato" e a conversa dependia da equipe
  // lembrar de ligar. Agora ele grava E abre o WhatsApp da Reverá com a
  // mensagem pronta: quem clicou já sai falando com a loja.
  //
  // Três decisões que parecem detalhe e não são:
  //
  // 1. O que falta (nome, telefone) é conferido AQUI, antes de qualquer
  //    envio — erro que o visitante corrige em dois segundos não deve virar
  //    ida ao servidor nem mandar ninguém para o WhatsApp com o formulário
  //    pela metade.
  // 2. Falha do SERVIDOR não segura o cliente. Se o insert cair, o lead se
  //    perde, mas a conversa acontece — e conversa no WhatsApp vale mais que
  //    linha no banco. O caminho oposto (mostrar erro e ficar na página) é
  //    exatamente o beco sem saída que já custou lead nesta operação.
  // 3. A aba do WhatsApp é aberta VAZIA no clique e só recebe o endereço
  //    depois do await. Depois de um `await` o navegador não considera mais
  //    que houve gesto do usuário e bloqueia `window.open` — abrindo antes,
  //    a permissão já está dada. Se mesmo assim vier bloqueada (`null`), a
  //    ida acontece na própria aba: melhor perder a confirmação na tela do
  //    que perder o cliente.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    const dados = {
      fullName,
      phone,
      email: email.trim() ? email : null,
      businessName: businessName.trim() ? businessName : null,
      city: city.trim() ? city : null,
      message: message.trim() ? message : null,
    };

    // A conferência usa o MESMO schema do servidor (lead-schema.ts), não uma
    // segunda versão da regra escrita à mão: como o erro da action deixou de
    // aparecer na tela, qualquer campo que o zod recuse e o navegador aceite
    // vira cadastro perdido em silêncio. O formulário tem `noValidate`, então
    // o navegador não confere nada sozinho.
    const falta = conferirLead(dados);
    if (falta) {
      setErro(falta);
      return;
    }

    // Sem "noopener" na terceira posição de propósito: com ele o navegador
    // devolve `null` e não sobra handle nenhum para apontar depois do await —
    // era o oposto do que esta aba existe para fazer. O elo de volta é cortado
    // logo abaixo, com `opener = null`, antes de a aba sair para o wa.me.
    const abaWhatsApp = window.open("", "_blank");
    setEnviando(true);

    // O try existe porque a Server Action pode ESTOURAR, não só devolver
    // erro: rede caindo no meio, timeout, cliente do Supabase falhando ao
    // ser criado. Sem ele a exceção subiria e nada abaixo rodaria — a aba
    // ficaria em branco para sempre e o botão preso em "Enviando…", que é
    // justamente o beco sem saída que esta mudança existe para eliminar.
    let gravou = false;
    try {
      const resultado = await enviarLeadProfissionalAction(dados);
      gravou = !("error" in resultado);
      if (!gravou) {
        // Sem Toast de erro: o cliente está indo para o WhatsApp e não há
        // nada que ele possa fazer a respeito. Quem precisa saber é quem lê
        // o log.
        console.error("[para-profissionais] lead não gravado:", resultado);
      }
    } catch (e) {
      console.error("[para-profissionais] falha ao enviar o lead:", e);
    }

    setEnviando(false);

    if (abaWhatsApp) {
      abaWhatsApp.opener = null;
      abaWhatsApp.location.href = whatsappHref;
      // "Recebemos seu contato" só aparece se o contato foi mesmo recebido.
      // Quando a gravação falha, a página fica como está — a conversa já
      // seguiu na outra aba, e uma confirmação falsa seria mentira.
      if (!gravou) return;
      setEnviado(true);
      setFullName("");
      setPhone("");
      setEmail("");
      setBusinessName("");
      setCity("");
      setMessage("");
      return;
    }

    window.location.assign(whatsappHref);
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
