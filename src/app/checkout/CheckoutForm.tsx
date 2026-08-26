"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";

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
export function CheckoutForm() {
  const { cart } = useCart();
  const [campos, setCampos] = useState<FormState>(ESTADO_INICIAL);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [avisoCep, setAvisoCep] = useState<string | null>(null);

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
    if (cart.items.length === 0) return;
    iniciouCheckout.current = true;

    medirIniciarCheckout({
      itens: cart.items.map((i) => ({
        variantId: i.variantId,
        nome: i.productName,
        quantidade: i.quantity,
        precoUnitarioCents: i.unitPriceCents,
      })),
      totalCents: cart.totalCents,
    });
  }, [cart.items, cart.totalCents]);
  // null = ainda não cotado (ou cotação falhou). NÃO é 0 — mostrar R$ 0,00
  // pareceria frete grátis, que é promessa que ninguém fez.
  const [frete, setFrete] = useState<{
    priceCents: number;
    serviceName: string;
    etaDays: number;
  } | null>(null);
  const [cotandoFrete, setCotandoFrete] = useState(false);
  const [avisoFrete, setAvisoFrete] = useState<string | null>(null);

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
  async function buscarEndereco(cepDigitado: string) {
    const digitos = cepDigitado.replace(/\D/g, "");
    setAvisoCep(null);

    if (digitos.length !== 8) return;

    setBuscandoCep(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      if (!resposta.ok) {
        setAvisoCep("Não foi possível consultar o CEP agora — preencha o endereço manualmente.");
        return;
      }

      const dados = (await resposta.json()) as RespostaViaCep;
      if (dados.erro) {
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
    if (digitos.length !== 8 || cart.items.length === 0) {
      setFrete(null);
      return;
    }

    setCotandoFrete(true);
    setAvisoFrete(null);
    try {
      const r = await fetch("/api/frete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cep: digitos }),
      });
      const dados = (await r.json()) as {
        disponivel?: boolean;
        priceCents?: number;
        serviceName?: string;
        etaDays?: number;
      };

      if (!r.ok || !dados.disponivel || typeof dados.priceCents !== "number") {
        setFrete(null);
        setAvisoFrete(
          "Não conseguimos calcular o frete agora. Você pode continuar — combinamos o envio depois da confirmação."
        );
        return;
      }

      setFrete({
        priceCents: dados.priceCents,
        serviceName: dados.serviceName ?? "",
        etaDays: dados.etaDays ?? 0,
      });
    } catch {
      setFrete(null);
      setAvisoFrete(
        "Não conseguimos calcular o frete agora. Você pode continuar — combinamos o envio depois da confirmação."
      );
    } finally {
      setCotandoFrete(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErroGeral(null);

    if (cart.items.length === 0) {
      setErroGeral("Sua sacola está vazia — volte e adicione algo antes de finalizar.");
      return;
    }

    const complementoLimpo = campos.complement.trim();
    const payload: CheckoutInput = {
      ...campos,
      complement: complementoLimpo === "" ? null : complementoLimpo,
      // Lido AQUI, no envio, e não na montagem da tela: os cookies do pixel
      // podem só existir depois que os scripts carregaram, e no submit já
      // carregaram com folga.
      atribuicao: lerAtribuicao(),
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
      setErros(resultado.camposComErro ?? {});
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-8 pb-16" noValidate>
      {erroGeral ? <Toast message={erroGeral} variant="error" onClose={() => setErroGeral(null)} /> : null}

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
              onBlur={(e) => {
                void buscarEndereco(e.target.value);
                void cotarFrete(e.target.value);
              }}
              className={inputClass}
              inputMode="numeric"
              maxLength={9}
              autoComplete="postal-code"
            />
          )}
        </FormField>

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

      {/* O total soma o frete só quando ele existe de verdade. Enquanto não
          existir, o resumo mostra "calculado ao preencher o CEP" — nunca
          R$ 0,00, que o cliente leria como frete grátis. */}
      <CheckoutSummary
        subtotalCents={cart.subtotalSemDescontoCents}
        discountCents={cart.discountCents}
        shippingCents={frete?.priceCents ?? null}
        totalCents={cart.totalCents + (frete?.priceCents ?? 0)}
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

      <Button type="submit" size="lg" disabled={enviando || cart.items.length === 0}>
        {enviando ? "Enviando…" : "Finalizar pedido"}
      </Button>
    </form>
  );
}
