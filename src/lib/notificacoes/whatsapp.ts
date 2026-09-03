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

import { descricaoDoAmbiente, podeUsarServicosReais } from "@/lib/config/ambiente";

/**
 * ===========================================================================
 * O QUARTO MODO: `clint` (03/09/2026)
 * ===========================================================================
 * O modo `meta` exige um número NOSSO na Cloud API. Não temos: o número
 * oficial (+55 11 91032-0991) está sob a Clint como BSP, e app próprio leva
 * `(#200)` ao tentar mandar por ele. O que funciona — provado no app da
 * prótese em 02/09/2026 — é a API da própria Clint: `POST
 * /v2/messages/template`, que acha ou CRIA a conversa e manda o template.
 *
 * Neste modo o template é FIXO, sem variável: o aviso diz "nova venda, abra
 * o painel" e os detalhes ficam no painel. Mapear sete variáveis na Clint
 * é frágil e cada erro de contagem é envio recusado em silêncio. Por isso
 * `mensagem.parametros` é ignorado aqui, de propósito.
 *
 * Variáveis: CLINT_API_TOKEN, CLINT_CANAL_ID (channel_account_id do canal
 * que envia) e CLINT_TEMPLATE_ID (UUID do template APROVADO naquele canal).
 * O destino continua sendo WHATSAPP_DESTINO.
 */
export type ModoWhatsApp = "desligado" | "simulado" | "meta" | "clint";

export interface MensagemWhatsApp {
  /** Só dígitos, com DDI. Ex.: 5511976543210 */
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

  if (bruto === "meta" || bruto === "clint") {
    /**
     * Envio real SÓ em produção, mesmo com a variável pedindo `meta`.
     *
     * A situação que isto previne é banal e provável: alguém copia o bloco
     * de variáveis da produção para o staging para "deixar igual". A partir
     * daí todo pedido de teste manda mensagem no telefone de verdade da
     * Reverá — e as mensagens de template são cobradas.
     *
     * Cai para `simulado`, e não para `desligado`, porque em staging o
     * objetivo é justamente exercitar o fluxo: a mensagem é montada,
     * registrada no log e a trava de "avisar uma vez só" continua sendo
     * exercida. Só não sai do servidor.
     */
    if (!podeUsarServicosReais()) {
      console.warn(
        `[whatsapp] WHATSAPP_PROVIDER=meta recusado fora de produção — ` +
          `usando modo simulado. ${descricaoDoAmbiente()}`
      );
      return "simulado";
    }
    return bruto;
  }

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

  if (modo === "clint") {
    return enviarPelaClint(mensagem);
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

/** 5511976543210 -> 5511****3210. Para log, nunca para a mensagem. */
function mascarar(numero: string): string {
  if (numero.length < 8) return "***";
  return `${numero.slice(0, 4)}****${numero.slice(-4)}`;
}

const CLINT_BASE = "https://api.clint.digital";

/**
 * Acha o contato do destino na Clint pelo telefone, ou cria. A Clint só
 * envia template para `contact_id`, nunca para número cru. A busca compara
 * os 8 últimos dígitos porque a Clint devolve o telefone em formatos
 * diferentes conforme o cadastro (com DDI, sem DDI, com máscara).
 */
async function contatoNaClint(
  token: string,
  telefone: string
): Promise<{ id: string } | { erro: string }> {
  const so = telefone.replace(/\D/g, "");
  for (const q of [`phone=${encodeURIComponent(so)}`, `search=${encodeURIComponent(so)}`]) {
    try {
      const busca = await fetch(`${CLINT_BASE}/v1/contacts?${q}&limit=5`, {
        headers: { "api-token": token, accept: "application/json" },
        cache: "no-store",
      });
      if (!busca.ok) continue;
      const lista = (await busca.json().catch(() => null)) as unknown;
      const itens: Array<{ id?: string; phone?: unknown; telefone?: unknown }> = Array.isArray(
        lista
      )
        ? lista
        : ((lista as { data?: unknown[] } | null)?.data as never[]) ?? [];
      const achado = itens.find((c) =>
        JSON.stringify(c?.phone ?? c?.telefone ?? "")
          .replace(/\D/g, "")
          .endsWith(so.slice(-8))
      );
      if (achado?.id) return { id: achado.id };
    } catch {
      continue;
    }
  }
  try {
    const criado = await fetch(`${CLINT_BASE}/v1/contacts`, {
      method: "POST",
      headers: { "api-token": token, "content-type": "application/json" },
      body: JSON.stringify({ name: "Equipe Reverá", phone: so }),
    });
    const corpo = (await criado.json().catch(() => ({}))) as {
      id?: string;
      data?: { id?: string };
    };
    const id = corpo?.data?.id ?? corpo?.id;
    if (!criado.ok || !id) {
      return { erro: `Clint não criou o contato (HTTP ${criado.status})` };
    }
    return { id };
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : "erro de rede ao criar contato na Clint",
    };
  }
}

async function enviarPelaClint(mensagem: MensagemWhatsApp): Promise<ResultadoEnvio> {
  try {
    const token = exigir("CLINT_API_TOKEN");
    const canalId = exigir("CLINT_CANAL_ID");
    const templateId = exigir("CLINT_TEMPLATE_ID");

    const contato = await contatoNaClint(token, mensagem.para);
    if ("erro" in contato) {
      return { estado: "erro", motivo: `Clint: ${contato.erro}` };
    }

    // Sem `chat_id`: a Clint acha ou cria a conversa. Sem `parameters`: o
    // template deste modo é fixo (ver o cabeçalho do arquivo).
    const resposta = await fetch(`${CLINT_BASE}/v2/messages/template`, {
      method: "POST",
      headers: { "api-token": token, "content-type": "application/json" },
      body: JSON.stringify({
        channel_account_id: canalId,
        contact_id: contato.id,
        template_id: templateId,
      }),
    });
    const corpo = (await resposta.json().catch(() => null)) as {
      id?: string;
      data?: { id?: string };
      message?: string;
      error?: string | { message?: string };
    } | null;

    if (!resposta.ok) {
      const erro = corpo?.error;
      const motivo =
        (typeof erro === "string" ? erro : erro?.message) ??
        corpo?.message ??
        `HTTP ${resposta.status}`;
      // A resposta da Clint não carrega o token; guardar o motivo é seguro
      // e é o que diz se o template sumiu, foi reprovado ou o canal caiu.
      return { estado: "erro", motivo: `Clint recusou: ${motivo}` };
    }

    return { estado: "enviado", providerMessageId: corpo?.data?.id ?? corpo?.id ?? null };
  } catch (erro) {
    return {
      estado: "erro",
      motivo: erro instanceof Error ? erro.message : "falha desconhecida ao chamar a Clint",
    };
  }
}
