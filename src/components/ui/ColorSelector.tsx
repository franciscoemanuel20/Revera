"use client";
import Image from "next/image";

export interface ColorOption {
  id: string;
  code: string;
  name: string;
  hexPreview?: string | null;
  photoUrl?: string | null;
}

export interface ColorSelectorProps {
  colors: ColorOption[];
  selectedId: string | null;
  onChange: (id: string) => void;
  onQuickAdd?: (id: string) => void;
  onQuickRemove?: (id: string) => void;
  quickAddQuantities?: Record<string, number>;
  quickAddDisabledIds?: string[];
  quickRemoveDisabledIds?: string[];
  quickAddPendingId?: string | null;
  onNeedHelp?: () => void;
}

// Swatch de cor — usa photoUrl quando existir (fica vazio até alguém
// importar as fotos do Drive, ver seeds/colors.json) e cai para hexPreview
// ou, na ausência dos dois, só o código como texto. onNeedHelp é opcional
// de propósito: liga com o fluxo de color_help_requests (enviar foto e
// pedir ajuda), que é uma tela própria — este componente só expõe o gancho.
/**
 * A cartela em FILEIRAS, uma por família (Francisco, 29/08/2026).
 *
 * Com 15 cores numa lista que só quebra sozinha, o cliente via um bloco só e
 * não percebia que existem três conjuntos diferentes. As fileiras são:
 *
 *   1. as cores base — 1B, 2, 3, 4, 5, 6, 7;
 *   2. a escala de grisalho sobre o 1B — 1b10 … 1b80;
 *   3. a linha 3 — 3.10 … 3.40.
 *
 * A família sai do CÓDIGO, que é a convenção do próprio Francisco: "1b" mais
 * dígitos é grisalho, "3." mais dígitos é linha 3. Qualquer código que não
 * casar com nenhuma das duas cai na primeira fileira — código novo pode ficar
 * no lugar errado, mas NUNCA some da tela, que é o desfecho seguro.
 *
 * Repare que a 3.10 vive na fileira 3, e não entre as básicas: ela é o
 * primeiro degrau da linha 3, e estar nos dois lugares é impossível.
 */
function separarEmFileiras(colors: ColorOption[]): Array<{ label: string; colors: ColorOption[] }> {
  const grisalho = colors.filter((c) => /^1b\d+$/i.test(c.code));
  const linha3 = colors.filter((c) => /^3\.\d+$/.test(c.code));
  const usados = new Set([...grisalho, ...linha3].map((c) => c.id));
  const base = colors.filter((c) => !usados.has(c.id));
  return [
    { label: "Naturais", colors: base },
    { label: "Grisalhos", colors: grisalho },
    { label: "Linha 3", colors: linha3 },
  ].filter((fileira) => fileira.colors.length > 0);
}

