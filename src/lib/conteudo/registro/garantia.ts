import type { TextoRegistrado } from "../registro";

/**
 * /garantia — a página mais delicada de tornar editável, por dois motivos
 * que não são técnicos.
 *
 * ===========================================================================
 * FRASE COM NEGRITO NO MEIO VIRA TRÊS CAMPOS
 * ===========================================================================
 * "Você tem **7 dias úteis** a partir do recebimento" não cabe num campo só
 * sem uma das duas perdas: ou o negrito some, ou o Francisco teria que
 * escrever marcação (`**`, `<strong>`) numa caixa de texto — e aí um
 * asterisco perdido publica marcação crua na página.
 *
 * Então a frase vira três campos com rótulo explícito: início, destaque,
 * final. É mais campo na tela, e é o preço de manter o desenho intacto
 * enquanto qualquer pessoa edita.
 *
 * Os NÚMEROS dourados da lista (1 a 5) não entram: eles são desenho, ficam
 * em elemento próprio no JSX e não são texto que alguém queira reescrever.
 *
 * ===========================================================================
 * O QUE NÃO É EDITÁVEL AQUI, E POR QUÊ
 * ===========================================================================
 * Os prazos ("7 dias úteis", "7 dias") ficam editáveis porque são texto de
 * página — mas são também COMPROMISSO COM O CLIENTE, e o cabeçalho da página
 * registra que a política ainda não passou por advogado. Trocar esses
 * números pelo painel muda o que a Reverá promete. Quem for mexer precisa
 * saber disso, e é por isso que o rótulo deles diz "prazo prometido" em vez
 * de "texto".
 *
 * O destino do link para /cuidados NÃO entra no registro: só o rótulo
 * visível. Endereço editável em caixa de texto é link quebrado esperando
 * acontecer.
 */
