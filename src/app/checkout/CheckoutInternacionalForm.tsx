"use client";

import { useState, type FormEvent } from "react";
import { lerAtribuicao } from "@/lib/tracking/atribuicao";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";
import { formatarDinheiroParaComprador } from "@/lib/internacional/moeda";
import { textos, type Idioma } from "@/lib/internacional/idioma";
import {
  criarPedidoInternacionalAction,
  type CheckoutInternacionalInput,
} from "./actions-internacional";

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";

/**
 * Formulário do checkout INTERNACIONAL — client irmão do CheckoutForm
 * brasileiro, num arquivo separado de propósito: o fluxo nacional não pode
 * herdar risco daqui.
 *
 * Tudo que envolve dinheiro chega PRONTO do servidor (page.tsx calcula
 * preço, frete e total com prontidaoDoMercado + precosDoCarrinhoNoMercado)
 * e é reconferido na Server Action. Este componente só coleta endereço e o
 * aceite — nenhum valor daqui tem autoridade.
 */

export interface ResumoInternacional {
  /**
   * Idioma e locale viajam como DADO, e o dicionário é importado aqui
   * dentro. Mandar o dicionário por prop não funcionaria: ele tem funções
   * (`envioPorTitulo`, `resumoPrazo`), e função não atravessa a fronteira
   * servidor→cliente. Erro que só aparece em runtime, no checkout.
   */
  idioma: Idioma;
  locale: string;
  pais: {
    iso: string;
    nome: string;
    ddi: string;
    exigeRegiao: boolean;
    rotuloRegiao: string | null;
    rotuloPostal: string;
    postalExemplo: string;
  };
  moeda: string;
  itens: Array<{ nome: string; quantidade: number; subtotalCents: number }>;
  subtotalCents: number;
  frete: {
    carrier: string;
    serviceName: string;
    priceCents: number;
    etaDiasMin: number | null;
    etaDiasMax: number | null;
  };
  totalCents: number;
  avisoImpostosTitulo: string;
  avisoImpostosTexto: string;
  aceiteTexto: string;
}

interface FormState {
  name: string;
  email: string;
  telefone: string;
  empresa: string;
  linha1: string;
  linha2: string;
  cidade: string;
  regiao: string;
  codigoPostal: string;
}

