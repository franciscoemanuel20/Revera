import type { Metadata } from "next";
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
import { textosDaPagina } from "@/lib/conteudo/textos";
import {
  WHATSAPP_REVERA,
  linkWhatsApp,
  whatsappLegivel,
} from "@/lib/config/whatsapp";
import { ProfessionalLeadForm } from "./ProfessionalLeadForm";

/**
 * A mensagem que o cliente encontra já digitada. Fica aqui, e não no
 * lead-schema nem no registro de conteúdo, porque é texto de UMA tela só.
 * O número vem de src/lib/config/whatsapp.ts — é o mesmo da loja inteira
 * desde 03/09/2026.
 */
const WHATSAPP_MENSAGEM = "Olá vim do Site e quero comprar prótese capilar";

/**
 * A página continua sendo gerada estaticamente — ler o banco a cada visita
 * seria pagar uma consulta por visitante para um texto que muda uma vez por
 * mês. O painel chama `revalidatePath` ao salvar, então a edição aparece na
 * hora; este número é só a rede de segurança para o caso de a revalidação
 * não acontecer.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Para profissionais",
  description:
    "Barbeiros, cabeleireiros e clínicas: condições para quem trabalha com prótese capilar e quer fornecer Reverá.",
  alternates: { canonical: "/para-profissionais" },
  openGraph: {
    title: "Para profissionais — Reverá",
    description:
      "Barbeiros, cabeleireiros e clínicas: condições para quem trabalha com prótese capilar e quer fornecer Reverá.",
    url: "/para-profissionais",
  },
};

export default async function ParaProfissionaisPage() {
  const t = await textosDaPagina("profissionais");

  return (
    <main
      className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <Reveal className="flex flex-col items-center gap-2 text-center">
        <span className="eyebrow-ink">{t("profissionais.eyebrow")}</span>
        <h1 className="font-display text-3xl text-ink">{t("profissionais.titulo")}</h1>
        <p className="max-w-prose text-ink/70">{t("profissionais.intro")}</p>
      </Reveal>

      <Reveal>
        <section className="flex flex-col gap-2 border-t border-sand pt-6">
          <h2 className="font-display text-xl text-ink">
            {t("profissionais.comoFunciona.titulo")}
          </h2>
          <p className="text-ink/80">{t("profissionais.comoFunciona.texto")}</p>
        </section>
      </Reveal>

      {/* Card CLARO, não surface-elevada (que é escura, --ink-soft): o
          FormField (src/components/ui/FormField.tsx) escreve o rótulo em
          text-ink, pensado para fundo claro — sobre --ink-soft o rótulo
          ficaria ilegível. shadow-soft é o mesmo padrão de sombra usado em
          card claro no resto do site (ver globals.css). */}
      <Reveal delayMs={60}>
        <section className="flex flex-col gap-6 rounded-lg border border-sand bg-paper p-6 shadow-soft sm:p-8">
          <h2 className="font-display text-xl text-ink">
            {t("profissionais.cadastro.titulo")}
          </h2>
          <ProfessionalLeadForm
            whatsappHref={linkWhatsApp(WHATSAPP_MENSAGEM)}
            whatsappLegivel={whatsappLegivel()}
            whatsappDigitos={WHATSAPP_REVERA}
            textos={{
              nomeRotulo: t("profissionais.campo.nome.rotulo"),
              telefoneRotulo: t("profissionais.campo.telefone.rotulo"),
              telefoneDica: t("profissionais.campo.telefone.dica"),
              emailRotulo: t("profissionais.campo.email.rotulo"),
              emailDica: t("profissionais.campo.email.dica"),
              empresaRotulo: t("profissionais.campo.empresa.rotulo"),
              empresaDica: t("profissionais.campo.empresa.dica"),
              cidadeRotulo: t("profissionais.campo.cidade.rotulo"),
              cidadeDica: t("profissionais.campo.cidade.dica"),
              mensagemRotulo: t("profissionais.campo.mensagem.rotulo"),
              mensagemDica: t("profissionais.campo.mensagem.dica"),
              botaoEnviar: t("profissionais.botao.enviar"),
              mensagemSucesso: t("profissionais.mensagemSucesso"),
              whatsappBotao: t("profissionais.whatsapp.botao"),
              whatsappDica: t("profissionais.whatsapp.dica"),
              whatsappTelefoneRotulo: t("profissionais.whatsapp.telefoneRotulo"),
            }}
          />
        </section>
      </Reveal>
    </main>
  );
}
