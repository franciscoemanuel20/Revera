/**
 * O aceite internacional — texto, versão e idioma.
 *
 * A versão é gravada em orders.terms_version junto com o instante
 * (terms_accepted_at, relógio do SERVIDOR). Mudou o texto → muda a versão,
 * NUNCA edite um texto mantendo a versão: o registro de quem aceitou a
 * versão antiga perderia o sentido.
 *
 * ===========================================================================
 * A VERSÃO É UMA SÓ, MESMO COM TRÊS LÍNGUAS (28/08/2026, espanhol em 29/08)
 * ===========================================================================
 * `pt`, `en` e `es` são o MESMO acordo escrito três vezes, não três acordos.
 * Por isso a versão não carrega o idioma: quem aceitou a v2 em inglês
 * aceitou o mesmo que quem aceitou a v2 em português, e é isso que precisa
 * ser verdade num litígio.
 *
 * O espanhol entrou em 29/08/2026 SEM subir a versão, e a escolha é
 * deliberada: a v2 não mudou de conteúdo para ninguém. Subir para v3 diria
 * que o acordo mudou — e diria isso também a quem já tinha aceitado, o que
 * seria falso. O que a versão promete é "este texto, este conteúdo"; uma
 * tradução fiel do mesmo conteúdo não é conteúdo novo.
 *
 * A ressalva honesta: isso é julgamento, não certeza jurídica, e o sufixo
 * `pre-juridico` continua valendo para as três línguas. Se o jurídico
 * entender que cada língua precisa de versão própria, o campo já existe e a
 * mudança é de uma linha.
 *
 * Consequência prática, e ela é dura: mudar SÓ a redação inglesa também
 * obriga versão nova. Se as duas línguas puderem divergir sem a versão
 * mudar, a versão deixa de provar o que a pessoa leu.
 *
 * ===========================================================================
 * O QUE MUDOU NA v2 (28/08/2026)
 * ===========================================================================
 * A v1 cumpria os cinco requisitos da §6 da estrutura. A v2 mantém os cinco
 * e acrescenta dois pontos que a operação da DHL torna necessários:
 *
 *   - exatidão dos dados de entrega (nome, endereço, telefone): a DHL
 *     devolve ou retém encomenda com endereço incompleto, e o custo disso
 *     precisa ter dono declarado ANTES, não depois;
 *   - a alfândega do destino pode exigir documento ou informação DO
 *     COMPRADOR (identificação fiscal, descrição, finalidade) — sem isso a
 *     encomenda não sai do desembaraço, e quem responde é ele.
 *
 * ===========================================================================
 * O QUE A v2 AINDA NÃO DIZ — E POR QUE (28/08/2026)
 * ===========================================================================
 * GARANTIA e DEVOLUÇÃO em compra internacional NÃO estão neste texto.
 *
 * Não é esquecimento: são regra comercial, e regra comercial é decisão do
 * Francisco, não do código. A garantia de 7 dias úteis existe para a venda
 * nacional; se ela vale igual para os EUA, quem paga o frete de retorno
 * internacional (que pode custar mais que a peça), e se há prazo diferente
 * — nada disso foi decidido.
 *
 * Escrever "7 dias" aqui por analogia criaria uma obrigação que ninguém
 * assumiu, na tela, com registro versionado de que o cliente aceitou. Um
 * aceite que promete o que a operação não sustenta é pior que um aceite
 * omisso: o omisso deixa a conversa aberta, o falso já perdeu.
 *
 * Quando o Francisco decidir, entra aqui como v3 — e o jurídico revisa o
 * conjunto. O sufixo "pre-juridico" continua dizendo a verdade até lá.
 */

import type { Idioma } from "./idioma";

export const ACEITE_INTERNACIONAL_VERSAO = "2026-08-28.v2.pre-juridico";

interface TextosDoAceite {
  aceite: string;
  avisoTitulo: string;
  avisoTexto: string;
}

/**
 * A linguagem segue a regra da estrutura §4: sempre "poderá estar sujeito",
 * nunca "será taxado" nem "não será taxado". Em inglês, "may be subject to"
 * — nunca "will be" nem "no duties apply".
 */
