/**
 * Identificação da empresa nas páginas legais (07/10/2026).
 *
 * Fonte única: aviso legal (Impressum), privacidade (controlador) e
 * devolução leem daqui. A venda internacional começou em 06/10/2026 — a UE
 * exige identificar o vendedor e um e-mail de contato direto, e a Alemanha
 * (§ 5 DDG) exige isso numa página própria, fácil de achar.
 */
export const EMPRESA = {
  razaoSocial: "REVERA PROTESE CAPILAR E COMERCIO LTDA.",
  nomeFantasia: "Reverá",
  cnpj: "62.118.672/0001-53",
  endereco: {
    linha1: "Rua Síria, 71, salas 39 a 42",
    bairro: "Jardim Oswaldo Cruz",
    cidade: "São José dos Campos",
    estado: "SP",
    cep: "12216-530",
    pais: "Brasil",
    paisEn: "Brazil",
  },
  /** Sócio-administrador no CNPJ (Receita Federal, consulta de 07/10/2026). */
  representanteLegal: "Fabricio Augusto Batista de Oliveira",
  naturezaJuridica: "Sociedade Empresária Limitada",
  email: "franciscoemanuel20@gmail.com",
  whatsapp: "+55 12 98140-9901",
  whatsappLink: "https://wa.me/5512981409901",
} as const;

/** Prazo de desistência, igual para todos os países (14 dias: o da UE, maior que os 7 do CDC). */
export const PRAZO_DESISTENCIA_DIAS = 14;
