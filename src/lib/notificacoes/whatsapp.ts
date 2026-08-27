/**
 * Envio de WhatsApp pela API OFICIAL (Meta Cloud API).
 *
 * ===========================================================================
 * POR QUE NÃO É "SÓ MANDAR UMA MENSAGEM" (27/08/2026)
 * ===========================================================================
 * A API oficial não deixa mandar texto livre para quem quiser. Fora de uma
 * janela de 24h de conversa iniciada pela outra pessoa, só sai mensagem por
 * TEMPLATE previamente aprovado pela Meta — e a aprovação leva de horas a
 * dias. Um aviso de venda nova é exatamente o caso: ninguém "conversou"
 * antes, é o sistema chamando do nada.
 *
 * Por isso este módulo tem três modos, e nasce no primeiro:
 *
 *   desligado  — não manda nada. É o padrão, e é o estado de hoje: o
 *                template ainda não existe. O pedido continua sendo
 *                confirmado normalmente; o painel continua mostrando tudo.
 *   simulado   — grava a mensagem no log do servidor em vez de enviar.
 *                Serve para provar o fluxo inteiro (inclusive a trava de
 *                não duplicar) sem template, sem número e sem gastar.
 *   meta       — envia de verdade pela Cloud API.
 *
 * ===========================================================================
 * AUSÊNCIA DE CONFIGURAÇÃO NÃO DERRUBA VENDA
 * ===========================================================================
 * O resto do projeto falha fechado: pagamento sem PAYMENT_PROVIDER lança,
 * frete sem SUPERFRETE_SANDBOX lança. Aqui é o contrário, de propósito.
 *
 * Este aviso roda DENTRO da confirmação de pagamento. Se a falta de uma
 * variável do WhatsApp lançasse, ela derrubaria a confirmação de uma venda
 * que já foi paga — trocaria um aviso não entregue por dinheiro recebido sem
 * pedido registrado. Deixar de avisar é recuperável (o pedido está no
 * painel); perder a confirmação não é.
 */

export type ModoWhatsApp = "desligado" | "simulado" | "meta";

export interface MensagemWhatsApp {
  /** Só dígitos, com DDI. Ex.: 5512981409901 */
  para: string;
  /** Texto já montado — usado no modo simulado e como corpo do template. */
  texto: string;
  /** Parâmetros na ordem em que o template os espera. */
  parametros: string[];
}

export type ResultadoEnvio =
  | { estado: "enviado"; providerMessageId: string | null }
  | { estado: "desligado" }
  | { estado: "erro"; motivo: string };

export function modoWhatsApp(): ModoWhatsApp {
  const bruto = (process.env.WHATSAPP_PROVIDER ?? "").trim().toLowerCase();
  if (bruto === "meta") return "meta";
  if (bruto === "simulado") return "simulado";
  return "desligado";
}

/**
 * Nunca ecoa o valor da variável em erro nem em log: WHATSAPP_TOKEN é um
 * token de acesso da Meta e já houve, neste projeto, uma variável de
 * ambiente com um token colado dentro por engano (ver o P0-4 da SuperFrete).
 * Mensagem de erro que imprime "valor recebido" acaba num log compartilhado.
 */
function exigir(nome: string): string {
  const valor = (process.env[nome] ?? "").trim();
  if (!valor) {
    throw new Error(
      `${nome} não definida. Necessária quando WHATSAPP_PROVIDER=meta. ` +
        "Defina-a no servidor (nunca com prefixo NEXT_PUBLIC_)."
    );
  }
  return valor;
}

export async function enviarWhatsApp(mensagem: MensagemWhatsApp): Promise<ResultadoEnvio> {
  const modo = modoWhatsApp();

  if (modo === "desligado") {
    return { estado: "desligado" };
  }

  if (modo === "simulado") {
    // Uma linha só, marcada, para achar no log da Vercel. O texto já vem
    // sem endereço e sem dado sensível — ver montarAvisoVendaPaga().
    console.info(
      `[whatsapp:simulado] para=${mascarar(mensagem.para)} :: ${mensagem.texto.replace(/\n/g, " | ")}`
    );
    return { estado: "enviado", providerMessageId: null };
  }

  try {
    const phoneNumberId = exigir("WHATSAPP_PHONE_NUMBER_ID");
    const token = exigir("WHATSAPP_TOKEN");
    const template = exigir("WHATSAPP_TEMPLATE_NOME");
    const idioma = (process.env.WHATSAPP_TEMPLATE_IDIOMA ?? "pt_BR").trim();

    const resposta = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: mensagem.para,
          type: "template",
          template: {
            name: template,
            language: { code: idioma },
            components: [
              {
                type: "body",
                parameters: mensagem.parametros.map((text) => ({ type: "text", text })),
              },
            ],
          },
        }),
      }
    );

    const corpo = (await resposta.json().catch(() => null)) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    } | null;

    if (!resposta.ok) {
      // A mensagem de erro da Meta é segura de guardar (não contém o token),
      // e é ela que diz se o template foi reprovado, se o número não está
      // registrado, ou se a janela expirou. Sem ela, diagnosticar é chute.
      const motivo = corpo?.error?.message ?? `HTTP ${resposta.status}`;
      return { estado: "erro", motivo: `Meta recusou: ${motivo}` };
    }

    return { estado: "enviado", providerMessageId: corpo?.messages?.[0]?.id ?? null };
  } catch (erro) {
    return {
      estado: "erro",
      motivo: erro instanceof Error ? erro.message : "falha desconhecida ao chamar a Meta",
    };
  }
}

/** 5512981409901 -> 5512****9901. Para log, nunca para a mensagem. */
function mascarar(numero: string): string {
  if (numero.length < 8) return "***";
  return `${numero.slice(0, 4)}****${numero.slice(-4)}`;
}
