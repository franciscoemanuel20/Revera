import { describe, expect, it } from "vitest";
import { cpfValido, formatarCPF, limparCPF } from "@/lib/format/cpf";

// Mesmo espírito de tests/unit/discount.test.ts: prova que a regra de
// negócio "CPF precisa ser válido de verdade" não regride sem passar por
// Postgres nenhum.
describe("cpfValido", () => {
  it("aceita CPF válido, com ou sem máscara", () => {
    expect(cpfValido("111.444.777-35")).toBe(true);
    expect(cpfValido("11144477735")).toBe(true);
  });

  it("rejeita o CPF-armadilha clássico (dígitos repetidos)", () => {
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("000.000.000-00")).toBe(false);
  });

  it("rejeita dígito verificador incorreto", () => {
    expect(cpfValido("111.444.777-36")).toBe(false);
  });

  it("rejeita tamanho errado", () => {
    expect(cpfValido("123")).toBe(false);
    expect(cpfValido("111.444.777-350")).toBe(false);
  });
});

describe("formatarCPF", () => {
  it("aplica a máscara nnn.nnn.nnn-nn conforme os dígitos chegam", () => {
    expect(formatarCPF("11144477735")).toBe("111.444.777-35");
    expect(formatarCPF("111444777")).toBe("111.444.777");
    expect(formatarCPF("111")).toBe("111");
  });
});

describe("limparCPF", () => {
  it("mantém só dígitos", () => {
    expect(limparCPF("111.444.777-35")).toBe("11144477735");
  });
});
