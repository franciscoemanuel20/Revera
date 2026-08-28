/**
 * O aceite internacional — texto e versão.
 *
 * A versão é gravada em orders.terms_version junto com o instante
 * (terms_accepted_at, relógio do SERVIDOR). Mudou o texto → muda a versão,
 * NUNCA edite um texto mantendo a versão: o registro de quem aceitou a
 * versão antiga perderia o sentido.
 *
 * ATENÇÃO (estrutura §6, docs/estrutura-envio-internacional-dhl.md): este
 * texto cumpre os REQUISITOS DE CONTEÚDO definidos pelo Francisco, mas
 * AINDA NÃO passou por revisão jurídica — o sufixo "pre-juridico" na
 * versão diz exatamente isso. Quando a revisão aprovar um texto final,
 * ele entra com versão nova.
 *
 * A linguagem segue a regra da estrutura §4: sempre "poderá estar
 * sujeito", nunca "será taxado" nem "não será taxado".
 */

export const ACEITE_INTERNACIONAL_VERSAO = "2026-08-28.v1.pre-juridico";

export const ACEITE_INTERNACIONAL_TEXTO =
  "Estou ciente de que esta é uma compra internacional, com frete " +
  "internacional cobrado em separado; de que o prazo de entrega pode ser " +
  "afetado pelo desembaraço aduaneiro; de que o pedido poderá estar " +
  "sujeito a impostos, taxas alfandegárias e outros encargos de importação " +
  "no país de destino, os quais são de minha responsabilidade; e de que " +
  "eventuais cobranças dependerão das regras do país de destino e da " +
  "modalidade de envio adotada.";

/** Aviso exibido junto do frete (estrutura §4 — discreto, sem alarmismo). */
export const AVISO_IMPOSTOS_TITULO = "Importante sobre impostos de importação";
export const AVISO_IMPOSTOS_TEXTO =
  "O frete internacional não inclui necessariamente impostos, taxas " +
  "alfandegárias ou outros encargos cobrados no país de destino. Eventuais " +
  "impostos e taxas de importação são determinados pelas autoridades do " +
  "país de destino e/ou pela transportadora e são de responsabilidade do " +
  "comprador. A Reverá não consegue garantir antecipadamente se haverá " +
  "tributação nem informar o valor exato desses encargos.";
