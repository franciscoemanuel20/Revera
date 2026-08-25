import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { signOutAction } from "../actions";

// Guarda de acesso de todo /admin/*. Server component de propósito: a
// checagem de sessão e de admin_users acontece antes de qualquer HTML da
// página filha ser montado, então não existe "flash" de conteúdo protegido
// para quem não devia ver.
//
// getUser() em vez de getSession(): getSession() só lê o cookie (que um
// client malicioso pode forjar sem o Supabase notar); getUser() revalida
// contra o servidor de auth do Supabase a cada chamada. É a recomendação
// oficial do @supabase/ssr para checagem de servidor — mais uma
// ida-e-volta de rede, mas é o preço de não confiar cegamente no cookie.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  // Estar autenticado no Supabase Auth não basta — precisa ter linha em
  // admin_users (é essa tabela que decide quem administra a loja, não a
  // existência de conta). Até a migration 00000000000002 ser aplicada no
  // projeto real, esta consulta volta vazia para todo mundo (RLS ainda sem
  // policy de leitura própria) — comportamento esperado enquanto o
  // Francisco não colar a migration no SQL Editor.
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminUser) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-xl text-ink">Sem permissão de acesso</h1>
        <p className="text-sm text-ink/70">
          Este e-mail está autenticado, mas não tem cadastro de administrador na
          Reverá. Fale com quem cuida do painel para liberar seu acesso.
        </p>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary">
            Sair
          </Button>
        </form>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-sand px-6 py-4">
        <span className="font-display text-lg italic text-ink">Reverá — admin</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-ink/70">{adminUser.full_name ?? user.email}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sair
            </Button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="w-56 shrink-0 border-r border-sand px-4 py-6">
          <Link
            href="/admin/produtos"
            className="block rounded-md px-3 py-2 text-sm font-medium text-ink hover:bg-sand"
          >
            Produtos
          </Link>
        </nav>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
