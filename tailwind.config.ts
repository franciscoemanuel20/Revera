import type { Config } from "tailwindcss";

// Paleta e fontes lidas de src/styles/tokens.css (CSS custom properties),
// não hard-coded aqui — mesma dobra que o projeto irmão faz para os tokens
// de estado dele. Ver tokens.css para o porquê de cada cor existir.
//
// Formato `rgb(var(--x-rgb) / <alpha-value>)`, não `var(--x)` puro: é o
// que permite usar modificador de opacidade (`text-ink/80`) — bastante
// usado nos componentes de src/components/ui. Ver comentário em
// src/styles/tokens.css sobre as variáveis *-rgb.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        paper: "rgb(var(--paper-rgb) / <alpha-value>)",
        copper: {
          DEFAULT: "rgb(var(--copper-rgb) / <alpha-value>)",
          deep: "rgb(var(--copper-deep-rgb) / <alpha-value>)",
        },
        moss: "rgb(var(--moss-rgb) / <alpha-value>)",
        sand: "rgb(var(--sand-rgb) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      // Alvo de toque >= 44px — mesma regra de acessibilidade mobile do
      // projeto irmão; e-commerce de prótese vende majoritariamente por
      // celular, então o botão de comprar não pode ser pequeno.
      minHeight: {
        toque: "44px",
      },
      minWidth: {
        toque: "44px",
      },
    },
  },
  plugins: [],
};

export default config;
