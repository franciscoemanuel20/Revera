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
function separarEmFileiras(colors: ColorOption[]): ColorOption[][] {
  const grisalho = colors.filter((c) => /^1b\d+$/i.test(c.code));
  const linha3 = colors.filter((c) => /^3\.\d+$/.test(c.code));
  const usados = new Set([...grisalho, ...linha3].map((c) => c.id));
  const base = colors.filter((c) => !usados.has(c.id));
  return [base, grisalho, linha3].filter((fileira) => fileira.length > 0);
}

export function ColorSelector({ colors, selectedId, onChange, onNeedHelp }: ColorSelectorProps) {
  const fileiras = separarEmFileiras(colors);
  return (
    <div className="flex flex-col gap-3">
      {fileiras.map((fileira, i) => (
      <div key={i} className="flex flex-wrap gap-2">
        {fileira.map((color) => {
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
      ))}
      {onNeedHelp ? (
        <button type="button" onClick={onNeedHelp} className="self-start text-sm text-ink underline decoration-gold decoration-2 underline-offset-4">
          Não sei qual cor escolher
        </button>
      ) : null}
    </div>
  );
}
