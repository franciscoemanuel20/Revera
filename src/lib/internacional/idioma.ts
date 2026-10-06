/**
 * O idioma do comprador — e todo o texto que ele lê.
 *
 * ===========================================================================
 * POR QUE UMA TABELA, E NÃO next-intl (28/08/2026)
 * ===========================================================================
 * A loja é brasileira e a vitrine é em português. O que precisa falar outra
 * língua é o CAMINHO DO DINHEIRO: checkout, pagamento, página do pedido e o
 * que o comprador recebe depois. Instalar um framework de i18n para isso
 * significaria mexer no layout raiz, no roteamento e em toda página da
 * vitrine — ou seja, arriscar a venda nacional, que é a que paga as contas,
 * para traduzir cinco telas.
 *
 * Aqui o dicionário é dado, como `paises.ts` é dado. Quem renderiza uma
 * tela internacional pergunta o texto ao idioma do país. Uma fonte, muitos
 * leitores — e o português continua sendo o caminho padrão de tudo que não
 * pergunta nada.
 *
 * ===========================================================================
 * A INTERFACE É A TRAVA
 * ===========================================================================
 * `Dicionario` é uma interface, não um `Record<string, string>`. Esquecer
 * uma frase em inglês não produz uma tela meio traduzida em produção: não
 * compila. Foi de propósito — texto faltando numa tela de pagamento é o
 * tipo de defeito que só o cliente descobre.
 *
 * ===========================================================================
 * PORTUGAL FALA PORTUGUÊS
 * ===========================================================================
 * PT é internacional (euro, DHL, alfândega) e mesmo assim lê em português.
 * Por isso o idioma vive em `paises.ts`, junto do resto do que o país
 * exige, e não numa regra "é BR? então português".
 */

export type Idioma = "pt" | "en" | "es" | "fr" | "de";

export interface Dicionario {
  /* --- casca do checkout --- */
  checkoutEyebrow: string;
  checkoutTitulo: string;
  navPaisLabel: string;

  /* --- caixa da transportadora --- */
  envioPorTitulo: (transportadora: string) => string;
  envioBulletPortaAPorta: string;
  envioBulletPrazo: string;
  envioBulletImpostos: string;

  /* --- indisponibilidade --- */
  indisponivelTitulo: (pais: string) => string;
  indisponivelAlternativa: string;
  indisponivelLinkBR: string;
  indisponivelGenerico: string;
  semPrecoNoMercado: string;
  sacolaVazia: string;

  /* --- formulário --- */
  secaoSeusDados: string;
  secaoEndereco: (pais: string) => string;
  labelNome: string;
  labelEmail: string;
  labelTelefone: string;
  hintTelefone: (ddi: string) => string;
  labelEndereco: string;
  labelComplemento: string;
  labelEmpresa: string;
  labelCidade: string;
  labelRegiaoPadrao: string;
  hintOpcional: string;
  hintExemplo: (exemplo: string) => string;

  /* --- resumo --- */
  resumoTitulo: string;
  resumoProdutos: string;
  resumoFrete: (transportadora: string) => string;
  resumoPrazo: (min: number, max: number | null) => string;
  resumoTotal: string;
  resumoRessalvaPrazo: string;

  /* --- aceite e botão --- */
  aceiteObrigatorio: string;
  botaoContinuar: string;
  botaoEnviando: string;

  /* --- erros do servidor --- */
  erroConfiraCampos: string;
  erroNome: string;
  erroEmail: string;
  erroTelefone: string;
  erroEnderecoObrigatorio: string;
  erroCidadeObrigatoria: string;
  erroPostalObrigatorio: string;
  erroPostalInvalido: (rotulo: string, exemplo: string) => string;
  erroRegiaoObrigatoria: (rotulo: string) => string;
  erroPaisNaoAtendido: string;
  erroEnderecoBrasileiro: string;
  erroPedidoEmAndamento: string;
  erroRegistrarDados: string;
  erroRegistrarEndereco: string;

  /* --- página do pedido --- */
  pedidoTituloAba: string;
  pedidoPago: string;
  pedidoEstornado: string;
  pedidoAguardando: string;
  pedidoTextoPago: string;
  pedidoTextoAguardando: string;
  pedidoTextoEstornado: string;
  pedidoPassoRecebido: string;
  pedidoPassoPago: string;
  pedidoPassoPreparando: string;
  pedidoPassoEtiqueta: string;
  pedidoPassoEnviado: string;
  pedidoPassoEntregue: string;
  pedidoRastreamento: string;
  pedidoNumero: (numero: string) => string;
  pedidoCancelado: string;
  pedidoItens: string;
  pedidoSubtotal: string;
  pedidoDesconto: string;
  pedidoFrete: string;
  pedidoFreteACombinar: string;
  pedidoTotal: string;
  pedidoEntrega: string;
  /* --- suporte pós-compra --- */
  suporteTitulo: string;
  suporteTexto: string;
  suporteBotao: (numeroPedido: string) => string;
  suporteMensagem: (numeroPedido: string) => string;
  /* --- quem já recebeu e quer comprar de novo (03/09/2026) --- */
  recompraBotao: string;
  recompraMensagem: (numeroPedido: string) => string;
  /* --- suporte com o pagamento ainda pendente --- */
  suporteTituloPendente: string;
  suporteTextoPendente: string;
  suporteBotaoPendente: string;
  suporteMensagemPendente: (numeroPedido: string) => string;
  suporteTelefoneRotulo: string;
}

