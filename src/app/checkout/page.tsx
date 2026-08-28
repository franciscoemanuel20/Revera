import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutForm } from "./CheckoutForm";
import { CheckoutInternacionalForm, type ResumoInternacional } from "./CheckoutInternacionalForm";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { lerCarrinhoCompleto } from "@/lib/cart/store";
import {
  ACEITE_INTERNACIONAL_TEXTO,
  AVISO_IMPOSTOS_TEXTO,
  AVISO_IMPOSTOS_TITULO,
} from "@/lib/internacional/aceite";
import {
  precosDoCarrinhoNoMercado,
  prontidaoDoMercado,
} from "@/lib/internacional/mercado";
import { bandeira, nomeDoPais, paisesDoCheckout, regraDoPais } from "@/lib/internacional/paises";

export const metadata: Metadata = {
  title: "Checkout",
};

/**
 * A casca da página decide QUAL checkout renderizar:
 *
 *  - Brasil (padrão e único caso enquanto CHECKOUT_PAISES não abrir mais
 *    países): o CheckoutForm de sempre, intocado.
 *  - País internacional ABERTO (env + Stripe + cotação de frete vigente +
 *    preço do mercado para cada item): o formulário internacional, com
 *    frete e total calculados AQUI, no servidor.
 *  - País internacional com perna faltando: mensagem honesta de
 *    indisponibilidade — nunca um formulário que quebra no fim.
 *
 * O seletor de país só aparece quando existe mais de um país aberto —
 * a loja 100% nacional não ganha UI nova nenhuma.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ pais?: string }>;
}) {
  const sp = await searchParams;
  const paises = paisesDoCheckout();
  const paisPedido = (sp.pais ?? "BR").toUpperCase();
  const pais = paises.includes(paisPedido) ? paisPedido : "BR";

  let conteudo: React.ReactNode;

  if (pais === "BR") {
    conteudo = <CheckoutForm />;
  } else {
    conteudo = await checkoutInternacional(pais);
  }

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <div className="flex flex-col gap-2">
        <span className="eyebrow-ink">Quase lá</span>
        <h1 className="font-display text-3xl text-ink">Finalizar pedido</h1>
      </div>

      {paises.length > 1 ? (
        <nav aria-label="País de entrega" className="flex flex-wrap gap-2">
          {paises.map((iso) => (
            <Link
              key={iso}
              href={iso === "BR" ? "/checkout" : `/checkout?pais=${iso}`}
              className={`rounded-full border px-4 py-2 text-sm ${
                iso === pais
                  ? "border-ink bg-ink text-paper"
                  : "border-sand bg-paper text-ink"
              }`}
            >
              {bandeira(iso)} {nomeDoPais(iso)}
            </Link>
          ))}
        </nav>
      ) : null}

      {conteudo}
    </main>
  );
}

async function checkoutInternacional(pais: string): Promise<React.ReactNode> {
  const regra = regraDoPais(pais);
  const mercado = await prontidaoDoMercado(pais);

  if (!regra || !mercado.aberto) {
    return (
      <IndisponivelInternacional
        pais={pais}
        motivo={mercado.aberto ? "Indisponível." : mercado.motivo}
      />
    );
  }

  const carrinho = await lerCarrinhoCompleto();
  if (!carrinho.cartId || carrinho.items.length === 0) {
    return (
      <p className="max-w-2xl text-ink/70">
        Sua sacola está vazia — volte à loja e adicione uma peça antes de finalizar.
      </p>
    );
  }

  const precos = await precosDoCarrinhoNoMercado(
    carrinho.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    mercado.moeda
  );
  if (!precos.ok) {
    // Preço é decisão comercial: sem preço definido para o mercado, o
    // honesto é dizer isso — nunca converter do real por conta própria.
    return (
      <IndisponivelInternacional
        pais={pais}
        motivo="Um dos itens da sua sacola ainda não tem preço definido para este país."
      />
    );
  }

  const porVariante = new Map(precos.itens.map((i) => [i.variantId, i]));
  const resumo: ResumoInternacional = {
    pais: {
      iso: regra.iso,
      nomePt: regra.nomePt,
      ddi: regra.ddi,
      exigeRegiao: regra.exigeRegiao,
      rotuloRegiao: regra.rotuloRegiao,
      rotuloPostal: regra.rotuloPostal,
      postalExemplo: regra.postalExemplo,
    },
    moeda: mercado.moeda,
    itens: carrinho.items.map((item) => ({
      nome: item.productName,
      quantidade: item.quantity,
      subtotalCents: porVariante.get(item.variantId)?.subtotalCents ?? 0,
    })),
    subtotalCents: precos.subtotalCents,
    frete: {
      carrier: mercado.frete.carrier,
      serviceName: mercado.frete.serviceName,
      priceCents: mercado.frete.priceCents,
      etaDiasMin: mercado.frete.etaDiasMin,
      etaDiasMax: mercado.frete.etaDiasMax,
    },
    totalCents: precos.subtotalCents + mercado.frete.priceCents,
    avisoImpostosTitulo: AVISO_IMPOSTOS_TITULO,
    avisoImpostosTexto: AVISO_IMPOSTOS_TEXTO,
    aceiteTexto: ACEITE_INTERNACIONAL_TEXTO,
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-2xl rounded-lg border border-sand bg-paper p-4 text-sm text-ink/80">
        <h2 className="mb-2 font-display text-lg text-ink">
          Seu pedido será enviado pela {mercado.frete.carrier}
        </h2>
        <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed">
          <li>Envio porta a porta, com rastreamento e comprovante de entrega.</li>
          <li>O prazo estimado é informado no momento da contratação do envio.</li>
          <li>
            A encomenda poderá estar sujeita a impostos e taxas no país de destino
            (detalhes abaixo, antes de finalizar).
          </li>
        </ul>
      </section>
      <CheckoutInternacionalForm resumo={resumo} />
    </div>
  );
}

function IndisponivelInternacional({ pais, motivo }: { pais: string; motivo: string }) {
  return (
    <div className="max-w-2xl rounded-lg border border-sand bg-paper p-6">
      <h2 className="font-display text-xl text-ink">
        {bandeira(pais)} {nomeDoPais(pais)} — indisponível no momento
      </h2>
      <p className="mt-2 text-sm text-ink/70">{motivo}</p>
      <p className="mt-4 text-sm text-ink/70">
        Você pode finalizar uma entrega no Brasil normalmente, ou voltar mais tarde.
      </p>
      <Link href="/checkout" className="mt-4 inline-block text-sm text-ink underline">
        Ir para o checkout do Brasil
      </Link>
    </div>
  );
}