export function ColorSelector({
  colors,
  selectedId,
  onChange,
  onQuickAdd,
  onQuickRemove,
  quickAddQuantities = {},
  quickAddDisabledIds = [],
  quickRemoveDisabledIds = [],
  quickAddPendingId,
  onNeedHelp,
}: ColorSelectorProps) {
  const fileiras = separarEmFileiras(colors);
  const bloqueadas = new Set(quickAddDisabledIds);
  const remocoesBloqueadas = new Set(quickRemoveDisabledIds);
  return (
    <div className="flex flex-col gap-4">
      {fileiras.map((fileira) => {
        const headingId = `cores-${fileira.label.toLowerCase().replace(/\s+/g, "-")}`;
        return (
      <section key={fileira.label} className="flex flex-col gap-2" aria-labelledby={headingId}>
        <p id={headingId} className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
          {fileira.label}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-2">
        {fileira.colors.map((color) => {
          const selecionado = color.id === selectedId;
          const adicionando = quickAddPendingId === color.id;
          const adicionarBloqueado = bloqueadas.has(color.id) || adicionando;
          const removerBloqueado = remocoesBloqueadas.has(color.id) || adicionando;
          const quantidade = quickAddQuantities[color.id] ?? 0;
          const temQuantidade = quantidade > 0;
          return (
            /**
             * O CÓDIGO DA COR ESCRITO EMBAIXO (29/08/2026).
             *
             * Antes o código só existia no `aria-label` — quem enxerga via oito
             * bolinhas de cabelo escuro, quase todas parecidas na miniatura, e
             * não tinha como dizer "quero a 3.10". Agora o código fica visível,
             * e é o mesmo que aparece na sacola ("Cor 3.10") e no pedido, então
             * cliente e operação falam a mesma língua.
             */
            <span
              key={color.id}
              className={`flex min-h-[86px] flex-col items-center justify-between rounded-lg border px-2 py-2 transition-colors ${
                temQuantidade
                  ? "border-gold/65 bg-gold/10"
                  : selecionado
                    ? "border-gold/55 bg-paper"
                    : "border-sand bg-paper/80"
              }`}
            >
            <span className="grid min-h-11 grid-cols-[24px_44px_24px] items-center gap-1">
              {onQuickAdd && onQuickRemove && temQuantidade ? (
                <button
                  type="button"
                  aria-label={`Remover uma unidade da cor ${color.name}`}
                  disabled={removerBloqueado}
                  onClick={() => onQuickRemove(color.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-gold/55 bg-paper text-[11px] font-semibold leading-none text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  −
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
              <button
                type="button"
                aria-label={`Cor ${color.name}${temQuantidade ? `, ${quantidade} unidade${quantidade === 1 ? "" : "s"} na sacola` : ""}`}
                aria-pressed={selecionado}
                onClick={() => onChange(color.id)}
                className={`relative h-11 w-11 overflow-hidden rounded-full border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                  selecionado ? "border-gold" : "border-sand"
                }`}
                style={!color.photoUrl && color.hexPreview ? { backgroundColor: color.hexPreview } : undefined}
              >
                {color.photoUrl ? (
                  /* `sizes` explícito (29/08/2026). Sem ele o <Image fill> do
                    Next assume 100vw e pede a foto em 3840px de largura para
                    um círculo de 44px: 435 KB por cor, 3,4 MB só na cartela.
                    Medido no site em produção — no 4G as bolinhas apareciam
                    uma a uma e a pessoa escolhia a cor olhando círculo vazio.
                    44px é o tamanho real; o dobro cobre telas 2x. */
                  <Image
                    src={color.photoUrl}
                    alt={color.name}
                    fill
                    sizes="88px"
                    className="object-cover"
                  />
                ) : !color.hexPreview ? (
                  <span className="flex h-full w-full items-center justify-center text-xs text-ink">
                    {color.code}
                  </span>
                ) : null}
                {temQuantidade ? (
                  <span
                    className="motion-safe:animate-pulse absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold leading-none text-paper shadow-sm"
                    aria-hidden="true"
                  >
                    {quantidade}
                  </span>
                ) : null}
              </button>
              {onQuickAdd ? (
                <button
                  type="button"
                  aria-label={`Adicionar cor ${color.name} à sacola`}
                  disabled={adicionarBloqueado}
                  onClick={() => onQuickAdd(color.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-gold/70 bg-gold/15 text-xs font-semibold leading-none text-ink transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  {adicionando ? "…" : "+"}
                </button>
              ) : null}
            </span>
            {temQuantidade ? (
              <span className="sr-only" aria-live="polite">
                {quantidade} unidade{quantidade === 1 ? "" : "s"} da cor {color.name} na sacola
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className={`max-w-full truncate text-[11px] leading-none tabular-nums ${
                selecionado ? "font-semibold text-ink" : "text-ink/55"
              }`}
            >
              {/* `name`, não `code`: o cadastro guarda "1b" minúsculo no
                  código e "1B" no nome, e é o NOME que sai no aria-label,
                  na sacola ("Cor 1B") e no pedido. Mostrar "1b" aqui e
                  "1B" lá faria o cliente e a operação falarem duas línguas
                  para a mesma cor. */}
              {color.name}
            </span>
            </span>
          );
        })}
        </div>
      </section>
        );
      })}
      {onNeedHelp ? (
        <button type="button" onClick={onNeedHelp} className="self-start text-sm text-ink underline decoration-gold decoration-2 underline-offset-4">
          Não sei qual cor escolher
        </button>
      ) : null}
    </div>
  );
}