/* =========================================================================
 * PORTUGUÊS — o texto que já existia, movido para cá sem uma vírgula
 * mudada. Mover e traduzir na mesma passada esconderia a mudança de sentido
 * dentro da mudança de idioma.
 * =======================================================================*/

const PT: Dicionario = {
  checkoutEyebrow: "Quase lá",
  checkoutTitulo: "Finalizar pedido",
  navPaisLabel: "País de entrega",

  envioPorTitulo: (t) => `Seu pedido será enviado pela ${t}`,
  envioBulletPortaAPorta: "Envio porta a porta, com rastreamento e comprovante de entrega.",
  envioBulletPrazo: "O prazo estimado é informado no momento da contratação do envio.",
  envioBulletImpostos:
    "A encomenda poderá estar sujeita a impostos e taxas no país de destino " +
    "(detalhes abaixo, antes de finalizar).",

  indisponivelTitulo: (p) => `${p} — indisponível no momento`,
  indisponivelAlternativa:
    "Você pode finalizar uma entrega no Brasil normalmente, ou voltar mais tarde.",
  indisponivelLinkBR: "Ir para o checkout do Brasil",
  indisponivelGenerico: "Indisponível.",
  semPrecoNoMercado:
    "Um dos itens da sua sacola ainda não tem preço definido para este país.",
  sacolaVazia:
    "Sua sacola está vazia — volte à loja e adicione uma peça antes de finalizar.",

  secaoSeusDados: "Seus dados",
  secaoEndereco: (p) => `Endereço de entrega — ${p}`,
  labelNome: "Nome completo",
  labelEmail: "E-mail",
  labelTelefone: "Telefone",
  hintTelefone: (ddi) => `Com o código do país (+${ddi}).`,
  labelEndereco: "Endereço (rua e número)",
  labelComplemento: "Complemento",
  labelEmpresa: "Empresa",
  labelCidade: "Cidade",
  labelRegiaoPadrao: "Região",
  hintOpcional: "Opcional.",
  hintExemplo: (e) => `Exemplo: ${e}`,

  resumoTitulo: "Resumo",
  resumoProdutos: "Produtos",
  resumoFrete: (t) => `Frete internacional — ${t}`,
  resumoPrazo: (min, max) =>
    ` · ${min}${max && max !== min ? `–${max}` : ""} dias úteis estimados pela transportadora`,
  resumoTotal: "Total",
  resumoRessalvaPrazo:
    "O prazo estimado é da transportadora e não inclui o tempo de preparação nem o " +
    "desembaraço aduaneiro. Não prometemos data de entrega absoluta em envio internacional.",

  aceiteObrigatorio: "É preciso aceitar as condições de envio internacional.",
  botaoContinuar: "Continuar para o pagamento",
  botaoEnviando: "Criando seu pedido…",

  erroConfiraCampos: "Confira os dados marcados abaixo.",
  erroNome: "Informe seu nome completo.",
  erroEmail: "E-mail inválido.",
  erroTelefone: "Informe seu telefone.",
  erroEnderecoObrigatorio: "Informe o endereço.",
  erroCidadeObrigatoria: "Informe a cidade.",
  erroPostalObrigatorio: "Informe o código postal.",
  erroPostalInvalido: (rotulo, exemplo) => `${rotulo} inválido — exemplo: ${exemplo}.`,
  erroRegiaoObrigatoria: (rotulo) => `Informe ${rotulo}.`,
  erroPaisNaoAtendido: "Ainda não entregamos neste país.",
  erroEnderecoBrasileiro: "Endereço no Brasil usa o checkout nacional.",
  erroPedidoEmAndamento:
    "Este pedido já está sendo finalizado. Aguarde um instante — se a tela " +
    "não avançar sozinha, confira seu e-mail antes de tentar de novo.",
  erroRegistrarDados: "Não foi possível registrar seus dados. Tente novamente.",
  erroRegistrarEndereco: "Não foi possível registrar o endereço. Tente novamente.",

  pedidoTituloAba: "Seu pedido — Reverá",
  pedidoPago: "Pagamento confirmado",
  pedidoEstornado: "Pagamento estornado",
  pedidoAguardando: "Aguardando pagamento",
  pedidoTextoPago: "Recebemos seu pedido e já estamos cuidando dele.",
  pedidoTextoAguardando: "Assim que o pagamento for identificado, esta página se atualiza.",
  pedidoTextoEstornado: "O valor deste pedido foi devolvido. Qualquer dúvida, fale com a gente.",
  pedidoPassoRecebido: "Pedido recebido",
  pedidoPassoPago: "Pagamento confirmado",
  pedidoPassoPreparando: "Preparando",
  pedidoPassoEtiqueta: "Etiqueta pronta",
  pedidoPassoEnviado: "Enviado",
  pedidoPassoEntregue: "Entregue",
  pedidoRastreamento: "Rastreamento",
  pedidoNumero: (n) => `Pedido ${n}`,
  pedidoCancelado: "Este pedido foi cancelado.",
  pedidoItens: "Itens",
  pedidoSubtotal: "Subtotal",
  pedidoDesconto: "Desconto",
  pedidoFrete: "Frete",
  pedidoFreteACombinar: "a combinar",
  pedidoTotal: "Total",
  pedidoEntrega: "Entrega",

  suporteTitulo: "Ficou com alguma dúvida?",
  suporteTexto: "Fale com a nossa equipe sobre este pedido.",
  suporteBotao: (n) => `Falar sobre o pedido ${n}`,
  suporteMensagem: (n) => `Olá! Tenho uma dúvida sobre o pedido ${n}.`,
  recompraBotao: "Comprei e quero comprar mais",
  recompraMensagem: (n) =>
    `Olá! Comprei o pedido ${n} e gostaria de comprar mais.`,

  suporteTituloPendente: "Precisa de ajuda com o pagamento?",
  suporteTextoPendente:
    "Se o pagamento não passou, ou se você tem qualquer dúvida antes de pagar, fale com a nossa equipe.",
  suporteBotaoPendente: "Chamar no WhatsApp",
  suporteMensagemPendente: (n) =>
    `Olá! Preciso de ajuda com o pagamento do pedido ${n}.`,
  suporteTelefoneRotulo: "Telefone de suporte",
};

