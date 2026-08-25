// Home provisória — só prova que o layout, os tokens e as fontes estão de
// pé. A vitrine de verdade (grid de produto, seção de vídeo, prova social)
// entra em fase seguinte, quando o catálogo real existir no banco.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-4xl italic text-ink sm:text-5xl">
        Reverá
      </h1>
      <p className="max-w-prose text-balance text-ink/80">
        Próteses capilares premium. Este é o esqueleto do projeto — catálogo,
        checkout e conteúdo real chegam nas próximas fases.
      </p>
    </main>
  );
}
