import "server-only";

import { baseUrl } from "@/lib/config/urls";
import { formatarValorNaMoeda } from "@/lib/internacional/moeda";

type ResultadoEmail =
  | { estado: "enviado"; id: string | null }
  | { estado: "desligado" }
  | { estado: "erro"; motivo: string };

type MensagemOperacional = {
  assunto: string;
  texto: string;
  html?: string;
  idempotencyKey?: string;
};

type PedidoPendente = {
  orderId: string;
  orderNumber: string;
  cliente: string;
  totalCents: number;
  moeda: string;
  origem: "checkout nacional" | "checkout internacional";
  cidade?: string | null;
  pais?: string | null;
};

function destinatarios(): string[] {
  const bruto = (process.env.REVERA_ALERT_EMAIL_TO ?? "").trim();
  return bruto
    .split(/[,\s;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function remetente(): string {
  return (
    process.env.REVERA_ALERT_EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    "Revera <avisos@avisos.onemark.com.br>"
  );
}

export function emailOperacionalDisponivel(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && destinatarios().length > 0);
}

/**
 * Aviso operacional por e-mail.
 *
 * Nunca lança: este caminho roda perto de pagamento/webhook. Se o provedor de
 * e-mail estiver sem chave ou fora do ar, a venda continua confirmada e a falha
 * fica no log para correção operacional.
 */
export async function enviarEmailOperacional(
  mensagem: MensagemOperacional
): Promise<ResultadoEmail> {
  const chave = process.env.RESEND_API_KEY?.trim();
  const para = destinatarios();

  if (!chave || para.length === 0) return { estado: "desligado" };

  const texto = mensagem.texto.trim();
  const html = mensagem.html ?? textoParaHtml(texto);

  try {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${chave}`,
        "content-type": "application/json",
        ...(mensagem.idempotencyKey ? { "Idempotency-Key": mensagem.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: remetente(),
        to: para,
        subject: mensagem.assunto,
        text: texto,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const corpo = (await resposta.json().catch(() => null)) as
      | { id?: string; message?: string }
      | null;

    if (!resposta.ok) {
      return {
        estado: "erro",
        motivo: `Resend recusou: ${resposta.status} ${corpo?.message ?? "sem detalhe"}`,
      };
    }

    return { estado: "enviado", id: corpo?.id ?? null };
  } catch (erro) {
    return {
      estado: "erro",
      motivo: erro instanceof Error ? erro.message : "falha desconhecida ao enviar e-mail",
    };
  }
}

export async function avisarPedidoPendentePorEmail(
  pedido: PedidoPendente
): Promise<ResultadoEmail> {
  const valor = formatarValorNaMoeda(pedido.totalCents, pedido.moeda);
  const destino = [pedido.cidade, pedido.pais].filter(Boolean).join(" / ") || "não informado";
  const link = `${baseUrl()}/admin/pedidos/${pedido.orderId}`;

  return enviarEmailOperacional({
    assunto: `Checkout Reverá pendente — ${pedido.orderNumber}`,
    texto: [
      "CHECKOUT REVERÁ PENDENTE",
      "",
      `Pedido: ${pedido.orderNumber}`,
      `Cliente: ${pedido.cliente}`,
      `Valor: ${valor}`,
      `Origem: ${pedido.origem}`,
      `Destino: ${destino}`,
      "",
      "Status: pedido criado e cliente enviado para pagamento.",
      "Ação: acompanhar se paga; se ficar parado, entra na recuperação.",
      "",
      `Painel: ${link}`,
    ].join("\n"),
    idempotencyKey: `revera-checkout-pendente:${pedido.orderId}`,
  });
}

function textoParaHtml(texto: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:720px;line-height:1.5;color:#17191d"><pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${escapar(
    texto
  )}</pre></div>`;
}

function escapar(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