/* =========================================================================
 * INGLÊS
 *
 * Duas escolhas que não são estilo, são risco:
 *
 * 1. "may be subject to" — nunca "will be taxed" nem "no taxes". É a mesma
 *    regra da §4 da estrutura de envio, agora na outra língua: prometer
 *    ausência de imposto é promessa que a alfândega desmente.
 * 2. "business days" e "estimated by the carrier" — o prazo é da DHL, não
 *    nosso. Em inglês a diferença entre "delivery in 5 days" e "5 business
 *    days estimated by the carrier" é a diferença entre uma expectativa e
 *    uma promessa que não podemos cumprir.
 * =======================================================================*/

const EN: Dicionario = {
  checkoutEyebrow: "Almost there",
  checkoutTitulo: "Complete your order",
  navPaisLabel: "Delivery country",

  envioPorTitulo: (t) => `Your order ships with ${t}`,
  envioBulletPortaAPorta: "Door-to-door delivery, with tracking and proof of delivery.",
  envioBulletPrazo: "The estimated transit time is confirmed when the shipment is booked.",
  envioBulletImpostos:
    "Your parcel may be subject to import duties and taxes in the destination country " +
    "(details below, before you complete the order).",

  indisponivelTitulo: (p) => `${p} — currently unavailable`,
  indisponivelAlternativa:
    "You can still order with delivery inside Brazil, or check back later.",
  indisponivelLinkBR: "Go to the Brazilian checkout",
  indisponivelGenerico: "Unavailable.",
  semPrecoNoMercado:
    "One of the items in your bag has no price set for this country yet.",
  sacolaVazia: "Your bag is empty — add a piece before checking out.",

  secaoSeusDados: "Your details",
  secaoEndereco: (p) => `Shipping address — ${p}`,
  labelNome: "Full name",
  labelEmail: "Email",
  labelTelefone: "Phone",
  hintTelefone: (ddi) => `Including the country code (+${ddi}).`,
  labelEndereco: "Address (street and number)",
  labelComplemento: "Apartment, suite, etc.",
  labelEmpresa: "Company",
  labelCidade: "City",
  labelRegiaoPadrao: "Region",
  hintOpcional: "Optional.",
  hintExemplo: (e) => `Example: ${e}`,

  resumoTitulo: "Order summary",
  resumoProdutos: "Items",
  resumoFrete: (t) => `International shipping — ${t}`,
  resumoPrazo: (min, max) =>
    ` · ${min}${max && max !== min ? `–${max}` : ""} business days estimated by the carrier`,
  resumoTotal: "Total",
  resumoRessalvaPrazo:
    "Transit time is estimated by the carrier and does not include preparation time or " +
    "customs clearance. We do not promise a guaranteed delivery date on international shipments.",

  aceiteObrigatorio: "Please accept the international shipping terms to continue.",
  botaoContinuar: "Continue to payment",
  botaoEnviando: "Creating your order…",

  erroConfiraCampos: "Please check the fields marked below.",
  erroNome: "Enter your full name.",
  erroEmail: "Invalid email address.",
  erroTelefone: "Enter your phone number.",
  erroEnderecoObrigatorio: "Enter your address.",
  erroCidadeObrigatoria: "Enter your city.",
  erroPostalObrigatorio: "Enter your postal code.",
  erroPostalInvalido: (rotulo, exemplo) => `Invalid ${rotulo} — example: ${exemplo}.`,
  erroRegiaoObrigatoria: (rotulo) => `Enter your ${rotulo}.`,
  erroPaisNaoAtendido: "We do not ship to this country yet.",
  erroEnderecoBrasileiro: "A Brazilian address uses the Brazilian checkout.",
  erroPedidoEmAndamento:
    "This order is already being completed. Give it a moment — if the page does not " +
    "move on its own, check your email before trying again.",
  erroRegistrarDados: "We could not save your details. Please try again.",
  erroRegistrarEndereco: "We could not save your address. Please try again.",

  pedidoTituloAba: "Your order — Reverá",
  pedidoPago: "Payment confirmed",
  pedidoEstornado: "Payment refunded",
  pedidoAguardando: "Awaiting payment",
  pedidoTextoPago: "We have received your order and we are already working on it.",
  pedidoTextoAguardando: "This page updates as soon as the payment is confirmed.",
  pedidoTextoEstornado:
    "This order has been refunded. If you have any question, get in touch with us.",
  pedidoPassoRecebido: "Order received",
  pedidoPassoPago: "Payment confirmed",
  pedidoPassoPreparando: "Preparing",
  pedidoPassoEtiqueta: "Label ready",
  pedidoPassoEnviado: "Shipped",
  pedidoPassoEntregue: "Delivered",
  pedidoRastreamento: "Tracking",
  pedidoNumero: (n) => `Order ${n}`,
  pedidoCancelado: "This order has been cancelled.",
  pedidoItens: "Items",
  pedidoSubtotal: "Subtotal",
  pedidoDesconto: "Discount",
  pedidoFrete: "Shipping",
  pedidoFreteACombinar: "to be confirmed",
  pedidoTotal: "Total",
  pedidoEntrega: "Delivery address",

  suporteTitulo: "Any questions?",
  // "Brazilian business hours" não está no original em português, e é a
  // única frase acrescentada na tradução — de propósito. Quem escreve de
  // Sydney precisa saber que a resposta vem de outro fuso, senão o silêncio
  // da madrugada dele parece descaso. O brasileiro já sabe.
  suporteTexto:
    "Talk to our team about this order — we reply during Brazilian business hours.",
  suporteBotao: (n) => `Ask about order ${n}`,
  suporteMensagem: (n) => `Hello! I have a question about order ${n}.`,
  recompraBotao: "I bought, and I want to order more",
  recompraMensagem: (n) =>
    `Hello! I placed order ${n} and I would like to order more.`,

  suporteTituloPendente: "Need help with the payment?",
  // Mesma razão da frase acrescentada em `suporteTexto`: quem escreve de
  // fora precisa saber de que fuso vem a resposta.
  suporteTextoPendente:
    "If the payment did not go through, or you have any question before paying, talk to our team — we reply during Brazilian business hours.",
  suporteBotaoPendente: "Message us on WhatsApp",
  suporteMensagemPendente: (n) =>
    `Hello! I need help with the payment for order ${n}.`,
  suporteTelefoneRotulo: "Support phone",
};

