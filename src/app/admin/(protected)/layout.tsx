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

  // Vendas pagas que ainda ninguém abriu — o marcador do menu. Consulta com
  // head:true: traz o número, não as linhas.
  const { count: vendasNovasCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("payment_status", "paid")
    .is("seen_at", null)
    .is("canceled_at", null);
  const vendasNovas = vendasNovasCount ?? 0;

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
      {/* print:hidden — impressão de pedido (/admin/pedidos/[id]) some com o
          cabeçalho do painel: quem imprime quer o pedido, não o crachá do
          admin. Ver PrintButton.tsx. */}
      <header className="flex items-center justify-between border-b border-sand px-6 py-4 print:hidden">
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

      {/* No celular a navegação vira uma faixa horizontal rolável no topo —
          a coluna fixa de 224px espremia o conteúdo em ~150px de largura
          útil (visto no teste mobile de 28/08). Em md+ nada muda. */}
      <div className="flex flex-1 flex-col md:flex-row">
        <nav className="shrink-0 overflow-x-auto border-b border-sand px-4 py-3 md:w-56 md:border-b-0 md:border-r md:px-4 md:py-6 print:hidden">
          <div className="flex flex-row gap-1 md:flex-col">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-ink hover:bg-sand"
              >
                {item.label}
                {/* Vendas pagas que ninguém abriu ainda. Dourado, não
                    vermelho: vermelho neste painel significa erro, e venda
                    nova é a melhor notícia do dia. O número some quando ela
                    abre a tela — e abrir NÃO muda a situação de venda
                    nenhuma (ver marcarVendasVistasAction). */}
                {item.href === "/admin/pedidos" && vendasNovas > 0 ? (
                  <span
                    className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-ink"
                    aria-label={`${vendasNovas} venda(s) nova(s)`}
                  >
                    {vendasNovas}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </nav>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

// Um item por módulo desta entrega (26/08/2026) — Produtos já existia,
// os outros seis foram construídos junto com esta navegação. Ordem segue a
// que a auditoria listou: Dashboard primeiro (é a home do painel agora,
// ver src/app/admin/(protected)/page.tsx), Pedidos em seguida por ser "o
// módulo mais importante" do escopo.
const NAV_ITEMS = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/pedidos", label: "Vendas" },
  { href: "/admin/produtos", label: "Produtos" },
  { href: "/admin/precos", label: "Preços" },
  { href: "/admin/internacional", label: "Internacional" },
  { href: "/admin/solicitacoes", label: "Solicitações" },
  { href: "/admin/conteudo", label: "Conteúdo" },
  // Entram em 30/08/2026, do pedido do Francisco de mexer no site sem
  // depender de deploy. Ficam ao lado de "Conteúdo" e não dentro dele
  // porque são coisas diferentes: "Conteúdo" é o que já vinha do banco
  // (FAQ, depoimentos), "Textos" é o que estava preso no código, e "Fotos"
  // é arquivo.
  { href: "/admin/textos", label: "Textos" },
  { href: "/admin/midia", label: "Fotos" },
  { href: "/admin/configuracoes", label: "Configurações" },
] as const;
