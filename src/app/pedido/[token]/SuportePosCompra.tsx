import "server-only";

/**
 * Contato de suporte — o ÚNICO lugar do site onde o telefone da Reverá pode
 * aparecer.
 *
 * ===========================================================================
 * A REGRA (seções 17 e 18 da missão, confirmada pelo Francisco em 26/08/2026)
 * ===========================================================================
 * O número 12 98140-9901 só pode aparecer DEPOIS do pagamento confirmado.
 * Nunca em home, produto, carrinho, checkout, metadados, ou em qualquer HTML
 * que um visitante não-comprador consiga carregar.
 *
 * Como isso é garantido tecnicamente, e não só por disciplina:
 *
 * 1. Este é um Server Component. O número vem de `process.env` no servidor e
 *    só entra no HTML que já foi renderizado — nunca vai para o bundle
 *    JavaScript do cliente (uma variável sem o prefixo NEXT_PUBLIC_ não é
 *    exposta pelo Next ao navegador).
 *
 * 2. Quem decide renderizar é a página do pedido, e só quando o pagamento
 *    está confirmado pelo gateway. Abrir a URL na mão não basta: sem
 *    pagamento, este componente não é montado e o número não existe no HTML.
 *
 * 3. `scripts/verify-no-secrets-in-bundle.mjs` varre o build à procura do
 *    número — se ele vazar para o bundle público algum dia, o script grita.
 *
 * E o botão NÃO dispara evento de conversão nenhum: o Purchase já saiu na
 * confirmação do pagamento. Contá-lo de novo aqui inflaria a métrica e
 * envenenaria a otimização das campanhas.
 */
export function SuportePosCompra({ numeroPedido }: { numeroPedido: string }) {
  const numero = process.env.WHATSAPP_POST_PURCHASE_NUMBER;

  // Sem número configurado, a seção simplesmente não aparece — melhor que
  // mostrar um link quebrado.
  if (!numero) return null;

  const apenasDigitos = numero.replace(/\D/g, "");
  const mensagem = encodeURIComponent(
    `Olá! Tenho uma dúvida sobre o pedido ${numeroPedido}.`
  );

  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-sand p-5 text-center">
      <h2 className="font-display text-xl text-ink">Ficou com alguma dúvida?</h2>
      <p className="text-sm text-ink/70">
        Fale com a nossa equipe sobre este pedido.
      </p>
      <a
        href={`https://wa.me/${apenasDigitos}?text=${mensagem}`}
        target="_blank"
        rel="noopener noreferrer"
        className="min-h-toque rounded-md bg-gold-metal px-6 py-3 font-body font-semibold text-ink transition-all duration-300 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        Falar sobre o pedido {numeroPedido}
      </a>
    </section>
  );
}
