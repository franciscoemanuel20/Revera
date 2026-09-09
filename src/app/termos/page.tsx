import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PaginaLegal } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermosPage() {
  return (
    <PaginaLegal titulo="Termos de Uso" atualizadoEm="9 de setembro de 2026">
      <p>Ao navegar e comprar na Reverá, você concorda em usar o site de forma lícita e em fornecer dados corretos para pagamento e entrega.</p>
      <Secao titulo="Compra e disponibilidade"><p>Os produtos, preços, condições de entrega e disponibilidade exibidos no site podem mudar antes da confirmação do pedido. A compra só é considerada aprovada após a confirmação do pagamento pelo intermediador correspondente.</p></Secao>
      <Secao titulo="Entrega e atendimento"><p>O prazo e o valor do frete dependem do CEP, da transportadora e das condições informadas no checkout. É responsabilidade de quem compra conferir os dados de entrega antes de finalizar o pedido.</p></Secao>
      <Secao titulo="Uso do conteúdo"><p>Textos, fotos, marca e elementos do site pertencem à Reverá ou são usados com autorização. Não é permitido copiar, distribuir ou usar esse conteúdo comercialmente sem autorização.</p></Secao>
      <Secao titulo="Limites e revisão"><p>Estas condições não substituem direitos garantidos pelo Código de Defesa do Consumidor. Regras específicas de troca, garantia, prazo de atendimento e identificação empresarial dependem de confirmação operacional e jurídica e serão detalhadas nesta página quando formalizadas.</p></Secao>
      <Secao titulo="Contato"><p>Para dúvidas sobre um pedido ou sobre estes termos, entre em contato pelo WhatsApp <a className="underline hover:text-ink" href="https://wa.me/5512981409901">+55 12 98140-9901</a>.</p></Secao>
    </PaginaLegal>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section><h2 className="font-display text-2xl text-ink">{titulo}</h2><div className="mt-3 space-y-3">{children}</div></section>;
}
