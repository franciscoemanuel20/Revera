import { ambienteAtual } from "@/lib/config/ambiente";

export type AmbienteCotacaoDhl = "sandbox" | "producao";

/** Uma cotação sandbox só pode criar pedido no staging deliberado. */
export function cotacaoDhlPermitida(ambienteDhl: AmbienteCotacaoDhl): boolean {
  const ambiente = ambienteAtual();
  return (ambiente === "staging" && ambienteDhl === "sandbox") ||
    (ambiente === "producao" && ambienteDhl === "producao");
}

export function origemCotacaoDhl(ambienteDhl: AmbienteCotacaoDhl): string {
  return ambienteDhl === "sandbox" ? "mydhl-sandbox" : "mydhl-production";
}