/* =========================================================================
 * ESPANHOL
 *
 * Entra em 29/08/2026 pela regra que o Francisco deu: idioma novo só onde
 * já existe MOEDA com preço gravado. O euro já tem as cinco linhas em
 * produção, então a Espanha é o único mercado hispanofalante que o sistema
 * consegue precificar hoje. México e Argentina exigiriam moeda nova, preço
 * novo e cotação nova — seria mercado novo, não tradução.
 *
 * Três escolhas que não são estilo:
 *
 * 1. "podrá estar sujeto" — mesma regra da §4 em pt e en. Nunca "será
 *    gravado" nem "sin impuestos". Espanha é União Europeia, e encomenda
 *    vinda do Brasil paga IVA na importação: prometer o contrário é
 *    promessa que a alfândega desmente na cara do comprador.
 * 2. "días hábiles estimados por el transportista" — o prazo é da DHL, e a
 *    frase precisa dizer de quem é, igual nas outras duas línguas.
 * 3. Tratamento por "tú", como o varejo espanhol faz. O aceite abaixo é a
 *    exceção: lá o texto é em primeira pessoa, porque é declaração de quem
 *    assina, não conversa de loja.
 * =======================================================================*/

const ES: Dicionario = {
  checkoutEyebrow: "Ya casi",
  checkoutTitulo: "Finalizar pedido",
  navPaisLabel: "País de entrega",

  envioPorTitulo: (t) => `Tu pedido se envía con ${t}`,
  envioBulletPortaAPorta: "Entrega puerta a puerta, con seguimiento y comprobante de entrega.",
  envioBulletPrazo: "El plazo estimado se confirma al contratar el envío.",
  envioBulletImpostos:
    "El paquete podrá estar sujeto a aranceles e impuestos de importación en el país " +
    "de destino (detalles más abajo, antes de finalizar).",

  indisponivelTitulo: (p) => `${p} — no disponible por el momento`,
  indisponivelAlternativa:
    "Puedes finalizar un pedido con entrega en Brasil, o volver más tarde.",
  indisponivelLinkBR: "Ir al checkout de Brasil",
  indisponivelGenerico: "No disponible.",
  semPrecoNoMercado:
    "Uno de los artículos de tu bolsa todavía no tiene precio definido para este país.",
  sacolaVazia: "Tu bolsa está vacía — añade una pieza antes de finalizar.",

  secaoSeusDados: "Tus datos",
  secaoEndereco: (p) => `Dirección de entrega — ${p}`,
  labelNome: "Nombre completo",
  labelEmail: "Correo electrónico",
  labelTelefone: "Teléfono",
  hintTelefone: (ddi) => `Con el prefijo del país (+${ddi}).`,
  labelEndereco: "Dirección (calle y número)",
  labelComplemento: "Piso, puerta, etc.",
  labelEmpresa: "Empresa",
  labelCidade: "Ciudad",
  labelRegiaoPadrao: "Región",
  hintOpcional: "Opcional.",
  hintExemplo: (e) => `Ejemplo: ${e}`,

  resumoTitulo: "Resumen del pedido",
  resumoProdutos: "Artículos",
  resumoFrete: (t) => `Envío internacional — ${t}`,
  resumoPrazo: (min, max) =>
    ` · ${min}${max && max !== min ? `–${max}` : ""} días hábiles estimados por el transportista`,
  resumoTotal: "Total",
  resumoRessalvaPrazo:
    "El plazo es una estimación del transportista y no incluye el tiempo de preparación " +
    "ni el despacho de aduana. No prometemos una fecha de entrega garantizada en envíos " +
    "internacionales.",

  aceiteObrigatorio: "Es necesario aceptar las condiciones de envío internacional.",
  botaoContinuar: "Continuar al pago",
  botaoEnviando: "Creando tu pedido…",

  erroConfiraCampos: "Revisa los campos marcados abajo.",
  erroNome: "Introduce tu nombre completo.",
  erroEmail: "Correo electrónico no válido.",
  erroTelefone: "Introduce tu teléfono.",
  erroEnderecoObrigatorio: "Introduce la dirección.",
  erroCidadeObrigatoria: "Introduce la ciudad.",
  erroPostalObrigatorio: "Introduce el código postal.",
  erroPostalInvalido: (rotulo, exemplo) => `${rotulo} no válido — ejemplo: ${exemplo}.`,
  erroRegiaoObrigatoria: (rotulo) => `Introduce ${rotulo}.`,
  erroPaisNaoAtendido: "Todavía no enviamos a este país.",
  erroEnderecoBrasileiro: "Una dirección en Brasil usa el checkout brasileño.",
  erroPedidoEmAndamento:
    "Este pedido ya se está finalizando. Espera un momento — si la página no avanza " +
    "sola, revisa tu correo antes de volver a intentarlo.",
  erroRegistrarDados: "No hemos podido guardar tus datos. Inténtalo de nuevo.",
  erroRegistrarEndereco: "No hemos podido guardar la dirección. Inténtalo de nuevo.",

  pedidoTituloAba: "Tu pedido — Reverá",
  pedidoPago: "Pago confirmado",
  pedidoEstornado: "Pago reembolsado",
  pedidoAguardando: "Pago pendiente",
  pedidoTextoPago: "Hemos recibido tu pedido y ya nos estamos ocupando de él.",
  pedidoTextoAguardando: "Esta página se actualiza en cuanto se confirme el pago.",
  pedidoTextoEstornado:
    "El importe de este pedido ha sido devuelto. Si tienes cualquier duda, escríbenos.",
  pedidoPassoRecebido: "Pedido recibido",
  pedidoPassoPago: "Pago confirmado",
  pedidoPassoPreparando: "En preparación",
  pedidoPassoEtiqueta: "Etiqueta lista",
  pedidoPassoEnviado: "Enviado",
  pedidoPassoEntregue: "Entregado",
  pedidoRastreamento: "Seguimiento",
  pedidoNumero: (n) => `Pedido ${n}`,
  pedidoCancelado: "Este pedido ha sido cancelado.",
  pedidoItens: "Artículos",
  pedidoSubtotal: "Subtotal",
  pedidoDesconto: "Descuento",
  pedidoFrete: "Envío",
  pedidoFreteACombinar: "a confirmar",
  pedidoTotal: "Total",
  pedidoEntrega: "Dirección de entrega",

  suporteTitulo: "¿Te ha quedado alguna duda?",
  // Mesma frase acrescentada que existe no inglês, e pela mesma razão: de
  // Madrid são cinco horas de diferença, e o silêncio da tarde dele parece
  // descaso se ninguém avisar que a resposta vem do Brasil.
  suporteTexto:
    "Habla con nuestro equipo sobre este pedido — respondemos en horario comercial de Brasil.",
  suporteBotao: (n) => `Preguntar por el pedido ${n}`,
  suporteMensagem: (n) => `¡Hola! Tengo una duda sobre el pedido ${n}.`,
  recompraBotao: "Ya compré y quiero comprar más",
  recompraMensagem: (n) =>
    `¡Hola! Hice el pedido ${n} y me gustaría comprar más.`,

  suporteTituloPendente: "¿Necesitas ayuda con el pago?",
  // Mesma frase de fuso que existe no inglês, e pela mesma razão.
  suporteTextoPendente:
    "Si el pago no se completó, o tienes cualquier duda antes de pagar, habla con nuestro equipo — respondemos en horario comercial de Brasil.",
  suporteBotaoPendente: "Escríbenos por WhatsApp",
  suporteMensagemPendente: (n) =>
    `¡Hola! Necesito ayuda con el pago del pedido ${n}.`,
  suporteTelefoneRotulo: "Teléfono de soporte",
};

