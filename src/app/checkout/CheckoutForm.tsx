"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { medirIniciarCheckout } from "@/lib/tracking/browser";
import { lerAtribuicao } from "@/lib/tracking/atribuicao";
import { useCart } from "@/components/cart/CartProvider";
import { Button } from "@/components/ui/Button";
import { CheckoutSummary } from "@/components/ui/CheckoutSummary";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";
import { formatarCPF } from "@/lib/format/cpf";
import { criarPedidoAction } from "./actions";
import type { CheckoutInput } from "./schema";
import type { CartView } from "@/lib/cart/types";

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";
const FRETE_TIMEOUT_MS = 12_000;

interface FormState {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

const ESTADO_INICIAL: FormState = {
  name: "",
  email: "",
  phone: "",
  cpf: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};

function formatarCEP(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

// Resposta da ViaCEP quando o CEP é válido mas não existe:
// `{ erro: true }`, sem os outros campos — por isso o tipo abaixo marca
// tudo opcional e a checagem de "não encontrado" olha para `data.erro`.
interface RespostaViaCep {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

// Formulário de checkout — só isto e a criação do pedido (ver
// docstring de actions.ts). Nome/e-mail/telefone/CPF + endereço, CEP com
// autocompletar via ViaCEP, validação de verdade no servidor (zod +
// dígito verificador de CPF, ver schema.ts). Nenhuma etapa de pagamento
// aqui — o botão final só cria o pedido e redireciona para o placeholder
// em /checkout/pagamento.
export function CheckoutForm({
  carrinhoInicial,
  applePayDisponivel,
}: {
  carrinhoInicial?: CartView;
  applePayDisponivel?: boolean;
}) {
  const { cart, carregando } = useCart();
  const cartCheckout = carregando && carrinhoInicial ? carrinhoInicial : cart;
  const [campos, setCampos] = useState<FormState>(ESTADO_INICIAL);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [suporteFreteHref, setSuporteFreteHref] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [avisoCep, setAvisoCep] = useState<string | null>(null);
  const [paymentPreference, setPaymentPreference] = useState<"default" | "apple_pay">("default");

  useEffect(() => {
    if (!applePayDisponivel && paymentPreference === "apple_pay") {
      setPaymentPreference("default");
    }
  }, [applePayDisponivel, paymentPreference]);

  /**
   * InitiateCheckout — uma vez por visita a esta tela.
   *
   * A trava com useRef existe porque o efeito reexecuta: o React monta duas
   * vezes em desenvolvimento (StrictMode), e o estado do carrinho muda
   * enquanto a pessoa preenche (frete cotado, quantidade). Sem a trava, o
   * evento sairia várias vezes por checkout e o funil mostraria mais
   * "começaram" do que pessoas — o que faz a taxa de conclusão parecer pior
   * do que é, e leva a otimizar a campanha errada.
   *
   * Espera o carrinho ter itens: disparar com sacola vazia mediria alguém
   * que nem chegou a começar.
   */
  const iniciouCheckout = useRef(false);
  useEffect(() => {
    if (iniciouCheckout.current) return;
    if (cartCheckout.items.length === 0) return;
    iniciouCheckout.current = true;

    medirIniciarCheckout({
      itens: cartCheckout.items.map((i) => ({
        variantId: i.variantId,
        nome: i.productName,
        quantidade: i.quantity,
        precoUnitarioCents: i.unitPriceCents,
      })),
      totalCents: cartCheckout.totalCents,
    });
  }, [cartCheckout.items, cartCheckout.totalCents]);
  // null = ainda não cotado (ou cotação falhou). NÃO é 0 — mostrar R$ 0,00
  // pareceria frete grátis, que é promessa que ninguém fez.
  const [frete, setFrete] = useState<{
    priceCents: number;
    serviceName: string;
    etaDays: number;
  } | null>(null);
  const [cotandoFrete, setCotandoFrete] = useState(false);
  const [avisoFrete, setAvisoFrete] = useState<string | null>(null);
  const ultimoCepCotado = useRef("");

  function atualizarCampo<K extends keyof FormState>(campo: K, valor: string) {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
    setErros((atual) => {
      if (!atual[campo]) return atual;
      const proximo = { ...atual };
      delete proximo[campo];
      return proximo;
    });
  }

  // ViaCEP é chamado direto do navegador (endpoint público, sem chave e
  // com CORS liberado) — não precisa de round-trip pelo servidor só para
  // repassar a mesma requisição. "Trate CEP inválido e falha de rede com
  // mensagem clara": os dois casos abaixo têm mensagem própria, nenhum
  // deles trava o formulário (o cliente sempre pode preencher o endereço
  // na mão).
  /**
   * Apaga o endereço que veio de uma busca ANTERIOR (29/08/2026).
   *
   * Sem isto: quem digitava 01310-100 via "Avenida Paulista / Bela Vista /
   * São Paulo / SP" preencher sozinho, trocava para um CEP de Santa
   * Catarina, recebia "CEP não encontrado" — e os campos continuavam com o
   * endereço de São Paulo. O pedido podia sair com o CEP de uma cidade e a
   * rua de outra, e quem descobre isso é o entregador.
   *
   * O cliente continua livre para preencher na mão: os campos só ficam
   * vazios, não bloqueados.
   */
  function limparEnderecoBuscado() {
    setCampos((atual) => ({
      ...atual,
      street: "",
      neighborhood: "",
      city: "",
      state: "",
    }));
  }

  async function buscarEndereco(cepDigitado: string) {
    const digitos = cepDigitado.replace(/\D/g, "");
    setAvisoCep(null);

    if (digitos.length !== 8) return;

    setBuscandoCep(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      if (!resposta.ok) {
        limparEnderecoBuscado();
        setAvisoCep("Não foi possível consultar o CEP agora — preencha o endereço manualmente.");
        return;
      }

      const dados = (await resposta.json()) as RespostaViaCep;
      if (dados.erro) {
        limparEnderecoBuscado();
        setAvisoCep("CEP não encontrado — confira o número ou preencha o endereço manualmente.");
        return;
      }

      setCampos((atual) => ({
        ...atual,
        street: dados.logradouro ?? atual.street,
        neighborhood: dados.bairro ?? atual.neighborhood,
        city: dados.localidade ?? atual.city,
        state: dados.uf ?? atual.state,
      }));
    } catch {
      limparEnderecoBuscado();
      setAvisoCep("Não foi possível consultar o CEP agora — preencha o endereço manualmente.");
    } finally {
      setBuscandoCep(false);
    }
  }

  /**
   * Cota o frete assim que o CEP fica completo.
   *
   * O valor mostrado aqui é INFORMATIVO. Quem decide o que será cobrado é o
   * servidor, na criação do pedido — esta chamada existe para o cliente não
   * ser surpreendido por um total maior na tela do gateway.
   *
   * Só o CEP sobe: quantidade e valor saem do carrinho no servidor (ver
   * src/app/api/frete/route.ts).
   */
  async function cotarFrete(cepDigitado: string) {
    const digitos = cepDigitado.replace(/\D/g, "");
    if (digitos.length !== 8 || cartCheckout.items.length === 0) {
      setFrete(null);
      ultimoCepCotado.current = "";
      return;
    }

    const quantidade = cartCheckout.items.reduce((soma, item) => soma + item.quantity, 0);
    const chaveCotacao = `${digitos}:${quantidade}:${cartCheckout.subtotalSemDescontoCents}`;
    if (ultimoCepCotado.current === chaveCotacao) return;
    ultimoCepCotado.current = chaveCotacao;

    setCotandoFrete(true);
    setAvisoFrete(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), FRETE_TIMEOUT_MS);
    try {
      const r = await fetch("/api/frete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cep: digitos }),
        signal: controller.signal,
      });
      const dados = (await r.json()) as {
        disponivel?: boolean;
        priceCents?: number;
        serviceName?: string;
        etaDays?: number;
      };

      if (!r.ok || !dados.disponivel || typeof dados.priceCents !== "number") {
        ultimoCepCotado.current = "";
        setFrete(null);
        setAvisoFrete(
          "Não conseguimos mostrar o frete agora. Você ainda pode finalizar; o frete " +
            "será recalculado com segurança antes do pagamento."
        );
        return;
      }

      setFrete({
        priceCents: dados.priceCents,
        serviceName: dados.serviceName ?? "",
        etaDays: dados.etaDays ?? 0,
      });
    } catch {
      ultimoCepCotado.current = "";
      setFrete(null);
      setAvisoFrete(
        "Não conseguimos mostrar o frete agora. Você ainda pode finalizar; o frete " +
          "será recalculado com segurança antes do pagamento."
      );
    } finally {
      window.clearTimeout(timeout);
      setCotandoFrete(false);
    }
  }

  useEffect(() => {
    const digitos = campos.cep.replace(/\D/g, "");
    if (digitos.length !== 8) {
      setFrete(null);
      setAvisoFrete(null);
      ultimoCepCotado.current = "";
      return;
    }

    const timeout = window.setTimeout(() => {
      void buscarEndereco(campos.cep);
      void cotarFrete(campos.cep);
    }, 350);

    return () => window.clearTimeout(timeout);
    // O CEP completo e o carrinho atual decidem a cotacao exibida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campos.cep, cartCheckout.items.length, cartCheckout.subtotalSemDescontoCents]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErroGeral(null);
    setSuporteFreteHref(null);

    if (cartCheckout.items.length === 0) {
      setErroGeral("Sua sacola está vazia — volte e adicione algo antes de finalizar.");
      return;
    }

    const complementoLimpo = campos.complement.trim();
    const payload: CheckoutInput = {
      ...campos,
      complement: complementoLimpo === "" ? null : complementoLimpo,
      paymentPreference: applePayDisponivel ? paymentPreference : "default",
      // Lido AQUI, no envio, e não na montagem da tela: os cookies do pixel
      // podem só existir depois que os scripts carregaram, e no submit já
      // carregaram com folga.
      atribuicao: lerAtribuicao(),
      trackingConsent: window.localStorage.getItem("revera-cookies-opcionais-v1") === "aceito",
    };

    setEnviando(true);
    const resultado = await criarPedidoAction(payload);
    setEnviando(false);

    // Sucesso não devolve nada: a própria Server Action já fez redirect()
    // para /checkout/pagamento — chegar aqui só acontece no caminho de erro
    // (mesmo padrão de salvarProdutoAction, ver
    // src/app/admin/(protected)/produtos/actions.ts).
    if (resultado?.erro) {
      setErroGeral(resultado.erro);
      setSuporteFreteHref(resultado.suporteWhatsAppUrl ?? null);
      setErros(resultado.camposComErro ?? {});
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-8 pb-16" noValidate>
      {erroGeral ? <Toast message={erroGeral} variant="error" onClose={() => setErroGeral(null)} /> : null}
      {suporteFreteHref ? (
        <div className="rounded-xl border border-gold/45 bg-gold/10 p-4 text-sm text-ink shadow-sm">
          <p className="font-semibold">A equipe pode confirmar esse frete manualmente.</p>
          <p className="mt-1 text-ink/70">
            O link ja leva o CEP e os itens da sacola para agilizar o atendimento.
          </p>
          <a
            href={suporteFreteHref}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-toque items-center justify-center rounded-xl bg-gold-metal px-4 py-3 font-semibold text-ink shadow-[0_8px_20px_-10px_rgb(var(--gold-rgb)_/_0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-glow-gold"
          >
            Falar no WhatsApp
          </a>
        </div>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl text-ink">Seus dados</h2>

        <FormField label="Nome completo" error={erros.name}>
          {(props) => (
            <input
              {...props}
              required
              value={campos.name}
              onChange={(e) => atualizarCampo("name", e.target.value)}
              className={inputClass}
              autoComplete="name"
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="E-mail" error={erros.email}>
            {(props) => (
              <input
                {...props}
                type="email"
                required
                value={campos.email}
                onChange={(e) => atualizarCampo("email", e.target.value)}
                className={inputClass}
                autoComplete="email"
              />
            )}
          </FormField>

          <FormField label="Telefone" hint="Com DDD, para contato sobre o envio." error={erros.phone}>
            {(props) => (
              <input
                {...props}
                type="tel"
                required
                value={campos.phone}
                onChange={(e) => atualizarCampo("phone", e.target.value)}
                className={inputClass}
                autoComplete="tel"
              />
            )}
          </FormField>
        </div>

        <FormField label="CPF" error={erros.cpf}>
          {(props) => (
            <input
              {...props}
              required
              value={campos.cpf}
              onChange={(e) => atualizarCampo("cpf", formatarCPF(e.target.value))}
              className={inputClass}
              inputMode="numeric"
              maxLength={14}
            />
          )}
        </FormField>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl text-ink">Endereço de entrega</h2>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <FormField
            label="CEP"
            hint={
              buscandoCep
                ? "Buscando endereço…"
                : cotandoFrete
                  ? "Calculando o frete…"
                  : avisoCep ?? "Preenche rua, bairro, cidade e UF — e calcula o frete."
            }
            error={erros.cep}
          >
            {(props) => (
              <input
                {...props}
                required
                value={campos.cep}
                onChange={(e) => atualizarCampo("cep", formatarCEP(e.target.value))}
                className={inputClass}
                inputMode="numeric"
                maxLength={9}
                autoComplete="postal-code"
              />
            )}
          </FormField>

          <Button
            type="button"
            variant="secondary"
            size="md"
            className="w-full whitespace-nowrap sm:w-auto"
            disabled={buscandoCep || cotandoFrete || campos.cep.replace(/\D/g, "").length !== 8}
            onClick={() => {
              void buscarEndereco(campos.cep);
              void cotarFrete(campos.cep);
            }}
          >
            {cotandoFrete ? "Calculando…" : "Calcular frete"}
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <FormField label="Rua" error={erros.street}>
            {(props) => (
              <input
                {...props}
                required
                value={campos.street}
                onChange={(e) => atualizarCampo("street", e.target.value)}
                className={inputClass}
                autoComplete="address-line1"
              />
            )}
          </FormField>

          <FormField label="Número" error={erros.number}>
            {(props) => (
              <input
                {...props}
                required
                value={campos.number}
                onChange={(e) => atualizarCampo("number", e.target.value)}
                className={inputClass}
              />
            )}
          </FormField>
        </div>

        <FormField label="Complemento" hint="Opcional." error={erros.complement}>
          {(props) => (
            <input
              {...props}
              value={campos.complement}
              onChange={(e) => atualizarCampo("complement", e.target.value)}
              className={inputClass}
              autoComplete="address-line2"
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_80px]">
          <FormField label="Bairro" error={erros.neighborhood}>
            {(props) => (
              <input
                {...props}
                required
                value={campos.neighborhood}
                onChange={(e) => atualizarCampo("neighborhood", e.target.value)}
                className={inputClass}
              />
            )}
          </FormField>

          <FormField label="Cidade" error={erros.city}>
            {(props) => (
              <input
                {...props}
                required
                value={campos.city}
                onChange={(e) => atualizarCampo("city", e.target.value)}
                className={inputClass}
                autoComplete="address-level2"
              />
            )}
          </FormField>

          <FormField label="UF" error={erros.state}>
            {(props) => (
              <input
                {...props}
                required
                value={campos.state}
                onChange={(e) => atualizarCampo("state", e.target.value.toUpperCase())}
                className={inputClass}
                maxLength={2}
                autoComplete="address-level1"
              />
            )}
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-ink">Forma de pagamento</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-toque cursor-pointer items-start gap-3 rounded-xl border border-sand bg-paper p-4 text-sm text-ink shadow-sm transition hover:border-gold">
            <input
              type="radio"
              name="paymentPreference"
              className="mt-1"
              checked={paymentPreference === "default"}
              onChange={() => setPaymentPreference("default")}
            />
            <span>
              <strong className="block">Pix ou cartão</strong>
              <span className="mt-1 block text-ink/65">Opções nacionais no checkout seguro.</span>
            </span>
          </label>
          {applePayDisponivel ? (
            <label className="flex min-h-toque cursor-pointer items-start gap-3 rounded-xl border border-sand bg-paper p-4 text-sm text-ink shadow-sm transition hover:border-gold">
              <input
                type="radio"
                name="paymentPreference"
                className="mt-1"
                checked={paymentPreference === "apple_pay"}
                onChange={() => setPaymentPreference("apple_pay")}
              />
              <span>
                <strong className="block">Apple Pay, Google Pay ou cartão pela Stripe</strong>
                <span className="mt-1 block text-ink/65">
                  A carteira disponível aparece em dispositivos compatíveis; cartão fica como alternativa.
                </span>
              </span>
            </label>
          ) : null}
        </div>
      </section>

      {/* O QUE ESTÁ SENDO COMPRADO (29/08/2026).
          Até aqui o checkout mostrava só os totais: a pessoa preenchia CPF e
          endereço sem rever o que ia levar. Com a cor virando variante, três
          linhas podem se chamar "Micropele 0,08mm" e diferir só na cor — é
          exatamente antes de pagar que esse conferido tem que caber.
          Lista SÓ DE LEITURA: os mesmos números que o resumo abaixo já usa
          (cartCheckout.items), sem recalcular nada. Para mudar quantidade ou remover,
          a pessoa volta à sacola. */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-ink">Seu pedido</h2>
        <ul className="flex flex-col divide-y divide-sand rounded-lg border border-sand">
          {cartCheckout.items.map((item) => (
            <li key={item.cartItemId} className="flex items-center gap-3 p-3">
              {item.colorPhotoUrl ? (
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-sand">
                  <Image
                    src={item.colorPhotoUrl}
                    alt={item.variantLabel ?? item.productName}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                </span>
              ) : null}
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-ink">{item.productName}</span>
                {item.variantLabel ? (
                  <span className="text-sm text-ink/60">{item.variantLabel}</span>
                ) : null}
                <span className="text-xs text-ink/50">
                  {item.quantity} ×{" "}
                  {(item.unitPriceCents / 100).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
                {(item.subtotalCents / 100).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </span>
            </li>
          ))}
        </ul>
        <a
          href="/carrinho"
          className="self-start text-sm text-ink underline decoration-gold decoration-2 underline-offset-4"
        >
          Alterar a sacola
        </a>
      </section>

      {/* O total soma o frete só quando ele existe de verdade. Enquanto não
          existir, o resumo mostra "calculado ao preencher o CEP" — nunca
          R$ 0,00, que o cliente leria como frete grátis. */}
      <CheckoutSummary
        subtotalCents={cartCheckout.subtotalSemDescontoCents}
        discountCents={cartCheckout.discountCents}
        shippingCents={frete?.priceCents ?? null}
        totalCents={cartCheckout.totalCents + (frete?.priceCents ?? 0)}
        shippingHint={cotandoFrete ? "calculando…" : "preencha o CEP acima"}
      />

      {frete ? (
        <p className="-mt-2 text-sm text-ink/60">
          {frete.serviceName}
          {frete.etaDays > 0
            ? ` — chega em cerca de ${frete.etaDays} ${frete.etaDays === 1 ? "dia útil" : "dias úteis"} após a postagem.`
            : "."}
        </p>
      ) : null}

      {avisoFrete ? (
        <p className="-mt-2 text-sm text-ink/70" role="status">
          {avisoFrete}
        </p>
      ) : null}

      {/* A cotação no navegador é só informativa. O frete real é recalculado
          no servidor dentro de criarPedidoAction; se falhar ali, o pedido não
          nasce e nada é cobrado. O botão não pode depender do preview de frete,
          senão uma falha momentânea da SuperFrete mata a venda antes mesmo do
          servidor tentar a cotação confiável. */}
      <Button
        type="submit"
        size="lg"
        disabled={enviando || cartCheckout.items.length === 0 || cotandoFrete}
      >
        {enviando
          ? "Enviando…"
          : cartCheckout.items.length === 0
            ? "Sua sacola está vazia"
            : cotandoFrete
            ? "Calculando frete…"
            : "Finalizar pedido"}
      </Button>
    </form>
  );
}
