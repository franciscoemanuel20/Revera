import type { TextoRegistrado } from "../registro";

/**
 * /sobre-as-proteses — mesmo cuidado do comentário original da página:
 * texto genérico sobre a categoria, ou fato específico da Reverá já
 * confirmado em outro lugar. O parágrafo de "Cabelos grisalhos" é, letra
 * por letra, o mesmo texto de `cuidados.bloco3.texto` — mas ganha chave
 * própria aqui, porque cada chave é "um lugar na página" (ver o cabeçalho
 * de registro.ts); se as duas apontassem para a mesma chave, editar uma
 * mudaria a outra sem o Francisco esperar isso.
 *
 * Os `href` dos links internos ficam de fora do registro: não são copy de
 * marketing, são destino de navegação — e editar um `href` por engano
 * quebraria o link sem nenhum aviso.
 *
 * ATUALIZAÇÃO 02/09/2026 — as três fotos ENTRARAM no registro, com a
 * descrição de cada uma ao lado. Antes eram três arquivos fixos no código
 * (o grid "3.jpg"/"5.jpg"/"7.jpg", fotos de FIO) e o alt-text ficava de
 * fora por ser "metadado, não copy". Duas coisas mudaram isso:
 *
 * 1. As fotos passaram a ser da BASE, que é o assunto da seção logo acima
 *    (pedido do Francisco). Foto de fio ilustrando um texto sobre base era
 *    incoerência que ninguém tinha notado.
 * 2. Se a foto agora pode ser trocada pelo painel, a descrição TEM que
 *    poder também: uma descrição que continua falando da foto antiga é
 *    pior que descrição nenhuma — ela mente para quem usa leitor de tela
 *    e para o Google, e ninguém que enxerga a página percebe.
 */