const ACEITE: Record<Idioma, TextosDoAceite> = {
  pt: {
    aceite:
      "Estou ciente de que esta é uma compra internacional, com frete " +
      "internacional cobrado em separado; de que o prazo de entrega pode ser " +
      "afetado pelo desembaraço aduaneiro; de que o pedido poderá estar " +
      "sujeito a impostos, taxas alfandegárias e outros encargos de importação " +
      "no país de destino, os quais são de minha responsabilidade; de que " +
      "eventuais cobranças dependerão das regras do país de destino e da " +
      "modalidade de envio adotada; de que sou responsável pela exatidão do " +
      "nome, endereço e telefone de entrega que informei; e de que a " +
      "alfândega do destino poderá exigir de mim documentos ou informações " +
      "adicionais para liberar a encomenda.",
    avisoTitulo: "Importante sobre impostos de importação",
    avisoTexto:
      "O frete internacional não inclui necessariamente impostos, taxas " +
      "alfandegárias ou outros encargos cobrados no país de destino. Eventuais " +
      "impostos e taxas de importação são determinados pelas autoridades do " +
      "país de destino e/ou pela transportadora e são de responsabilidade do " +
      "comprador. A Reverá não consegue garantir antecipadamente se haverá " +
      "tributação nem informar o valor exato desses encargos.",
  },
  en: {
    aceite:
      "I understand that this is an international purchase, with international " +
      "shipping charged separately; that delivery time may be affected by " +
      "customs clearance; that the order may be subject to import duties, " +
      "customs fees and other import charges in the destination country, which " +
      "are my responsibility; that any such charges depend on the rules of the " +
      "destination country and on the shipping method used; that I am " +
      "responsible for the accuracy of the delivery name, address and phone " +
      "number I provided; and that customs in the destination country may " +
      "require additional documents or information from me in order to release " +
      "the parcel.",
    avisoTitulo: "Important information about import duties",
    avisoTexto:
      "International shipping does not necessarily include duties, customs fees " +
      "or other charges levied in the destination country. Any import duties and " +
      "taxes are determined by the authorities of the destination country and/or " +
      "by the carrier, and are the buyer's responsibility. Reverá cannot " +
      "guarantee in advance whether such charges will apply, nor state their " +
      "exact amount.",
  },

  es: {
    aceite:
      "Entiendo que esta es una compra internacional, con envío internacional " +
      "cobrado por separado; que el plazo de entrega puede verse afectado por el " +
      "despacho de aduana; que el pedido podrá estar sujeto a aranceles, tasas " +
      "aduaneras y otros cargos de importación en el país de destino, que son de " +
      "mi responsabilidad; que dichos cargos dependen de las normas del país de " +
      "destino y de la modalidad de envío utilizada; que soy responsable de la " +
      "exactitud del nombre, la dirección y el teléfono de entrega que he " +
      "facilitado; y que la aduana del país de destino podrá exigirme documentos " +
      "o información adicionales para liberar el paquete.",
    avisoTitulo: "Importante sobre los impuestos de importación",
    avisoTexto:
      "El envío internacional no incluye necesariamente aranceles, tasas aduaneras " +
      "u otros cargos aplicados en el país de destino. Los impuestos y tasas de " +
      "importación los determinan las autoridades del país de destino y/o el " +
      "transportista, y son responsabilidad del comprador. Reverá no puede " +
      "garantizar de antemano si habrá tributación ni indicar el importe exacto de " +
      "esos cargos.",
  },
  fr: {
    aceite:
      "Je comprends qu’il s’agit d’un achat international, avec des frais de livraison internationale facturés séparément ; que le délai de livraison peut être affecté par le dédouanement ; que la commande peut être soumise à des droits, taxes douanières et autres frais d’importation dans le pays de destination, qui sont à ma charge ; que ces frais dépendent des règles du pays de destination et du mode d’expédition ; que je suis responsable de l’exactitude du nom, de l’adresse et du téléphone fournis ; et que la douane peut me demander des documents ou informations supplémentaires pour libérer le colis.",
    avisoTitulo: "Information importante sur les droits d’importation",
    avisoTexto:
      "La livraison internationale n’inclut pas nécessairement les droits, taxes douanières ou autres frais appliqués dans le pays de destination. Ces frais sont déterminés par les autorités du pays de destination et/ou le transporteur et restent à la charge de l’acheteur. Reverá ne peut garantir à l’avance leur application ni leur montant exact.",
  },
  de: {
    aceite:
      "Mir ist bewusst, dass es sich um einen internationalen Kauf handelt und der internationale Versand separat berechnet wird; dass die Lieferzeit durch die Zollabfertigung beeinflusst werden kann; dass die Bestellung im Zielland Einfuhrzöllen, Zollgebühren und weiteren Einfuhrabgaben unterliegen kann, für die ich verantwortlich bin; dass diese Kosten von den Vorschriften des Ziellandes und der Versandart abhängen; dass ich für die Richtigkeit des angegebenen Namens, der Lieferadresse und der Telefonnummer verantwortlich bin; und dass der Zoll zusätzliche Dokumente oder Angaben von mir verlangen kann, um die Sendung freizugeben.",
    avisoTitulo: "Wichtige Informationen zu Einfuhrabgaben",
    avisoTexto:
      "Der internationale Versand umfasst nicht zwangsläufig Zölle, Zollgebühren oder andere im Zielland erhobene Abgaben. Etwaige Einfuhrabgaben werden von den Behörden des Ziellandes und/oder dem Versanddienstleister festgelegt und sind vom Käufer zu tragen. Reverá kann weder im Voraus garantieren, ob solche Abgaben anfallen, noch deren genaue Höhe angeben.",
  },
};

export function aceiteInternacional(idioma: Idioma): TextosDoAceite {
  return ACEITE[idioma] ?? ACEITE.pt;
}

/* =========================================================================
 * COMPATIBILIDADE
 *
 * Os três nomes antigos continuam existindo, apontando para o português.
 * Quem já os importava não quebra, e quem for traduzir uma tela nova usa
 * `aceiteInternacional(idioma)`.
 * =======================================================================*/

export const ACEITE_INTERNACIONAL_TEXTO = ACEITE.pt.aceite;
export const AVISO_IMPOSTOS_TITULO = ACEITE.pt.avisoTitulo;
export const AVISO_IMPOSTOS_TEXTO = ACEITE.pt.avisoTexto;
