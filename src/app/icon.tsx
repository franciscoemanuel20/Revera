import { ImageResponse } from "next/og";

/**
 * Favicon (P1, 27/08/2026).
 *
 * A auditoria de 26/08 mediu `/favicon.ico` → 404: a aba do navegador ficava
 * com o ícone genérico de documento, e um site de marca premium sem ícone
 * próprio é a primeira coisa que denuncia "não terminado".
 *
 * Gerado em código, não recortado da logo: `logo-revera.png` é 1500×920 —
 * uma marca larga, com o nome escrito. Reduzida a 32×32 ela vira um borrão
 * ilegível. Em tamanho de favicon o que sobrevive é uma letra, e as cores.
 *
 * Cores tiradas de src/styles/tokens.css (--ink e --gold), não escolhidas
 * aqui: se a paleta da marca mudar, o ícone muda junto ao trocar aquele
 * arquivo, sem virar uma terceira definição de dourado espalhada pelo
 * projeto.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#c9b45f",
          fontSize: 24,
          fontWeight: 700,
          // Serifa para acompanhar a Fraunces do display da marca. Fonte de
          // sistema de propósito: carregar Fraunces só para um ícone de 32px
          // custaria mais que o ícone inteiro.
          fontFamily: "Georgia, 'Times New Roman', serif",
          letterSpacing: "-0.02em",
        }}
      >
        R
      </div>
    ),
    size
  );
}
