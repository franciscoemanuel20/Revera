export interface VideoSectionProps {
  videoUrl: string;
  posterUrl?: string | null;
  title?: string;
}

// Player nativo (<video controls>), sem player de terceiro — não há
// decisão de host de vídeo (Mux, YouTube, Bunny) tomada ainda. Trocar por
// embed é troca localizada neste componente só.
export function VideoSection({ videoUrl, posterUrl, title }: VideoSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      {title ? <h2 className="font-display text-2xl text-ink">{title}</h2> : null}
      <video
        controls
        poster={posterUrl ?? undefined}
        className="w-full rounded-lg bg-ink"
      >
        <source src={videoUrl} />
      </video>
    </section>
  );
}
