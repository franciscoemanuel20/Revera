// Página para barbeiros e profissionais — pedida pela auditoria de
// 26/08/2026. A FAQ interna ainda marca "Vendemos para profissionais?"
// como TODO (seeds/faq.json, sort_order 15, is_visible=false) — o
// Francisco ainda não fechou uma política formal de venda B2B. Por isso
// esta página não afirma uma política pronta: ela convida quem tem
// interesse a deixar contato, e é a PRÓPRIA missão que criou esta página
// que definiu o texto certo para isso — "equipe entra em contato para
// apresentar condições", sem número, sem tabela, sem desconto. Ver
// actions.ts para onde isso é gravado.
import { Reveal } from "@/components/ui/Reveal";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { ProfessionalLeadForm } from "./ProfessionalLeadForm";

export default function ParaProfissionaisPage() {
  return (
    <main
      className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">Barbeiros e profissionais</span>
        <h1 className="font-display text-3xl text-ink">Para profissionais</h1>
        <p className="max-w-prose text-ink/70">
          A Reverá atende profissionais que trabalham com prótese capilar,
          incluindo interesse em compra por quantidade.
        </p>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">Como funciona</h2>
          <p className="text-ink/80">
            Deixe seus dados abaixo e conte um pouco sobre o seu volume de
            trabalho. Nossa equipe entra em contato para apresentar as
            condições — preço, prazo e forma de compra por quantidade são
            tratados diretamente nessa conversa, e não há valor fixo
            publicado aqui.
          </p>
        </section>
      </Reveal>

      {/* Card CLARO, não surface-elevada (que é escura, --ink-soft): o
          FormField (src/components/ui/FormField.tsx) escreve o rótulo em
          text-ink, pensado para fundo claro — sobre --ink-soft o rótulo
          ficaria ilegível. shadow-soft é o mesmo padrão de sombra usado em
          card claro no resto do site (ver globals.css). */}
      <Reveal delayMs={60}>
        <section className="flex flex-col gap-6 rounded-lg border border-sand bg-paper p-6 shadow-soft sm:p-8">
          <h2 className="font-display text-xl text-ink">Cadastro</h2>
          <ProfessionalLeadForm />
        </section>
      </Reveal>
    </main>
  );
}