export const GARANTIA = {
  "garantia.eyebrow": {
    pagina: "garantia",
    rotulo: "Etiqueta acima do título",
    tipo: "texto",
    padrao: "Pós-venda",
  },
  "garantia.titulo": {
    pagina: "garantia",
    rotulo: "Título da página",
    tipo: "texto",
    padrao: "Garantia",
  },
  "garantia.intro": {
    pagina: "garantia",
    rotulo: "Parágrafo de abertura",
    tipo: "paragrafo",
    padrao:
      "Antes do envio, toda prótese passa por um teste de qualidade. Ainda assim, o teste que decide é o seu, e ele é feito no minuto em que a peça chega — antes de cortar, antes de moldar, antes de colar.",
  },

  "garantia.teste.titulo": {
    pagina: "garantia",
    rotulo: "Título da seção do teste",
    tipo: "texto",
    padrao: "O teste dos fios",
  },
  "garantia.passo1": {
    pagina: "garantia",
    rotulo: "Passo 1 do teste",
    tipo: "paragrafo",
    padrao:
      "Coloque um pano claro embaixo da peça, para enxergar qualquer fio que soltar.",
  },
  "garantia.passo2": {
    pagina: "garantia",
    rotulo: "Passo 2 do teste",
    tipo: "paragrafo",
    padrao: "Passe a mão sobre os fios, com suavidade. Sem puxar, sem apertar.",
  },
  "garantia.passo3": {
    pagina: "garantia",
    rotulo: "Passo 3 do teste",
    tipo: "paragrafo",
    padrao:
      "É normal soltar alguns fios logo no começo — são fios que ficaram soltos da confecção e não estavam presos na base.",
  },
  "garantia.passo4": {
    pagina: "garantia",
    rotulo: "Passo 4 do teste",
    tipo: "paragrafo",
    padrao:
      "Continue por cerca de um minuto. Depois disso, passe a mão de novo e olhe o pano: a queda deve ter parado.",
  },
  "garantia.passo5.antes": {
    pagina: "garantia",
    rotulo: "Passo 5 — início da frase",
    tipo: "texto",
    padrao: "Se ainda estiver caindo fio depois desse minuto,",
  },
  "garantia.passo5.destaque": {
    pagina: "garantia",
    rotulo: "Passo 5 — trecho em negrito",
    tipo: "texto",
    padrao: "pare por aí",
  },
  "garantia.passo5.depois": {
    pagina: "garantia",
    rotulo: "Passo 5 — final da frase",
    tipo: "paragrafo",
    padrao:
      ". Não corte, não modele, não cole. Fale com a gente com a peça do jeito que chegou.",
  },

  "garantia.troca.titulo": {
    pagina: "garantia",
    rotulo: "Título da seção de troca",
    tipo: "texto",
    padrao: "Até quando dá para trocar",
  },
  "garantia.troca.p1": {
    pagina: "garantia",
    rotulo: "Troca — primeiro parágrafo",
    tipo: "paragrafo",
    padrao:
      "Enquanto a peça está como chegou — sem corte, sem modelagem e sem cola —, ela pode ser devolvida e trocada por outra.",
  },
  "garantia.troca.p2": {
    pagina: "garantia",
    rotulo: "Troca — segundo parágrafo",
    tipo: "paragrafo",
    padrao:
      "Depois de cortada, moldada e colada na cabeça, a prótese não volta ao estado em que foi enviada: ela foi ajustada para uma pessoa só. A partir daí não há mais devolução nem troca por queda de fio, e é por isso que o teste acima é responsabilidade sua e vem antes de qualquer outra coisa.",
  },
  "garantia.troca.aviso": {
    pagina: "garantia",
    rotulo: "Troca — frase na caixa dourada",
    tipo: "paragrafo",
    padrao:
      "Um minuto passando a mão nos fios, antes da tesoura, é o que separa uma troca simples de uma peça que não tem mais como voltar.",
  },

  "garantia.prazos.titulo": {
    pagina: "garantia",
    rotulo: "Título da seção de prazos",
    tipo: "texto",
    padrao: "Prazos",
  },
  "garantia.prazos.defeito.antes": {
    pagina: "garantia",
    rotulo: "Defeito de fabricação — início da frase",
    tipo: "texto",
    padrao: "Você tem",
  },
  "garantia.prazos.defeito.prazo": {
    pagina: "garantia",
    rotulo: "PRAZO PROMETIDO para avisar defeito (em negrito)",
    tipo: "texto",
    padrao: "7 dias úteis",
  },
  "garantia.prazos.defeito.depois": {
    pagina: "garantia",
    rotulo: "Defeito de fabricação — final da frase",
    tipo: "paragrafo",
    padrao:
      "a partir do recebimento para comunicar defeito de fabricação — e é justamente o teste dos fios que revela isso logo no primeiro dia.",
  },
  "garantia.prazos.desistir.antes": {
    pagina: "garantia",
    rotulo: "Desistência — início da frase",
    tipo: "texto",
    padrao: "Mudou de ideia? Dá para desistir da compra em até",
  },
  "garantia.prazos.desistir.prazo": {
    pagina: "garantia",
    rotulo: "PRAZO PROMETIDO para desistir da compra (em negrito)",
    tipo: "texto",
    padrao: "7 dias",
  },
  "garantia.prazos.desistir.depois": {
    pagina: "garantia",
    rotulo: "Desistência — final da frase",
    tipo: "paragrafo",
    padrao:
      "do recebimento, com a peça sem uso e sem alteração — é só falar com a gente.",
  },
  "garantia.prazos.cuidados.antes": {
    pagina: "garantia",
    rotulo: "Frase final, antes do link",
    tipo: "paragrafo",
    padrao:
      "A durabilidade depois disso depende dos cuidados do dia a dia — o que usar, como lavar e o que evitar está em",
  },
  "garantia.prazos.cuidados.link": {
    pagina: "garantia",
    rotulo: "Texto do link para a página de cuidados",
    tipo: "texto",
    padrao: "Cuidados",
  },
} as const satisfies Record<string, TextoRegistrado>;
