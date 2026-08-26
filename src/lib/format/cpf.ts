/**
 * CPF — máscara e validação de verdade (26/08/2026, entrada do checkout).
 *
 * "Validar CPF" não pode significar só "tem 11 dígitos e a pontuação
 * certa": `111.111.111-11` passa nisso e é o tipo exato de dado de teste
 * que alguém digita sem preencher de verdade — e um CPF assim trava a nota
 * fiscal do pedido lá na frente. Por isso este arquivo confere também o
 * dígito verificador (módulo 11), o mesmo cálculo que a Receita usa.
 *
 * CPF de teste usado em tests/unit/cpf.test.ts (111.444.777-35) é um
 * exemplo padrão, documentado publicamente por várias bibliotecas de
 * validação — não corresponde a nenhuma pessoa real.
 */

export function limparCPF(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function formatarCPF(valor: string): string {
  const digitos = limparCPF(valor).slice(0, 11);
  return digitos
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// Mesmo cálculo serve para o primeiro e o segundo dígito verificador — só
// muda o tamanho da base recebida (9 dígitos para o primeiro, 10 para o
// segundo, já com o primeiro dígito calculado incluso). O peso começa em
// "tamanho da base + 1" e desce até 2, regra padrão do módulo 11 do CPF.
function calcularDigitoVerificador(base: string): number {
  let soma = 0;
  let peso = base.length + 1;
  for (const caractere of base) {
    soma += Number(caractere) * peso;
    peso -= 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Confere formato (11 dígitos) E os dois dígitos verificadores. Aceita com
 * ou sem máscara — quem chama decide se quer limpar antes.
 */
export function cpfValido(valor: string): boolean {
  const digitos = limparCPF(valor);
  if (digitos.length !== 11) return false;

  // 111.111.111-11, 000.000.000-00 etc. — todos os dígitos iguais batem o
  // módulo 11 por coincidência aritmética em alguns casos; bloqueio
  // explícito em vez de confiar só na conta abaixo.
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  const nove = digitos.slice(0, 9);
  const d1 = calcularDigitoVerificador(nove);
  const d2 = calcularDigitoVerificador(`${nove}${d1}`);

  return digitos === `${nove}${d1}${d2}`;
}
