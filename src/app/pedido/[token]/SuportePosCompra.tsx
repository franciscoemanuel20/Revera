import "server-only";

import { textos, type Idioma } from "@/lib/internacional/idioma";

/**
 * Contato de suporte — o ÚNICO lugar do site onde o telefone da Reverá pode
 * aparecer.
 *
 * ===========================================================================
 * A REGRA (seções 17 e 18 da missão, confirmada pelo Francisco em 26/08/2026)
 * ===========================================================================
 * O número 12 98140-9901 só pode aparecer na PÁGINA DO PEDIDO. Nunca em home,
 * produto, carrinho, checkout, metadados, ou em qualquer HTML que um visitante
 * consiga carregar sem antes ter fechado um pedido.
 *
 * REVISÃO DE 31/08/2026 (Francisco): a regra original era "só depois do
 * pagamento confirmado". Ela deixava sem saída justamente quem mais precisa
 * de ajuda — o cliente que caiu em "Aguardando pagamento" porque o Pix
 * expirou, o cartão recusou ou ele fechou a aba no meio. Esse cliente já
 * chegou ao fim do checkout e tem o `access_token` do pedido dele; não é um
 * visitante anônimo. A partir de agora o contato aparece nos dois estados,
 * com texto diferente em cada um.
 *
 * O que NÃO mudou, e continua sendo o que protege o número:
 *
 * 1. Este é um Server Component. O número vem de `process.env` no servidor e
 *    só entra no HTML já renderizado — nunca vai para o bundle JavaScript do
 *    cliente (uma variável sem o prefixo NEXT_PUBLIC_ não é exposta pelo Next
 *    ao navegador).
 *
 * 2. Quem decide renderizar é a página do pedido, e ela só existe atrás de um
 *    `access_token` (uuid aleatório) emitido no fim do checkout. Não dá para
 *    enumerar pedidos alheios trocando um número na URL.
 *
 * 3. `scripts/verify-no-secrets-in-bundle.mjs` varre o build à procura do
 *    número — se ele vazar para o bundle público algum dia, o script grita.
 *
 * E o botão NÃO dispara evento de conversão nenhum: o Purchase já saiu na
 * confirmação do pagamento. Contá-lo de novo aqui inflaria a métrica e
 * envenenaria a otimização das campanhas.
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
  const numero = process.env.WHATSAPP_POST_PURCHASE_NUMBER;
  const t = textos(idioma);

  // Sem número configurado, a seção simplesmente não aparece — melhor que
  // mostrar um link quebrado.
  if (!numero) return null;

  const apenasDigitos = comDDI(numero);
  if (!apenasDigitos) return null;

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
        href={`https://wa.me/${apenasDigitos}?text=${mensagem}`}
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
            href={`tel:+${apenasDigitos}`}
            className="font-semibold text-ink underline underline-offset-4"
          >
            {legivel(apenasDigitos, idioma)}
          </a>
        </p>
      ) : null}
    </section>
  );
}

/**
 * O wa.me EXIGE número internacional completo. Configurar a variável como
 * "12981409901" (o jeito que o número é escrito no Brasil) geraria um link
 * que abre o WhatsApp em um contato inexistente — falha silenciosa, do tipo
 * que ninguém percebe até um cliente reclamar. Então o DDI é garantido aqui:
 * 10 ou 11 dígitos é número brasileiro sem DDI, e ganha o 55.
 */
function comDDI(bruto: string): string | null {
  const d = bruto.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length >= 12) return d;
  return null;
}

/** "5512981409901" → "(12) 98140-9901" em pt, "+55 12 98140-9901" fora. */
function legivel(comDdi: string, idioma: Idioma): string {
  const nacional = comDdi.startsWith("55") ? comDdi.slice(2) : comDdi;
  if (nacional.length !== 10 && nacional.length !== 11) return `+${comDdi}`;
  const ddd = nacional.slice(0, 2);
  const corpo = nacional.slice(2);
  const meio = corpo.length === 9 ? corpo.slice(0, 5) : corpo.slice(0, 4);
  const fim = corpo.length === 9 ? corpo.slice(5) : corpo.slice(4);
  return idioma === "pt"
    ? `(${ddd}) ${meio}-${fim}`
    : `+55 ${ddd} ${meio}-${fim}`;
}
