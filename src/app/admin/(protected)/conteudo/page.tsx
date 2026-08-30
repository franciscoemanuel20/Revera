import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FaqManager, type FaqRow } from "./FaqManager";
import { ReviewsManager, type ReviewRow } from "./ReviewsManager";
/**
 * A aba "Seções" saiu em 30/08/2026, e o motivo é constrangedor: ela gravava
 * em `content_blocks`, uma tabela que NENHUMA página do site lia. Tinha 0
 * linhas e sempre teve. Era uma tela que aceitava o texto, dizia "salvo", e
 * jogava fora.
 *
 * Uma tela que mente é pior que uma tela que falta: quem escrevesse ali ia
 * procurar no site o que nunca ia aparecer. O que ela prometia agora existe
 * de verdade em /admin/textos, ligado às páginas.
 *
 * A tabela `content_blocks` continua no banco, vazia. Apagar tabela é
 * irreversível e ela não incomoda ninguém parada.
 */
const ABAS = [
  { id: "faq", label: "FAQ" },
  { id: "depoimentos", label: "Depoimentos" },
] as const;

export default async function ConteudoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const abaAtiva = ABAS.find((a) => a.id === tab)?.id ?? "faq";

  const supabase = await createClient();
  const [{ data: faq, error: erroFaq }, { data: reviews, error: erroReviews }]  =
    await Promise.all([
      supabase.from("faq_items").select("*").order("sort_order"),
      supabase.from("reviews").select("*").order("sort_order"),
    ]);

  const erro = erroFaq || erroReviews;
  if (erro) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl text-ink">Conteúdo</h1>
        <p className="text-sm text-red-700">
          Não foi possível carregar o conteúdo. Se isto persistir, confira se a migration
          00000000000005_admin_pedidos_policies.sql já foi aplicada no Supabase.
        </p>
      </div>
    );
  }

  const faqItems: FaqRow[] = (faq ?? []).map((f) => ({
    key: f.id,
    id: f.id,
    question: f.question,
    answer: f.answer,
    sortOrder: String(f.sort_order),
    isVisible: f.is_visible,
  }));

  const reviewItems: ReviewRow[] = (reviews ?? []).map((r) => ({
    key: r.id,
    id: r.id,
    customerName: r.customer_name,
    city: r.city ?? "",
    professionalName: r.professional_name ?? "",
    rating: r.rating != null ? String(r.rating) : "",
    comment: r.comment ?? "",
    photoUrl: r.photo_url ?? "",
    videoUrl: r.video_url ?? "",
    isPublished: r.is_published,
    sortOrder: String(r.sort_order),
  }));

  return (
    <div className="flex flex-col gap-6 pb-16">
      <h1 className="font-display text-2xl text-ink">Conteúdo</h1>

      <div className="flex flex-wrap gap-2">
        {ABAS.map((aba) => (
          <Link
            key={aba.id}
            href={`/admin/conteudo?tab=${aba.id}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              aba.id === abaAtiva ? "border-gold bg-gold/10 text-ink" : "border-sand text-ink/70 hover:bg-sand"
            }`}
          >
            {aba.label}
          </Link>
        ))}
      </div>

      {abaAtiva === "faq" ? <FaqManager initialItems={faqItems} /> : null}
      {abaAtiva === "depoimentos" ? <ReviewsManager initialItems={reviewItems} /> : null}
    </div>
  );
}
