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

import { createAdminClient } from "@/lib/supabase/server";
import { WHATSAPP_REVERA } from "@/lib/config/whatsapp";
import { enviarWhatsApp, modoWhatsApp } from "./whatsapp";
import { destinoDoAviso } from "./venda-paga";

export type OrigemDoContato = "profissional" | "ajuda_cor";

export type ResultadoAvisoContato =
  | { estado: "enviado" }
  | { estado: "desligado" }
  | { estado: "sem_template" }
  | { estado: "teto_por_hora" }
  | { estado: "erro"; motivo: string };

/**
 * Teto de avisos por hora, somando os DOIS formulários.
 *
 * ===========================================================================
 * POR QUE EXISTE (achado P1 do Codex, 05/09/2026)
 * ===========================================================================
 * Estes formulários são públicos e sem autenticação. Cada envio válido dispara
 * uma mensagem paga. Sem teto, um script rodando contra `/para-profissionais`
 * esvazia o saldo da Clint — a R$ 0,53 por peça de marketing, os R$ 257
 * recarregados em 05/09 viram ~485 envios, minutos de abuso.
 *
 * O cron do carrinho abandonado já tinha teto; este caminho não tinha, e é o
 * mais exposto dos dois: lá o gatilho é nosso, aqui é de quem visita o site.
 *
 * O teto é COMPARTILHADO entre lead profissional e ajuda de cor de propósito:
 * quem estiver abusando alterna entre os dois formulários, e dois tetos
 * separados dobrariam o estrago.
 *
 * Passado o teto, o lead CONTINUA sendo gravado — só o aviso não sai. Perder
 * o aviso é recuperável (está no painel); perder o lead não.
 */
export const MAX_AVISOS_POR_HORA_PADRAO = 10;

/**
 * Quanto tempo o formulário espera pelo aviso antes de desistir dele.
 *
 * Achado do Codex em 05/09/2026: este caminho roda DENTRO da Server Action do
 * formulário. O lead já está gravado quando o aviso é tentado; se a Clint
 * pendurar, a action bate no limite de execução da Vercel e o visitante vê
 * falha num envio que deu certo — e o `catch` não salva, porque o processo é
 * encerrado por fora.
 *
 * Seis segundos deixam folga confortável dentro do limite padrão e são mais
 * que suficientes para três chamadas normais à Clint. Estourando, o lead
 * continua no painel: perde-se o aviso, nunca o lead.
 */
const TEMPO_MAXIMO_MS = 6000;

function tetoPorHora(): number {
  const n = Number.parseInt((process.env.CONTATO_MAX_AVISOS_POR_HORA ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : MAX_AVISOS_POR_HORA_PADRAO;
}

/**
 * Conta os contatos da última hora nas duas tabelas.
 *
 * Conta os PRÓPRIOS leads, e não os avisos, porque não existe tabela de
 * avisos para lead — e criar uma exigiria migration em produção para uma
 * defesa que precisa existir agora. Cada lead gravado equivale a um aviso
 * tentado, então a contagem é o mesmo número pelo caminho mais curto.
 *
 * Na dúvida (erro de banco), devolve o teto: falha fechada, sem enviar. Um
 * aviso perdido é recuperável; um saldo drenado por abuso, não.
 */
async function contatosNaUltimaHora(): Promise<number> {
  const desde = new Date(Date.now() - 3600_000).toISOString();
  try {
    const supabase = createAdminClient();
    const [profissionais, cores] = await Promise.all([
      supabase
        .from("professional_leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", desde),
      supabase
        .from("color_help_requests")
        .select("id", { count: "exact", head: true })
        .gte("created_at", desde),
    ]);
    if (profissionais.error || cores.error) return Number.POSITIVE_INFINITY;
    return (profissionais.count ?? 0) + (cores.count ?? 0);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

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

    // O modo `meta` não serve aqui pelo mesmo motivo do carrinho abandonado:
    // no caminho da Cloud API, `enviarWhatsApp` ignora `mensagem.template` e
    // usa `WHATSAPP_TEMPLATE_NOME` — o aviso de venda paga, com sete
    // parâmetros, contra os zero que este fluxo manda. Achado do Codex em
    // 05/09/2026. Sai quando existir template Meta próprio.
    if (modo === "meta") return { estado: "sem_template" };

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

    const teto = tetoPorHora();
    const naHora = await contatosNaUltimaHora();
    // `>` e não `>=`: o lead que dispara esta chamada já está gravado, então
    // ele mesmo está na contagem. Com teto 10, o décimo ainda avisa.
    if (naHora > teto) {
      console.warn(`[aviso-contato] teto de ${teto}/h atingido (${naHora}) — ${origem} gravado, aviso não enviado`);
      return { estado: "teto_por_hora" };
    }

    const destino = destinoDoAviso(process.env.WHATSAPP_DESTINO) || WHATSAPP_REVERA;
    const envio = await enviarWhatsApp({
      para: destino,
      texto: TEXTO[origem],
      parametros: [],
      template,
      sinal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
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
