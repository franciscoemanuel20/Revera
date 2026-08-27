import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { FAQ } from "@/components/ui/FAQ";
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";

export const metadata: Metadata = {
  title: "Perguntas frequentes",
  description:
    "Durabilidade, manutenção, garantia, envio e escolha de cor — as dúvidas que mais chegam, respondidas direto.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "Perguntas frequentes — Reverá",
    description:
      "Durabilidade, manutenção, garantia, envio e escolha de cor — as dúvidas que mais chegam, respondidas direto.",
    url: "/faq",
  },
};

// Página pública de FAQ — as perguntas vêm direto de faq_items via a policy
// pública "public read faq" (is_visible = true, ver
// supabase/migrations/00000000000001_init.sql). Não há filtro por heurística
// de texto aqui: os itens com resposta "TODO: aguardando definição" já
// nascem is_visible=false no seed (seeds/faq.json) e a RLS os exclui antes
// mesmo de chegar neste componente — confiar em qualquer outra coisa seria
// reimplementar, pior, uma regra que já existe no banco.
export default async function FaqPage() {
  const supabase = await createClient();
  const { data: itens } = await supabase
    .from("faq_items")
    .select("id, question, answer")
    .order("sort_order");

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-12"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">Dúvidas</span>
        <h1 className="font-display text-3xl text-ink">Perguntas frequentes</h1>
      </Reveal>

      <Reveal>
        <FAQ
          items={(itens ?? []).map((item) => ({
            id: item.id as string,
            question: item.question as string,
            answer: item.answer as string,
          }))}
        />
      </Reveal>
    </main>
  );
}
