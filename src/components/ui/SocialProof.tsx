import { ReviewCard, type ReviewCardProps } from "./ReviewCard";
import { Reveal } from "./Reveal";

export interface SocialProofProps {
  /**
   * Os dois títulos da seção vêm de fora, e não daqui, porque quem manda no
   * texto do site agora é o painel — e um componente compartilhado não tem
   * como perguntar ao banco por conta própria sem virar assíncrono. Quem
   * renderiza é que sabe de que página ele faz parte.
   */
  eyebrow: string;
  titulo: string;
  reviews: ReviewCardProps[];
}

/**
 * Prova social — camada visual e de conversão, 25/08/2026.
 *
 * Só existe quando existe avaliação publicada de verdade (tabela `reviews`,
 * policy "public read reviews": is_published = true, ver
 * supabase/migrations/00000000000001_init.sql). Hoje a tabela está vazia —
 * nenhum depoimento foi coletado ainda — e inventar um aqui é exatamente o
 * tipo de conteúdo comercial que a entrega proibiu (depoimento, nome de
 * cliente, número). Por isso: nada de dado de exemplo, e se a lista vier
 * vazia o componente não renderiza NADA, nem o título da seção — o dia em
 * que o Francisco publicar a primeira avaliação pelo /admin, a seção
 * aparece sozinha, sem precisar mexer em código nenhum.
 */
export function SocialProof({ reviews, eyebrow, titulo }: SocialProofProps) {
  if (reviews.length === 0) {
    return null;
  }

  return (
    <Reveal>
      <section className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="eyebrow-ink">{eyebrow}</span>
          <h2 className="font-display text-2xl text-ink sm:text-3xl">{titulo}</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review, i) => (
            // key por índice: ReviewCardProps não carrega id (ver
            // ReviewCard.tsx) — a lista vem ordenada do banco por
            // sort_order e não reordena em runtime, então é seguro.
            <ReviewCard key={i} {...review} />
          ))}
        </div>
      </section>
    </Reveal>
  );
}
