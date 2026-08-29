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
  onNeedHelp?: () => void;
}

// Swatch de cor — usa photoUrl quando existir (fica vazio até alguém
// importar as fotos do Drive, ver seeds/colors.json) e cai para hexPreview
// ou, na ausência dos dois, só o código como texto. onNeedHelp é opcional
// de propósito: liga com o fluxo de color_help_requests (enviar foto e
// pedir ajuda), que é uma tela própria — este componente só expõe o gancho.
export function ColorSelector({ colors, selectedId, onChange, onNeedHelp }: ColorSelectorProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => {
          const selecionado = color.id === selectedId;
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
            <span key={color.id} className="flex flex-col items-center gap-1">
            <button
              type="button"
              aria-label={`Cor ${color.name}`}
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
            </button>
            <span
              aria-hidden="true"
              className={`text-[11px] leading-none tabular-nums ${
                selecionado ? "font-semibold text-ink" : "text-ink/55"
              }`}
            >
              {color.code}
            </span>
            </span>
          );
        })}
      </div>
      {onNeedHelp ? (
        <button type="button" onClick={onNeedHelp} className="self-start text-sm text-ink underline decoration-gold decoration-2 underline-offset-4">
          Não sei qual cor escolher
        </button>
      ) : null}
    </div>
  );
}
