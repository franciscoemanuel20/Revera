import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutForm } from "./CheckoutForm";
import { CheckoutInternacionalForm, type ResumoInternacional } from "./CheckoutInternacionalForm";
import { HEADER_HEIGHT_PX } from "@/lib/layout/header";
import { lerCarrinhoCompleto } from "@/lib/cart/store";
import { aceiteInternacional } from "@/lib/internacional/aceite";
import {
  precosDoCarrinhoNoMercado,
  prontidaoDoMercado,
} from "@/lib/internacional/mercado";
import {
  bandeira,
  idiomaDoPais,
  nomeDoPais,
  paisesDoCheckout,
  regraDoPais,
} from "@/lib/internacional/paises";
import { LANG_HTML, textos } from "@/lib/internacional/idioma";

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

  // O idioma sai do PAÍS ESCOLHIDO, não do cabeçalho do navegador. Um
  // brasileiro com o Chrome em inglês comprando para o Brasil continua
  // lendo português — o que decide a língua é para onde a peça vai, que é
  // também quem decide moeda, frete e imposto.
  const idioma = idiomaDoPais(pais);
  const t = textos(idioma);

  let conteudo: React.ReactNode;

  if (pais === "BR") {
    conteudo = <CheckoutForm />;
  } else {
    conteudo = await checkoutInternacional(pais);
  }

  return (
    <main
      // `lang` no <main>, e não no <html>: o layout raiz é compartilhado com
      // a loja inteira em português e mexer nele para traduzir o checkout
      // poria a venda nacional em risco. O atributo é válido em qualquer
      // elemento, e é o que faz o leitor de tela pronunciar em inglês.
      lang={LANG_HTML[idioma]}
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16"
      style={{ paddingTop: HEADER_HEIGHT_PX + 32 }}
    >
      <div className="flex flex-col gap-2">
        <span className="eyebrow-ink">{t.checkoutEyebrow}</span>
        <h1 className="font-display text-3xl text-ink">{t.checkoutTitulo}</h1>
      </div>

      {paises.length > 1 ? (
        <nav aria-label={t.navPaisLabel} className="flex flex-wrap gap-2">
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
              {bandeira(iso)} {nomeDoPais(iso, idioma)}
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
  const idioma = idiomaDoPais(pais);
  const t = textos(idioma);
  const mercado = await prontidaoDoMercado(pais);

  if (!regra || !mercado.aberto) {
    // `mercado.motivo` vem do servidor em português: é diagnóstico de
    // operação ("cotação vencida", "sem preço"), não texto de vitrine.
    // Traduzir motivo por motivo criaria duas listas para manter — e o
    // comprador não precisa do detalhe, precisa saber que não dá hoje.
    return (
      <IndisponivelInternacional
        pais={pais}
        motivo={t.indisponivelGenerico}
      />
    );
  }

  const carrinho = await lerCarrinhoCompleto();
  if (!carrinho.cartId || carrinho.items.length === 0) {
    return <p className="max-w-2xl text-ink/70">{t.sacolaVazia}</p>;
  }

  const precos = await precosDoCarrinhoNoMercado(
    carrinho.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    mercado.moeda
  );
  if (!precos.ok) {
    // Preço é decisão comercial: sem preço definido para o mercado, o
    // honesto é dizer isso — nunca converter do real por conta própria.
    return <IndisponivelInternacional pais={pais} motivo={t.semPrecoNoMercado} />;
  }

  const porVariante = new Map(precos.itens.map((i) => [i.variantId, i]));
  const aceite = aceiteInternacional(idioma);
  const resumo: ResumoInternacional = {
    idioma,
    locale: regra.locale,
    pais: {
      iso: regra.iso,
      nome: nomeDoPais(regra.iso, idioma),
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
    avisoImpostosTitulo: aceite.avisoTitulo,
    avisoImpostosTexto: aceite.avisoTexto,
    aceiteTexto: aceite.aceite,
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-2xl rounded-lg border border-sand bg-paper p-4 text-sm text-ink/80">
        <h2 className="mb-2 font-display text-lg text-ink">
          {t.envioPorTitulo(mercado.frete.carrier)}
        </h2>
        <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed">
          <li>{t.envioBulletPortaAPorta}</li>
          <li>{t.envioBulletPrazo}</li>
          <li>{t.envioBulletImpostos}</li>
        </ul>
      </section>
      <CheckoutInternacionalForm resumo={resumo} />
    </div>
  );
}

function IndisponivelInternacional({ pais, motivo }: { pais: string; motivo: string }) {
  const idioma = idiomaDoPais(pais);
  const t = textos(idioma);
  return (
    <div
      lang={LANG_HTML[idioma]}
      className="max-w-2xl rounded-lg border border-sand bg-paper p-6"
    >
      <h2 className="font-display text-xl text-ink">
        {bandeira(pais)} {t.indisponivelTitulo(nomeDoPais(pais, idioma))}
      </h2>
      <p className="mt-2 text-sm text-ink/70">{motivo}</p>
      <p className="mt-4 text-sm text-ink/70">{t.indisponivelAlternativa}</p>
      <Link href="/checkout" className="mt-4 inline-block text-sm text-ink underline">
        {t.indisponivelLinkBR}
      </Link>
    </div>
  );
}
