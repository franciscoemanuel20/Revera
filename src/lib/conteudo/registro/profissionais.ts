import type { TextoRegistrado } from "../registro";

/**
 * /para-profissionais — a única página deste lote com formulário. O
 * `ProfessionalLeadForm` é "use client" (estado do formulário), então ele
 * não pode chamar `textosDaPagina` — quem lê o registro é sempre a página
 * server, que repassa os textos prontos por props (ver page.tsx e o
 * comentário em ProfessionalLeadForm.tsx). Os rótulos e dicas de cada
 * campo entram aqui pelo mesmo motivo dos títulos: são texto que hoje está
 * escrito no componente, não regra de validação — trocar "Opcional." não
 * muda se o campo é obrigatório, isso continua sendo o `required` do
 * input, que este registro não toca.
 */
export const PROFISSIONAIS = {
  "profissionais.eyebrow": {
    pagina: "profissionais",
    rotulo: "Etiqueta acima do título",
    tipo: "texto",
    padrao: "Barbeiros e profissionais",
  },
  "profissionais.titulo": {
    pagina: "profissionais",
    rotulo: "Título da página",
    tipo: "texto",
    padrao: "Para profissionais",
  },
  "profissionais.intro": {
    pagina: "profissionais",
    rotulo: "Frase de introdução",
    tipo: "paragrafo",
    padrao:
      "A Reverá atende profissionais que trabalham com prótese capilar, incluindo interesse em compra por quantidade.",
  },

  "profissionais.comoFunciona.titulo": {
    pagina: "profissionais",
    rotulo: "Seção \"Como funciona\" — título",
    tipo: "texto",
    padrao: "Como funciona",
  },
  "profissionais.comoFunciona.texto": {
    pagina: "profissionais",
    rotulo: "Seção \"Como funciona\" — texto",
    tipo: "paragrafo",
    padrao:
      "Deixe seus dados abaixo e conte um pouco sobre o seu volume de trabalho. Nossa equipe entra em contato para apresentar as condições — preço, prazo e forma de compra por quantidade são tratados diretamente nessa conversa, e não há valor fixo publicado aqui.",
  },

  "profissionais.cadastro.titulo": {
    pagina: "profissionais",
    rotulo: "Título acima do formulário",
    tipo: "texto",
    padrao: "Cadastro",
  },

  "profissionais.campo.nome.rotulo": {
    pagina: "profissionais",
    rotulo: "Formulário — rótulo do campo Nome",
    tipo: "texto",
    padrao: "Nome",
  },
  "profissionais.campo.telefone.rotulo": {
    pagina: "profissionais",
    rotulo: "Formulário — rótulo do campo Telefone",
    tipo: "texto",
    padrao: "Telefone",
  },
  "profissionais.campo.telefone.dica": {
    pagina: "profissionais",
    rotulo: "Formulário — dica do campo Telefone",
    tipo: "texto",
    padrao: "Com DDD.",
  },
  "profissionais.campo.email.rotulo": {
    pagina: "profissionais",
    rotulo: "Formulário — rótulo do campo E-mail",
    tipo: "texto",
    padrao: "E-mail",
  },
  "profissionais.campo.email.dica": {
    pagina: "profissionais",
    rotulo: "Formulário — dica do campo E-mail",
    tipo: "texto",
    padrao: "Opcional.",
  },
  "profissionais.campo.empresa.rotulo": {
    pagina: "profissionais",
    rotulo: "Formulário — rótulo do campo Nome do salão ou barbearia",
    tipo: "texto",
    padrao: "Nome do salão ou barbearia",
  },
  "profissionais.campo.empresa.dica": {
    pagina: "profissionais",
    rotulo: "Formulário — dica do campo Nome do salão ou barbearia",
    tipo: "texto",
    padrao: "Opcional.",
  },
  "profissionais.campo.cidade.rotulo": {
    pagina: "profissionais",
    rotulo: "Formulário — rótulo do campo Cidade",
    tipo: "texto",
    padrao: "Cidade",
  },
  "profissionais.campo.cidade.dica": {
    pagina: "profissionais",
    rotulo: "Formulário — dica do campo Cidade",
    tipo: "texto",
    padrao: "Opcional.",
  },
  "profissionais.campo.mensagem.rotulo": {
    pagina: "profissionais",
    rotulo: "Formulário — rótulo do campo Mensagem",
    tipo: "texto",
    padrao: "Mensagem",
  },
  "profissionais.campo.mensagem.dica": {
    pagina: "profissionais",
    rotulo: "Formulário — dica do campo Mensagem",
    tipo: "texto",
    padrao: "Conte um pouco sobre o volume que você trabalha. Opcional.",
  },

  "profissionais.botao.enviar": {
    pagina: "profissionais",
    rotulo: "Formulário — rótulo do botão de enviar",
    tipo: "texto",
    padrao: "Quero ser contatado",
  },
  /*
   * 03/09/2026 — depois de enviar o cadastro, a tela passa a MOSTRAR o
   * WhatsApp em vez de só mandar a pessoa para lá. A conversa abre sozinha
   * numa aba nova, mas aba nova é justamente o que o navegador bloqueia
   * calado: sem estes textos, quem tinha bloqueador ficava olhando uma
   * confirmação e nenhum caminho.
   */
  "profissionais.whatsapp.botao": {
    pagina: "profissionais",
    rotulo: "Depois de enviar — rótulo do botão de WhatsApp",
    tipo: "texto",
    padrao: "Falar no WhatsApp agora",
  },
  "profissionais.whatsapp.dica": {
    pagina: "profissionais",
    rotulo: "Depois de enviar — frase acima do botão de WhatsApp",
    tipo: "paragrafo",
    padrao:
      "A conversa abre numa aba nova. Se não abrir, toque no botão — ou chame direto no número abaixo.",
  },
  "profissionais.whatsapp.telefoneRotulo": {
    pagina: "profissionais",
    rotulo: "Depois de enviar — rótulo antes do número escrito",
    tipo: "texto",
    padrao: "WhatsApp",
  },

  "profissionais.mensagemSucesso": {
    pagina: "profissionais",
    rotulo: "Formulário — mensagem depois de enviar",
    tipo: "paragrafo",
    padrao:
      "Recebemos seu contato. Nossa equipe entra em contato para apresentar as condições.",
  },
} as const satisfies Record<string, TextoRegistrado>;
