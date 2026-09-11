export interface PassoNumerado {
  numero: string;
  titulo: string;
  texto: string;
}

export interface PassosNumeradosProps {
  passos: PassoNumerado[];
}

/**
 * Lista de passos numerados, sobre fundo escuro (08/09/2026).
 *
 * Extrai o gesto tipográfico que já existia, repetido inline, em
 * src/app/garantia/page.tsx (número em `font-display text-gold` + texto ao
 * lado) — não é um desenho novo, é o mesmo padrão da página de garantia
 * virando componente para a seção "Como funciona" da home poder usá-lo
 * também. A página de garantia continua com a versão inline dela; não foi
 * tocada aqui.
 */
export function PassosNumerados({ passos }: PassosNumeradosProps) {
  return (
    <ol className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      {passos.map((passo) => (
        <li key={passo.numero} className="relative flex min-h-40 flex-col gap-4 overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] p-5 transition-colors duration-300 hover:bg-white/[0.06]">
          <span className="font-display text-3xl leading-none text-gold" aria-hidden="true">
            {passo.numero}
          </span>
          <div className="mt-auto flex flex-col gap-1">
            <h3 className="font-display text-lg text-paper">{passo.titulo}</h3>
            <p className="text-sm text-paper/70">{passo.texto}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
