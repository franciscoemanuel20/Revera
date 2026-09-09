"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Rodapé das páginas públicas — só links que já existem de fato (a lista
// cresceu de 5 para 9 em 26/08/2026, ver comentário abaixo de LINKS). Nada
// de WhatsApp, e-mail ou rede social aqui: o único contato pós-venda da
// Reverá ainda não tem página própria, e colocar telefone num rodapé que
// qualquer visitante vê violaria a regra de "contato só em conteúdo
// pós-compra" (ver CLAUDE.md do projeto).
//
// "use client" + usePathname, e não um Footer só de servidor: o layout raiz
// (src/app/layout.tsx) é compartilhado por / e por /admin/*, e o admin já
// tem seu próprio header/nav (src/app/admin/(protected)/layout.tsx) — sem
// rodapé duplicado ali. Checar o pathname aqui dentro evita duplicar o
// root layout inteiro em route groups só para isso.
// 26/08/2026: mais quatro links da auditoria de páginas públicas
// (src/components/ui/Header.tsx tem o mesmo grupo). Sem agrupar em
// dropdown aqui — a <nav> do rodapé já nasceu com flex-wrap, então ganhar
// mais uma linha no mobile não quebra nada, ao contrário do header fixo.
//
// 08/09/2026 — reorganizados em duas colunas temáticas (eram uma <nav> só,
// em flex-wrap). MESMOS 10 links de antes, nenhum novo, nenhum removido —
// só agrupados por assunto, mais fácil de escanear que uma lista corrida.
// Não entram Termos/Privacidade/Reembolso/CNPJ: essas páginas não existem
// ainda e não há texto legal pronto (decisão do Francisco, 08/09/2026).
const GRUPOS_DE_LINKS = [
  {
    titulo: "Loja",
    links: [
      { href: "/", label: "Início" },
      { href: "/produtos", label: "Próteses" },
      { href: "/cores", label: "Cores" },
    ],
  },
  {
    titulo: "Saiba mais",
    links: [
      { href: "/cuidados", label: "Cuidados" },
      { href: "/garantia", label: "Garantia" },
      { href: "/faq", label: "Perguntas frequentes" },
      { href: "/sobre-as-proteses", label: "Sobre as próteses" },
      { href: "/naturalidade", label: "Naturalidade" },
      { href: "/por-que-revera", label: "Por que Reverá" },
      { href: "/para-profissionais", label: "Para profissionais" },
      { href: "/privacidade", label: "Privacidade" },
      { href: "/termos", label: "Termos de uso" },
      { href: "/cookies", label: "Cookies" },
    ],
  },
];

export function Footer() {
  const pathname = usePathname();

  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return (
    <footer className="mt-auto bg-ink px-6 py-10">
      {/* filete dourado, não border-sand: --sand (areia) some sobre --ink
          (ver globals.css, .divider-gold) — camada visual, 25/08/2026. */}
      <div className="divider-gold mx-auto mb-10 w-full max-w-5xl" />
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10">
        {/* PNG com alfa reconstruído — ver comentário em src/app/page.tsx */}
        <Image
          src="/media/marca/logo-revera.png"
          alt="Reverá — Prótese Capilar"
          width={1500}
          height={920}
          className="h-auto w-[170px]"
        />
        <div className="flex w-full flex-col flex-wrap justify-center gap-x-16 gap-y-8 sm:flex-row">
          {GRUPOS_DE_LINKS.map((grupo) => (
            <nav
              key={grupo.titulo}
              aria-label={grupo.titulo}
              className="flex flex-col items-center gap-2 sm:items-start"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-paper/50">
                {grupo.titulo}
              </span>
              {grupo.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded text-sm text-paper/70 hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <p className="text-xs text-paper/40">© {new Date().getFullYear()} Reverá</p>
      </div>
    </footer>
  );
}
