import "server-only";

import { textos, type Idioma } from "@/lib/internacional/idioma";
import { WHATSAPP_REVERA, whatsappLegivel } from "@/lib/config/whatsapp";

/**
 * Contato de suporte de quem já fechou pedido.
 *
 * ===========================================================================
 * HISTÓRICO DA REGRA DO TELEFONE — e por que ela não vale mais
 * ===========================================================================
 * 26/08/2026 (Francisco): o telefone da Reverá só podia aparecer na PÁGINA DO
 * PEDIDO. Nunca em home, produto, carrinho, checkout ou metadados.
 *
 * 31/08/2026 (Francisco): a regra original era "só depois do pagamento
 * confirmado". Ela deixava sem saída justamente quem mais precisa de ajuda —
 * o cliente que caiu em "Aguardando pagamento" porque o Pix expirou, o cartão
 * recusou ou ele fechou a aba no meio. Esse cliente já chegou ao fim do
 * checkout e tem o `access_token` do pedido dele; não é um visitante anônimo.
 * O contato passou a aparecer nos dois estados, com texto diferente em cada.
 *
 * 03/09/2026 (Francisco): O NÚMERO MUDOU e a proteção caiu junto. O de antes
 * vivia na conta oficial da Meta; o novo é um WhatsApp comum, publicado no
 * botão de /para-profissionais, que é página aberta. Ver o comentário em
 * src/lib/config/whatsapp.ts — a partir dali, "esconder" o número seria
 * cerimônia sem efeito.
 *
 * O que NÃO mudou:
 *
 * 1. Onde este componente aparece: só na página do pedido, que só existe
 *    atrás de um `access_token` (uuid aleatório) emitido no fim do checkout.
 *    Ninguém enumera pedido alheio trocando número na URL.
 *
 * 2. O botão NÃO dispara evento de conversão nenhum: o Purchase já saiu na
 *    confirmação do pagamento. Contá-lo de novo aqui inflaria a métrica e
 *    envenenaria a otimização das campanhas.
 */
export function SuportePosCompra({
  numeroPedido,
  idioma = "pt",
  variante = "pago",
}: {
  numeroPedido: string;
  /** Idioma do comprador — o do país de entrega, decidido pela página. */
  idioma?: Idioma;
  /**
   * "pago" é o suporte de sempre, sobre o pedido já fechado. "aguardando" é
   * a saída de emergência de quem travou no pagamento: o texto fala do
   * pagamento, e o número aparece escrito, para quem prefere ligar.
   */
  variante?: "pago" | "aguardando";
}) {
  const t = textos(idioma);
  const pendente = variante === "aguardando";
  const mensagem = encodeURIComponent(
    pendente ? t.suporteMensagemPendente(numeroPedido) : t.suporteMensagem(numeroPedido)
  );

  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-sand p-5 text-center">
      <h2 className="font-display text-xl text-ink">
        {pendente ? t.suporteTituloPendente : t.suporteTitulo}
      </h2>
      <p className="text-sm text-ink/70">
        {pendente ? t.suporteTextoPendente : t.suporteTexto}
      </p>
      <a
        href={`https://wa.me/${WHATSAPP_REVERA}?text=${mensagem}`}
        target="_blank"
        rel="noopener noreferrer"
        className="min-h-toque rounded-md bg-gold-metal px-6 py-3 font-body font-semibold text-ink transition-all duration-300 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        {pendente ? t.suporteBotaoPendente : t.suporteBotao(numeroPedido)}
      </a>
      {pendente ? (
        /* Escrito, e não só no botão: quem está com o pagamento travado às
           vezes está no computador, com o WhatsApp no celular ao lado. */
        <p className="text-sm text-ink/70">
          {t.suporteTelefoneRotulo}:{" "}
          <a
            href={`tel:+${WHATSAPP_REVERA}`}
            className="font-semibold text-ink underline underline-offset-4"
          >
            {whatsappLegivel(idioma !== "pt")}
          </a>
        </p>
      ) : null}
    </section>
  );
}
