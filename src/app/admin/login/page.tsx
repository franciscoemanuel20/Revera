"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";

// Login do admin — client component porque signInWithPassword precisa do
// client de navegador (createBrowserClient), que é quem grava o cookie de
// sessão que o server client (src/lib/supabase/server.ts) depois lê no
// layout de /admin. Sem middleware de refresh de sessão ainda (não é
// necessário para o escopo desta entrega: o cookie que o supabase-js grava
// no login já viaja na primeira requisição pós-navegação).
//
// Mensagem de erro deliberadamente genérica: o Supabase distingue "usuário
// não existe" de "senha errada" na resposta, mas expor essa diferença para
// quem está tentando logar é dar pista de enumeração de e-mail cadastrado.
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      setCarregando(false);
      setErro("E-mail ou senha incorretos.");
      return;
    }

    // router.refresh() força o layout de /admin (server component) a ler
    // o cookie de sessão recém-gravado antes do redirect renderizar.
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {/* A logo já traz o nome da marca; o h1 fica como texto acessível
            fora da tela para não repetir "Reverá" visualmente duas vezes. */}
        <h1 className="sr-only">Reverá — painel administrativo</h1>
        {/* Fundo claro: usa a variante clara OFICIAL da marca (a arte veio
            com as duas versões, escura e clara). Não usar aqui o PNG com
            alfa — ele é despremultiplicado para compor sobre escuro e sai
            lavado em fundo claro. */}
        <Image
          src="/media/marca/logo-revera-claro.png"
          alt=""
          width={1130}
          height={620}
          priority
          className="h-auto w-[220px]"
        />
        <p className="text-sm text-ink/70">Painel administrativo</p>
      </div>

      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <FormField label="E-mail" error={null}>
          {(props) => (
            <input
              {...props}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink"
            />
          )}
        </FormField>

        <FormField label="Senha" error={null}>
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              className="min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink"
            />
          )}
        </FormField>

        <Button type="submit" disabled={carregando} className="w-full">
          {carregando ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </main>
  );
}