export const SOBRE = {
  "sobre.eyebrow": {
    pagina: "sobre",
    rotulo: "Etiqueta acima do título",
    tipo: "texto",
    padrao: "Para quem nunca usou",
  },
  "sobre.titulo": {
    pagina: "sobre",
    rotulo: "Título da página",
    tipo: "texto",
    padrao: "O que é uma prótese capilar",
  },
  "sobre.intro": {
    pagina: "sobre",
    rotulo: "Frase de introdução",
    tipo: "paragrafo",
    padrao:
      "Um guia simples, sem termo técnico sem explicação, para entender do que a peça é feita e o que muda de uma base para outra.",
  },

  "sobre.oQueE.titulo": {
    pagina: "sobre",
    rotulo: "Seção \"O que é\" — título",
    tipo: "texto",
    padrao: "O que é",
  },
  "sobre.oQueE.texto": {
    pagina: "sobre",
    rotulo: "Seção \"O que é\" — texto",
    tipo: "paragrafo",
    padrao:
      "A prótese capilar é uma peça feita com fios aplicados a uma base que se fixa no couro cabeludo. A função da base é servir de suporte para os fios exatamente onde não há mais cabelo — por isso a aparência da base (mais discreta ou mais grossa, mais transparente ou mais opaca) importa tanto quanto os fios em si.",
  },

  "sobre.oQueEABase.titulo": {
    pagina: "sobre",
    rotulo: "Seção \"O que é a base\" — título",
    tipo: "texto",
    padrao: "O que é a base",
  },
  "sobre.oQueEABase.texto": {
    pagina: "sobre",
    rotulo: "Seção \"O que é a base\" — texto",
    tipo: "paragrafo",
    padrao:
      "A base é a membrana onde cada fio é fixado, um a um. É ela que fica em contato com o couro cabeludo e que dá o formato da peça. A espessura dessa membrana — medida em milímetros — é o principal número técnico que aparece quando se fala de prótese capilar.",
  },

  // AS TRÊS FOTOS DA SEÇÃO "O QUE É A BASE" (02/09/2026).
  //
  // Ficam logo depois do texto da seção porque é essa a ordem na página, e
  // o painel lista na ordem em que as chaves são declaradas aqui — quem
  // abrir /admin/textos vê o texto e as fotos dele juntos, não espalhados.
  //
  // Cada foto vem em par com a descrição dela. Ver o cabeçalho deste
  // arquivo para o porquê de a descrição ser editável junto.
  "sobre.fotosBase.foto1": {
    pagina: "sobre",
    rotulo: "Foto 1 da seção \"O que é a base\"",
    tipo: "imagem",
    padrao: "/media/base/base-com-fios.jpg",
  },
  "sobre.fotosBase.alt1": {
    pagina: "sobre",
    rotulo: "Foto 1 — descrição (leitor de tela e Google)",
    tipo: "texto",
    padrao: "Base de prótese capilar Reverá vista de cima, com os fios ao redor",
  },
  "sobre.fotosBase.foto2": {
    pagina: "sobre",
    rotulo: "Foto 2 da seção \"O que é a base\"",
    tipo: "imagem",
    padrao: "/media/base/base-vista-superior.jpg",
  },
  "sobre.fotosBase.alt2": {
    pagina: "sobre",
    rotulo: "Foto 2 — descrição (leitor de tela e Google)",
    tipo: "texto",
    padrao: "Close da base, mostrando a membrana onde cada fio é fixado",
  },
  "sobre.fotosBase.foto3": {
    pagina: "sobre",
    rotulo: "Foto 3 da seção \"O que é a base\"",
    tipo: "imagem",
    padrao: "/media/base/base-no-duplo.jpg",
  },
  "sobre.fotosBase.alt3": {
    pagina: "sobre",
    rotulo: "Foto 3 — descrição (leitor de tela e Google)",
    tipo: "texto",
    padrao: "Ilustração do nó duplo, o acabamento que dá mais durabilidade à peça",
  },

  "sobre.basesFinas.titulo": {
    pagina: "sobre",
    rotulo: "Seção \"Bases finas e grossas\" — título",
    tipo: "texto",
    padrao: "Bases mais finas e bases mais grossas",
  },
  "sobre.basesFinas.texto": {
    pagina: "sobre",
    rotulo: "Seção \"Bases finas e grossas\" — texto",
    tipo: "paragrafo",
    padrao:
      "De um jeito geral, quanto mais fina a base, mais discreta ela tende a ficar sobre a pele — é o que costuma se buscar na linha frontal, perto do rosto. Quanto mais grossa, mais resistente ao manuseio do dia a dia ela tende a ser. Essa troca (discrição de um lado, resistência do outro) é a lógica geral por trás da variedade de espessuras que existe no mercado de próteses capilares — não uma promessa sobre qualquer peça específica.",
  },

  // A CHAVE CONTINUA "medida008" DE PROPÓSITO (02/09/2026).
  //
  // O texto passou a falar de duas espessuras, então o nome "medida008"
  // ficou estreito — e renomear para "medida" seria a coisa natural a
  // fazer. Não foi feito, e o motivo está no cabeçalho de registro.ts: a
  // chave é o contrato entre o painel e a página. Renomeá-la faria QUALQUER
  // edição que o Francisco já tenha feito neste parágrafo sumir da tela sem
  // aviso — o texto voltaria ao original e ninguém entenderia por quê.
  //
  // Chave feia que funciona ganha de chave bonita que apaga trabalho dos
  // outros.
  "sobre.medida008.titulo": {
    pagina: "sobre",
    rotulo: "Seção \"O que significam 0,08mm e 0,06mm\" — título",
    tipo: "texto",
    padrao: "O que significam 0,08mm e 0,06mm",
  },
  "sobre.medida008.texto": {
    pagina: "sobre",
    rotulo: "Seção \"O que significam 0,08mm e 0,06mm\" — texto",
    tipo: "paragrafo",
    // CORREÇÃO DE FATO, não de estilo (02/09/2026, pedido do Francisco).
    //
    // A versão anterior dizia "Micropele 0,08mm — a base mais fina da
    // linha". Isso deixou de ser verdade quando a 0,06mm entrou no
    // catálogo (ela já aparece em src/app/produtos/page.tsx). O site
    // estava afirmando, na página que existe justamente para EXPLICAR
    // espessura, que a mais grossa das duas era a mais fina.
    //
    // Quem for mexer aqui de novo: o número menor é o mais fino. Se um dia
    // entrar uma 0,05mm, esta frase precisa mudar junto — e a resposta da
    // FAQ em seeds/faq.json e o título em home.ts também, que dizem a
    // mesma coisa em outras palavras.
    padrao:
      "É a medida da espessura da base, em milímetros. Quanto menor o número, mais fina a membrana. A Reverá trabalha a linha Micropele em duas espessuras: a 0,08mm, com acabamento natural na linha frontal, e a 0,06mm — a mais fina da linha.",
  },

  "sobre.grisalhos.titulo": {
    pagina: "sobre",
    rotulo: "Seção \"Cabelos grisalhos\" — título",
    tipo: "texto",
    padrao: "Cabelos grisalhos",
  },
  "sobre.grisalhos.texto": {
    pagina: "sobre",
    rotulo: "Seção \"Cabelos grisalhos\" — texto",
    tipo: "paragrafo",
    padrao:
      "Próteses grisalhas de até 50% possuem fios sintéticos, para permitir o processo de tonalização sem alterar os fios brancos.",
  },

  // SEÇÃO "COMO ESCOLHER" APOSENTADA EM 02/09/2026 (pedido do Francisco:
  // "o texto como escolher pode ser tirado o titulo e o texto inteiro").
  //
  // Eram cinco chaves — titulo, texto1, link1, texto2, link2 — e sumiram
  // daqui junto com o bloco correspondente em
  // src/app/sobre-as-proteses/page.tsx. Ficam registradas por nome aqui
  // porque o cabeçalho de registro.ts manda: "Para APOSENTAR um texto,
  // tire a entrada daqui e apague a linha do banco."
  //
  // A SEGUNDA METADE DISSO É MANUAL, e é a única parte que não dá para
  // fazer pelo código: se alguém já tinha editado uma dessas cinco no
  // painel, a linha continua em `site_texts` sem dono — invisível no
  // painel (que lista o REGISTRO, não a tabela) e ignorada pela página.
  // Não quebra nada; só ocupa espaço. A limpeza está em
  // supabase/aplicar/PAINEL-DE-CONTEUDO.sql, no fim do arquivo.
  //
  // O que os dois links levavam continua no ar e alcançável: /cores está
  // no menu do site e /naturalidade também. Nada ficou órfão de navegação.

} as const satisfies Record<string, TextoRegistrado>;
