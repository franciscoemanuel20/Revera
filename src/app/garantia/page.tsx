import type { Metadata } from "next";
// Página pública de garantia — os três fatos confirmados (mesmo texto de
// seeds/faq.json, pergunta "Como funciona a garantia?", só desdobrado em
// parágrafos). Não adicione cláusula nova aqui sem confirmar o fato
// primeiro: esta é justamente a página que precisa de revisão jurídica
// antes de virar política definitiva (ver nota abaixo e docs do projeto).
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";

export const metadata: Metadata = {
  title: "Garantia",
  description:
    "O que a garantia Reverá cobre, por quanto tempo e como acionar. Sem letra miúda.",
  alternates: { canonical: "/garantia" },
  openGraph: {
    title: "Garantia — Reverá",
    description:
      "O que a garantia Reverá cobre, por quanto tempo e como acionar. Sem letra miúda.",
    url: "/garantia",
  },
};

export default function GarantiaPage() {
  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pb-12"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">Pós-venda</span>
        <h1 className="font-display text-3xl text-ink">Garantia</h1>
      </Reveal>

      <Reveal className="flex flex-col gap-6 text-ink/80">
        <p>
          A garantia e a durabilidade da prótese capilar dependem diretamente
          dos cuidados realizados pelo cliente após a aplicação.
        </p>
        <p>
          Antes do envio, todas as próteses passam por um rigoroso teste de
          qualidade para garantir que o produto seja entregue em perfeitas
          condições.
        </p>
        <p>
          Após o recebimento da prótese, o cliente tem o prazo de até 7 dias
          úteis para comunicar qualquer possível defeito de fabricação. Após
          esse período, não será possível acionar a garantia.
        </p>
      </Reveal>

      <p className="rounded-md border border-moss/30 bg-moss/5 px-4 py-3 text-sm text-moss">
        Política revisada juridicamente antes da publicação final.
      </p>
    </main>
  );
}