const FR: Dicionario = {
  ...EN,
  checkoutEyebrow: "Presque terminé",
  checkoutTitulo: "Finaliser la commande",
  navPaisLabel: "Pays de livraison",
  envioPorTitulo: (t) => `Votre commande sera expédiée par ${t}`,
  envioBulletPortaAPorta: "Livraison porte à porte, avec suivi et preuve de livraison.",
  envioBulletPrazo: "Le délai estimé est confirmé lors de la réservation de l’envoi.",
  envioBulletImpostos: "Le colis peut être soumis à des droits et taxes d’importation dans le pays de destination (détails ci-dessous avant de finaliser).",
  indisponivelTitulo: (p) => `${p} — actuellement indisponible`,
  indisponivelAlternativa: "Vous pouvez toujours commander avec une livraison au Brésil ou revenir plus tard.",
  indisponivelLinkBR: "Accéder au paiement pour le Brésil",
  indisponivelGenerico: "Indisponible.",
  semPrecoNoMercado: "Un article de votre panier n’a pas encore de prix défini pour ce pays.",
  sacolaVazia: "Votre panier est vide — ajoutez un article avant de finaliser.",
  secaoSeusDados: "Vos coordonnées",
  secaoEndereco: (p) => `Adresse de livraison — ${p}`,
  labelNome: "Nom complet", labelEmail: "E-mail", labelTelefone: "Téléphone",
  hintTelefone: (ddi) => `Avec l’indicatif du pays (+${ddi}).`,
  labelEndereco: "Adresse (rue et numéro)", labelComplemento: "Complément d’adresse",
  labelEmpresa: "Entreprise", labelCidade: "Ville", labelRegiaoPadrao: "Région",
  hintOpcional: "Facultatif.", hintExemplo: (e) => `Exemple : ${e}`,
  resumoTitulo: "Récapitulatif", resumoProdutos: "Articles",
  resumoFrete: (t) => `Livraison internationale — ${t}`,
  resumoPrazo: (min, max) => ` · ${min}${max && max !== min ? `–${max}` : ""} jours ouvrés estimés par le transporteur`,
  resumoTotal: "Total",
  resumoRessalvaPrazo: "Le délai est estimé par le transporteur et n’inclut ni la préparation ni le dédouanement. Nous ne garantissons pas de date de livraison pour les envois internationaux.",
  aceiteObrigatorio: "Veuillez accepter les conditions d’expédition internationale.",
  botaoContinuar: "Continuer vers le paiement", botaoEnviando: "Création de votre commande…",
  erroConfiraCampos: "Vérifiez les champs indiqués ci-dessous.", erroNome: "Indiquez votre nom complet.",
  erroEmail: "Adresse e-mail invalide.", erroTelefone: "Indiquez votre téléphone.",
  erroEnderecoObrigatorio: "Indiquez votre adresse.", erroCidadeObrigatoria: "Indiquez votre ville.",
  erroPostalObrigatorio: "Indiquez votre code postal.",
  erroPostalInvalido: (r, e) => `${r} invalide — exemple : ${e}.`,
  erroRegiaoObrigatoria: (r) => `Indiquez ${r}.`, erroPaisNaoAtendido: "Nous ne livrons pas encore dans ce pays.",
  erroEnderecoBrasileiro: "Une adresse au Brésil utilise le paiement brésilien.",
  erroPedidoEmAndamento: "Cette commande est déjà en cours de finalisation. Patientez un instant et vérifiez votre e-mail avant de réessayer.",
  erroRegistrarDados: "Impossible d’enregistrer vos coordonnées. Réessayez.",
  erroRegistrarEndereco: "Impossible d’enregistrer l’adresse. Réessayez.",
  pedidoTituloAba: "Votre commande — Reverá", pedidoPago: "Paiement confirmé", pedidoEstornado: "Paiement remboursé", pedidoAguardando: "Paiement en attente",
  pedidoTextoPago: "Nous avons reçu votre commande et nous nous en occupons déjà.",
  pedidoTextoAguardando: "Cette page sera mise à jour dès que le paiement sera confirmé.",
  pedidoTextoEstornado: "Cette commande a été remboursée. Contactez-nous si vous avez une question.",
  pedidoPassoRecebido: "Commande reçue", pedidoPassoPago: "Paiement confirmé", pedidoPassoPreparando: "Préparation", pedidoPassoEtiqueta: "Étiquette prête", pedidoPassoEnviado: "Expédiée", pedidoPassoEntregue: "Livrée", pedidoRastreamento: "Suivi",
  pedidoNumero: (n) => `Commande ${n}`, pedidoCancelado: "Cette commande a été annulée.", pedidoItens: "Articles", pedidoSubtotal: "Sous-total", pedidoDesconto: "Remise", pedidoFrete: "Livraison", pedidoFreteACombinar: "à confirmer", pedidoTotal: "Total", pedidoEntrega: "Adresse de livraison",
  suporteTitulo: "Une question ?", suporteTexto: "Contactez notre équipe au sujet de cette commande — nous répondons pendant les heures ouvrées au Brésil.",
  suporteBotao: (n) => `Question sur la commande ${n}`, suporteMensagem: (n) => `Bonjour ! J’ai une question sur la commande ${n}.`,
  recompraBotao: "Commander à nouveau", recompraMensagem: (n) => `Bonjour ! J’ai passé la commande ${n} et je souhaite commander à nouveau.`,
  suporteTituloPendente: "Besoin d’aide pour le paiement ?", suporteTextoPendente: "Si le paiement a échoué ou si vous avez une question avant de payer, contactez notre équipe — nous répondons pendant les heures ouvrées au Brésil.",
  suporteBotaoPendente: "Nous contacter sur WhatsApp", suporteMensagemPendente: (n) => `Bonjour ! J’ai besoin d’aide pour le paiement de la commande ${n}.`, suporteTelefoneRotulo: "Téléphone d’assistance",
};

