import { describe, expect, it } from "vitest";
import { cpfValido, limparCPF } from "@/lib/format/cpf";

// Contrato exercitado pela validação onBlur do checkout
// (src/app/checkout/CheckoutForm.tsx): o campo de CPF valida ao perder o
// foco com a MESMA regra que o schema do servidor usa no envio
// (src/app/checkout/schema.ts). Aqui provamos que cpfValido segura os
// quatro casos que importam — válido, dígitos repetidos, dígito
// verificador errado e máscara — sem tocar em React nem em Postgres.
//
// cpfValido aceita com ou sem máscara (limpa internamente); o checkout
// ainda assim chama limparCPF antes, e este teste cobre os dois caminhos.
describe("cpfValido (validação de CPF do checkout)", () => {
  it("aceita CPF válido, com e sem máscara", () => {
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-25")).toBe(true);
    // Segundo CPF de teste público, para não depender de um único número.
    expect(cpfValido("111.444.777-35")).toBe(true);
  });

  it("aceita CPF mascarado depois de passar por limparCPF", () => {
    // Reproduz o que o CheckoutForm faz no onBlur: limpa e valida.
    expect(cpfValido(limparCPF("529.982.247-25"))).toBe(true);
  });

  it("rejeita dígitos repetidos", () => {
    expect(cpfValido("00000000000")).toBe(false);
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
  });

  it("rejeita dígito verificador errado", () => {
    // Um CPF válido (52998224725) com o último dígito trocado.
    expect(cpfValido("52998224724")).toBe(false);
    expect(cpfValido("529.982.247-24")).toBe(false);
  });

  it("rejeita máscara com quantidade errada de dígitos", () => {
    expect(cpfValido("529.982.247-2")).toBe(false);
    expect(cpfValido("529.982.247-250")).toBe(false);
  });
});
