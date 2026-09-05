/**
 * "Alguém deixou contato" — o aviso de lead novo no WhatsApp da equipe.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE (05/09/2026)
 * ===========================================================================
 * Até hoje a Reverá gravava e não avisava. O formulário de
 * /para-profissionais e o pedido de ajuda de cor caíam em tabelas com RLS
 * fechada, visíveis só para quem abrisse o painel de propósito — e ninguém
 * abre um painel que nunca teve novidade. O lead ficava lá.
 *
 * O aviso de venda paga (venda-paga.ts) já existia e resolve outro momento:
 * dinheiro que entrou. Aqui é o contrário — alguém levantou a mão e ainda
 * não comprou nada. É o caso em que demorar custa a venda inteira.
 *
 * ===========================================================================
 * POR QUE NÃO TEM RESERVA NO BANCO, AO CONTRÁRIO DA VENDA PAGA
 * ===========================================================================
 * Lá a reserva por `unique (order_id, kind)` existe porque a InfinitePay
 * REENVIA webhook e a página de obrigado confirma em paralelo: a mesma venda
 * chega duas vezes por caminhos diferentes. Aqui não há reentrega — o único
 * caminho é a Server Action, chamada uma vez por formulário enviado. Dois
 * envios só acontecem se a pessoa preencher duas vezes, e aí são dois
 * pedidos de contato de verdade, que a equipe deve mesmo ver.
 *
 * Guardar uma tabela de reserva para isso custaria uma migration em
 * produção e não compraria nada.
 *
 * ===========================================================================
 * NÃO DERRUBA O FORMULÁRIO
 * ===========================================================================
 * Mesma regra do aviso de venda: quem chama já gravou o lead. Se o WhatsApp
 * falhar, o lead continua no banco e no painel. Esta função NUNCA lança — um
 * template recusado não pode virar "não foi possível enviar seu contato"
 * para quem preencheu tudo certo.
 */

import { WHATSAPP_REVERA } from "@/lib/config/whatsapp";
import { enviarWhatsApp, modoWhatsApp } from "./whatsapp";
import { destinoDoAviso } from "./venda-paga";

export type OrigemDoContato = "profissional" | "ajuda_cor";

export type ResultadoAvisoContato =
  | { estado: "enviado" }
  | { estado: "desligado" }
  | { estado: "sem_template" }
  | { estado: "erro"; motivo: string };

const TEXTO: Record<OrigemDoContato, string> = {
  profissional: "Novo contato de profissional no site da Reverá. Abra o painel para ver.",
  ajuda_cor: "Novo pedido de ajuda para escolher a cor. Abra o painel para ver.",
};

/**
 * O template é FIXO e sem variável, como o da venda paga: o nome de quem
 * preencheu NÃO vai na mensagem.
 *
 * Duas razões, e a segunda é a que decide. A primeira é a do venda-paga.ts:
 * WhatsApp vaza fácil (notificação na tela de bloqueio, encaminhável com dois
 * toques) e o painel já tem tudo atrás de login. A segunda é operacional:
 * mapear variável na Clint é o passo que mais quebrou neste projeto — cada
 * erro de contagem vira envio recusado em silêncio, e um aviso que falha
 * calado é exatamente o problema que este arquivo veio consertar.
 *
 * Por isso o texto acima só existe para o modo `simulado` (log) e para
 * leitura humana daqui: no modo `clint` ele não é enviado.
 */
function templateDoContato(): string {
  return (process.env.CLINT_TEMPLATE_CONTATO_ID ?? "").trim();
}

export async function avisarNovoContato(
  origem: OrigemDoContato
): Promise<ResultadoAvisoContato> {
  try {
    const modo = modoWhatsApp();
    if (modo === "desligado") return { estado: "desligado" };

    // No modo `clint` o template precisa existir ANTES de tentar: sem ele,
    // `enviarPelaClint` cairia no template da venda paga e a equipe leria
    // "nova venda" por causa de um lead. Melhor não mandar nada.
    const template = templateDoContato();
    if (modo === "clint" && !template) {
      console.warn(
        `[aviso-contato] CLINT_TEMPLATE_CONTATO_ID não definida — ${origem} gravado, ninguém avisado`
      );
      return { estado: "sem_template" };
    }

    const destino = destinoDoAviso(process.env.WHATSAPP_DESTINO) || WHATSAPP_REVERA;
    const envio = await enviarWhatsApp({
      para: destino,
      texto: TEXTO[origem],
      parametros: [],
      template,
    });

    if (envio.estado === "erro") {
      console.error(`[aviso-contato] ${origem} não avisado: ${envio.motivo}`);
      return { estado: "erro", motivo: envio.motivo };
    }
    if (envio.estado === "desligado") return { estado: "desligado" };
    return { estado: "enviado" };
  } catch (erro) {
    console.error("[aviso-contato] exceção", erro);
    return {
      estado: "erro",
      motivo: erro instanceof Error ? erro.message : "falha desconhecida ao avisar",
    };
  }
}