export function CheckoutInternacionalForm({ resumo }: { resumo: ResumoInternacional }) {
  const [campos, setCampos] = useState<FormState>({
    name: "",
    email: "",
    telefone: `+${resumo.pais.ddi} `,
    empresa: "",
    linha1: "",
    linha2: "",
    cidade: "",
    regiao: "",
    codigoPostal: "",
  });
  const [aceite, setAceite] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const t = textos(resumo.idioma);

  function atualizar(campo: keyof FormState, valor: string) {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
  }

  const na = (cents: number) =>
    formatarDinheiroParaComprador(cents, resumo.moeda, resumo.locale);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErroGeral(null);
    if (!aceite) return;

    const payload: CheckoutInternacionalInput = {
      pais: resumo.pais.iso,
      name: campos.name,
      email: campos.email,
      telefone: campos.telefone,
      empresa: campos.empresa.trim() === "" ? null : campos.empresa,
      linha1: campos.linha1,
      linha2: campos.linha2.trim() === "" ? null : campos.linha2,
      cidade: campos.cidade,
      regiao: campos.regiao.trim() === "" ? null : campos.regiao,
      codigoPostal: campos.codigoPostal,
      aceite: true,
      atribuicao: lerAtribuicao(),
    };

    setEnviando(true);
    const resultado = await criarPedidoInternacionalAction(payload);
    setEnviando(false);

    if (resultado?.erro) {
      setErroGeral(resultado.erro);
      setErros(resultado.camposComErro ?? {});
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-8 pb-16" noValidate>
      {erroGeral ? (
        <Toast message={erroGeral} variant="error" onClose={() => setErroGeral(null)} />
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl text-ink">{t.secaoSeusDados}</h2>

        <FormField label={t.labelNome} error={erros.name}>
          {(props) => (
            <input
              {...props}
              required
              value={campos.name}
              onChange={(e) => atualizar("name", e.target.value)}
              className={inputClass}
              autoComplete="name"
            />
          )}
        </FormField>

        <FormField label={t.labelEmail} error={erros.email}>
          {(props) => (
            <input
              {...props}
              required
              type="email"
              value={campos.email}
              onChange={(e) => atualizar("email", e.target.value)}
              className={inputClass}
              autoComplete="email"
            />
          )}
        </FormField>

        <FormField
          label={t.labelTelefone}
          hint={t.hintTelefone(resumo.pais.ddi)}
          error={erros.telefone}
        >
          {(props) => (
            <input
              {...props}
              required
              value={campos.telefone}
              onChange={(e) => atualizar("telefone", e.target.value)}
              className={inputClass}
              autoComplete="tel"
            />
          )}
        </FormField>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl text-ink">
          {t.secaoEndereco(resumo.pais.nome)}
        </h2>

        <FormField label={t.labelEndereco} error={erros.linha1}>
          {(props) => (
            <input
              {...props}
              required
              value={campos.linha1}
              onChange={(e) => atualizar("linha1", e.target.value)}
              className={inputClass}
              autoComplete="address-line1"
            />
          )}
        </FormField>

        <FormField label={t.labelComplemento} hint={t.hintOpcional} error={erros.linha2}>
          {(props) => (
            <input
              {...props}
              value={campos.linha2}
              onChange={(e) => atualizar("linha2", e.target.value)}
              className={inputClass}
              autoComplete="address-line2"
            />
          )}
        </FormField>

        <FormField label={t.labelEmpresa} hint={t.hintOpcional} error={erros.empresa}>
          {(props) => (
            <input
              {...props}
              value={campos.empresa}
              onChange={(e) => atualizar("empresa", e.target.value)}
              className={inputClass}
              autoComplete="organization"
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t.labelCidade} error={erros.cidade}>
            {(props) => (
              <input
                {...props}
                required
                value={campos.cidade}
                onChange={(e) => atualizar("cidade", e.target.value)}
                className={inputClass}
                autoComplete="address-level2"
              />
            )}
          </FormField>

          {resumo.pais.exigeRegiao ? (
            <FormField label={resumo.pais.rotuloRegiao ?? t.labelRegiaoPadrao} error={erros.regiao}>
              {(props) => (
                <input
                  {...props}
                  required
                  value={campos.regiao}
                  onChange={(e) => atualizar("regiao", e.target.value)}
                  className={inputClass}
                  autoComplete="address-level1"
                />
              )}
            </FormField>
          ) : null}

          <FormField
            label={resumo.pais.rotuloPostal}
            hint={t.hintExemplo(resumo.pais.postalExemplo)}
            error={erros.codigoPostal}
          >
            {(props) => (
              <input
                {...props}
                required
                value={campos.codigoPostal}
                onChange={(e) => atualizar("codigoPostal", e.target.value)}
                className={inputClass}
                autoComplete="postal-code"
              />
            )}
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-sand bg-paper p-4">
        <h2 className="font-display text-xl text-ink">{t.resumoTitulo}</h2>
        <ul className="flex flex-col gap-1 text-sm text-ink/80">
          {resumo.itens.map((item, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>
                {item.nome} · {item.quantidade}×
              </span>
              <span>{na(item.subtotalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between text-sm text-ink/80">
          <span>{t.resumoProdutos}</span>
          <span>{na(resumo.subtotalCents)}</span>
        </div>
        <div className="flex justify-between text-sm text-ink/80">
          <span>
            {t.resumoFrete(resumo.frete.carrier)}
            {resumo.frete.etaDiasMin
              ? t.resumoPrazo(resumo.frete.etaDiasMin, resumo.frete.etaDiasMax)
              : ""}
          </span>
          <span>{na(resumo.frete.priceCents)}</span>
        </div>
        <div className="flex justify-between border-t border-sand pt-2 font-medium text-ink">
          <span>{t.resumoTotal}</span>
          {/*
            Sem o código ISO ao lado. Cheguei a pôr ("US$ 1,820.00 USD") pelo
            argumento de casar com a fatura do cartão — e na tela ficou
            redundante, porque a nossa tabela de símbolos já distingue US$,
            A$ e CA$, que era o problema que o código resolveria.
          */}
          <span>{na(resumo.totalCents)}</span>
        </div>
        <p className="text-xs text-ink/60">{t.resumoRessalvaPrazo}</p>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-sand/70 bg-paper p-4">
        <h3 className="text-sm font-medium text-ink">⚠️ {resumo.avisoImpostosTitulo}</h3>
        <p className="text-xs leading-relaxed text-ink/70">{resumo.avisoImpostosTexto}</p>

        <label className="mt-2 flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-1 h-4 w-4 accent-ink"
          />
          <span>{resumo.aceiteTexto}</span>
        </label>
        {erros.aceite ? <p className="text-xs text-red-700">{erros.aceite}</p> : null}
      </section>

      <Button type="submit" disabled={!aceite || enviando}>
        {enviando ? t.botaoEnviando : t.botaoContinuar}
      </Button>
    </form>
  );
}
