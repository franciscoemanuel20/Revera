import "server-only";

import { textos, type Idioma } from "@/lib/internacional/idioma";
import { WHATSAPP_REVERA, linkWhatsApp, whatsappLegivel } from "@/lib/config/whatsapp";

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

  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-sand p-5 text-center">
      <h2 className="font-display text-xl text-ink">
        {pendente ? t.suporteTituloPendente : t.suporteTitulo}
      </h2>
      <p className="text-sm text-ink/70">
        {pendente ? t.suporteTextoPendente : t.suporteTexto}
      </p>

      <BotaoWhatsApp
        href={linkWhatsApp(
          pendente
            ? t.suporteMensagemPendente(numeroPedido)
            : t.suporteMensagem(numeroPedido)
        )}
        destaque={pendente}
      >
        {pendente ? t.suporteBotaoPendente : t.suporteBotao(numeroPedido)}
      </BotaoWhatsApp>

      {/* COMPRAR DE NOVO (03/09/2026, pedido do Francisco).
          Só no estado PAGO, e por um motivo: no "Aguardando pagamento" a
          pessoa ainda não comprou nada — oferecer "comprei e quero mais" ali
          seria oferecer o segundo passo a quem tropeçou no primeiro.
          É um botão SEPARADO, e não uma segunda frase no de suporte, porque
          são duas conversas diferentes chegando no WhatsApp: uma é problema,
          a outra é venda. A mensagem já vem escrita para a equipe saber qual
          é qual sem perguntar.
          Como todo botão desta tela, ele NÃO dispara conversão: o Purchase
          já saiu no PurchaseTracker desta mesma página. */}
      {!pendente ? (
        <BotaoWhatsApp
          href={linkWhatsApp(t.recompraMensagem(numeroPedido))}
          destaque
        >
          {t.recompraBotao}
        </BotaoWhatsApp>
      ) : null}

      {/* O número ESCRITO, não só dentro do botão. Quem está no computador
          tem o WhatsApp no celular ao lado, e ali o link não ajuda — ele
          precisa ler os dígitos. Valia para quem travou no pagamento desde
          31/08; desde 03/09 vale para os dois estados, porque quem acabou de
          comprar liga tanto quanto quem não conseguiu pagar. */}
      <p className="text-sm text-ink/70">
        {t.suporteTelefoneRotulo}:{" "}
        <a
          href={`tel:+${WHATSAPP_REVERA}`}
          className="font-semibold text-ink underline underline-offset-4"
        >
          {whatsappLegivel(idioma !== "pt")}
        </a>
      </p>
    </section>
  );
}

/**
 * O botão de WhatsApp desta tela. `destaque` é o dourado da marca; sem ele,
 * a borda discreta — dois botões dourados lado a lado brigam entre si e o
 * olho não escolhe nenhum.
 */
function BotaoWhatsApp({
  href,
  destaque = false,
  children,
}: {
  href: string;
  destaque?: boolean;
  children: React.ReactNode;
}) {
  const estilo = destaque
    ? "bg-gold-metal text-ink hover:brightness-105"
    : "border border-ink text-ink hover:bg-sand";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`min-h-toque rounded-md px-6 py-3 font-body font-semibold transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${estilo}`}
    >
      {children}
    </a>
  );
}
