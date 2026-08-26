"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Rodapé das páginas públicas — só os cinco links que já existem de fato
// (home, cores, cuidados, garantia, faq). Nada de WhatsApp, e-mail ou rede
// social aqui: o único contato pós-venda da Reverá ainda não tem página
// própria, e colocar telefone num rodapé que qualquer visitante vê violaria
// a regra de "contato só em conteúdo pós-compra" (ver CLAUDE.md do projeto).
//
// "use client" + usePathname, e não um Footer só de servidor: o layout raiz
// (src/app/layout.tsx) é compartilhado por / e por /admin/*, e o admin já
// tem seu próprio header/nav (src/app/admin/(protected)/layout.tsx) — sem
// rodapé duplicado ali. Checar o pathname aqui dentro evita duplicar o
// root layout inteiro em route groups só para isso.
const LINKS = [
  { href: "/", label: "Início" },
  { href: "/cores", label: "Cores" },
  { href: "/cuidados", label: "Cuidados" },
  { href: "/garantia", label: "Garantia" },
  { href: "/faq", label: "Perguntas frequentes" },
];

export function Footer() {
  const pathname = usePathname();

  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return (
    <footer className="mt-auto bg-ink px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6">
        {/* PNG com alfa reconstruído — ver comentário em src/app/page.tsx */}
        <Image
          src="/media/marca/logo-revera.png"
          alt="Reverá — Prótese Capilar"
          width={490}
          height={320}
          className="h-auto w-[150px]"
        />
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-paper/70 hover:text-gold"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
