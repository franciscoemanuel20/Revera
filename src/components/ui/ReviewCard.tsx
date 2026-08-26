import Image from "next/image";

export interface ReviewCardProps {
  customerName: string;
  city?: string | null;
  professionalName?: string | null;
  rating?: number | null;
  comment?: string | null;
  photoUrl?: string | null;
  videoUrl?: string | null;
}

// Espelha a tabela `reviews` quase campo a campo — só is_published e
// sort_order ficam de fora porque são decisão de listagem, não do card.
export function ReviewCard({
  customerName,
  city,
  professionalName,
  rating,
  comment,
  photoUrl,
  videoUrl,
}: ReviewCardProps) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-sand p-4">
      {photoUrl ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-md">
          <Image src={photoUrl} alt={`Foto de ${customerName}`} fill className="object-cover" />
        </div>
      ) : null}
      {videoUrl ? (
        <video controls className="w-full rounded-md bg-ink">
          <source src={videoUrl} />
        </video>
      ) : null}
      {rating != null ? (
        <div aria-label={`${rating} de 5 estrelas`} className="text-gold-deep">
          {"★".repeat(rating)}
          {"☆".repeat(5 - rating)}
        </div>
      ) : null}
      {comment ? <p className="text-ink/90">{comment}</p> : null}
      <footer className="text-sm text-ink/60">
        {customerName}
        {city ? ` · ${city}` : ""}
        {professionalName ? ` · atendida por ${professionalName}` : ""}
      </footer>
    </article>
  );
}