const DE: Dicionario = {
  ...EN,
  checkoutEyebrow: "Fast geschafft", checkoutTitulo: "Bestellung abschließen", navPaisLabel: "Lieferland",
  envioPorTitulo: (t) => `Ihre Bestellung wird mit ${t} versandt`,
  envioBulletPortaAPorta: "Lieferung von Tür zu Tür mit Sendungsverfolgung und Zustellnachweis.",
  envioBulletPrazo: "Die voraussichtliche Laufzeit wird bei der Versandbuchung bestätigt.",
  envioBulletImpostos: "Die Sendung kann im Zielland Einfuhrzöllen und Steuern unterliegen (Einzelheiten unten vor dem Abschluss).",
  indisponivelTitulo: (p) => `${p} — derzeit nicht verfügbar`, indisponivelAlternativa: "Sie können weiterhin mit Lieferung innerhalb Brasiliens bestellen oder später wiederkommen.", indisponivelLinkBR: "Zum brasilianischen Checkout", indisponivelGenerico: "Nicht verfügbar.",
  semPrecoNoMercado: "Für einen Artikel im Warenkorb ist für dieses Land noch kein Preis festgelegt.", sacolaVazia: "Ihr Warenkorb ist leer — fügen Sie vor dem Checkout einen Artikel hinzu.",
  secaoSeusDados: "Ihre Angaben", secaoEndereco: (p) => `Lieferadresse — ${p}`, labelNome: "Vollständiger Name", labelEmail: "E-Mail", labelTelefone: "Telefon",
  hintTelefone: (ddi) => `Mit Ländervorwahl (+${ddi}).`, labelEndereco: "Adresse (Straße und Hausnummer)", labelComplemento: "Adresszusatz", labelEmpresa: "Unternehmen", labelCidade: "Ort", labelRegiaoPadrao: "Region", hintOpcional: "Optional.", hintExemplo: (e) => `Beispiel: ${e}`,
  resumoTitulo: "Bestellübersicht", resumoProdutos: "Artikel", resumoFrete: (t) => `Internationaler Versand — ${t}`,
  resumoPrazo: (min, max) => ` · ${min}${max && max !== min ? `–${max}` : ""} vom Versanddienstleister geschätzte Werktage`, resumoTotal: "Gesamt",
  resumoRessalvaPrazo: "Die Laufzeit wird vom Versanddienstleister geschätzt und umfasst weder die Vorbereitung noch die Zollabfertigung. Für internationale Sendungen garantieren wir kein Lieferdatum.",
  aceiteObrigatorio: "Bitte stimmen Sie den internationalen Versandbedingungen zu.", botaoContinuar: "Weiter zur Zahlung", botaoEnviando: "Bestellung wird erstellt…",
  erroConfiraCampos: "Bitte prüfen Sie die markierten Felder.", erroNome: "Geben Sie Ihren vollständigen Namen ein.", erroEmail: "Ungültige E-Mail-Adresse.", erroTelefone: "Geben Sie Ihre Telefonnummer ein.", erroEnderecoObrigatorio: "Geben Sie Ihre Adresse ein.", erroCidadeObrigatoria: "Geben Sie Ihren Ort ein.", erroPostalObrigatorio: "Geben Sie Ihre Postleitzahl ein.", erroPostalInvalido: (r, e) => `${r} ungültig — Beispiel: ${e}.`, erroRegiaoObrigatoria: (r) => `Geben Sie ${r} ein.`, erroPaisNaoAtendido: "Wir liefern noch nicht in dieses Land.", erroEnderecoBrasileiro: "Eine brasilianische Adresse nutzt den brasilianischen Checkout.", erroPedidoEmAndamento: "Diese Bestellung wird bereits abgeschlossen. Warten Sie einen Moment und prüfen Sie Ihre E-Mail, bevor Sie es erneut versuchen.", erroRegistrarDados: "Ihre Angaben konnten nicht gespeichert werden. Versuchen Sie es erneut.", erroRegistrarEndereco: "Die Adresse konnte nicht gespeichert werden. Versuchen Sie es erneut.",
  pedidoTituloAba: "Ihre Bestellung — Reverá", pedidoPago: "Zahlung bestätigt", pedidoEstornado: "Zahlung erstattet", pedidoAguardando: "Zahlung ausstehend", pedidoTextoPago: "Wir haben Ihre Bestellung erhalten und bearbeiten sie bereits.", pedidoTextoAguardando: "Diese Seite wird aktualisiert, sobald die Zahlung bestätigt ist.", pedidoTextoEstornado: "Diese Bestellung wurde erstattet. Kontaktieren Sie uns bei Fragen.", pedidoPassoRecebido: "Bestellung eingegangen", pedidoPassoPago: "Zahlung bestätigt", pedidoPassoPreparando: "In Vorbereitung", pedidoPassoEtiqueta: "Versandetikett erstellt", pedidoPassoEnviado: "Versandt", pedidoPassoEntregue: "Zugestellt", pedidoRastreamento: "Sendungsverfolgung", pedidoNumero: (n) => `Bestellung ${n}`, pedidoCancelado: "Diese Bestellung wurde storniert.", pedidoItens: "Artikel", pedidoSubtotal: "Zwischensumme", pedidoDesconto: "Rabatt", pedidoFrete: "Versand", pedidoFreteACombinar: "wird bestätigt", pedidoTotal: "Gesamt", pedidoEntrega: "Lieferadresse",
  suporteTitulo: "Haben Sie Fragen?", suporteTexto: "Kontaktieren Sie unser Team zu dieser Bestellung — wir antworten während der brasilianischen Geschäftszeiten.", suporteBotao: (n) => `Frage zu Bestellung ${n}`, suporteMensagem: (n) => `Hallo! Ich habe eine Frage zu Bestellung ${n}.`, recompraBotao: "Erneut bestellen", recompraMensagem: (n) => `Hallo! Ich habe Bestellung ${n} aufgegeben und möchte erneut bestellen.`, suporteTituloPendente: "Benötigen Sie Hilfe bei der Zahlung?", suporteTextoPendente: "Wenn die Zahlung nicht funktioniert hat oder Sie vor der Zahlung eine Frage haben, kontaktieren Sie unser Team — wir antworten während der brasilianischen Geschäftszeiten.", suporteBotaoPendente: "Über WhatsApp kontaktieren", suporteMensagemPendente: (n) => `Hallo! Ich benötige Hilfe bei der Zahlung für Bestellung ${n}.`, suporteTelefoneRotulo: "Support-Telefon",
};

export const TEXTOS: Record<Idioma, Dicionario> = { pt: PT, en: EN, es: ES, fr: FR, de: DE };

export function textos(idioma: Idioma): Dicionario {
  return TEXTOS[idioma] ?? PT;
}

/**
 * O `lang` do HTML, por idioma.
 *
 * Vira tabela em 29/08/2026 porque as duas páginas escreviam
 * `idioma === "en" ? "en" : "pt-BR"` — um ternário que estava certo
 * enquanto só havia duas línguas e passou a MENTIR na terceira: entregaria
 * `lang="pt-BR"` numa página em espanhol. Isso não é detalhe cosmético — é
 * o que o leitor de tela usa para escolher a pronúncia, e o que o Google
 * usa para saber em que idioma a página está.
 *
 * `pt-BR` e não `pt` porque a loja é brasileira; `en` e `es` sem região
 * porque o texto é um só para todos os mercados daquela língua — a região
 * quem carrega é o `locale` do país, que formata número e data.
 */
export const LANG_HTML: Record<Idioma, string> = {
  pt: "pt-BR",
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
};
