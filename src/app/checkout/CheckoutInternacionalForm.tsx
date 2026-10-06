"use client";

import { useState, type FormEvent } from "react";
import { lerAtribuicao } from "@/lib/tracking/atribuicao";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";
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
 * A Server Action calcula o subtotal e consulta a tarifa DHL antes de criar
 * pedido. O comprador confirma o valor exibido; na confirmação o servidor
 * recalcula tudo. Nenhum valor vindo deste componente tem autoridade.
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
    exigeCodigoPostal: boolean;
    rotuloRegiao: string | null;
    rotuloPostal: string;
    postalExemplo: string;
  };
  moeda: string;
  itens: Array<{ nome: string; quantidade: number }>;
  avisoImpostosTitulo: string;
  avisoImpostosTexto: string;
  aceiteTexto: string;
}

const COTACAO_COPY: Record<Idioma, { instrucoes: string; produtos: string; frete: string; dias: string; entrega: string; consultando: string; reconfirmando: string; consultar: string; confirmar: string }> = {
  pt: { instrucoes: "Consulte a cotação DHL ao vivo para ver o total exato. Nenhum pedido ou pagamento é criado até você confirmar.", produtos: "Produtos", frete: "Frete", dias: "dias úteis", entrega: "entrega estimada", consultando: "Consultando DHL…", reconfirmando: "Reconfirmando cotação DHL…", consultar: "Consultar frete DHL", confirmar: "Confirmar total e continuar" },
  en: { instrucoes: "Request a live DHL quote to see the exact total. No order or payment is created until you confirm it.", produtos: "Products", frete: "Shipping", dias: "business days", entrega: "estimated delivery", consultando: "Getting DHL quote…", reconfirmando: "Rechecking DHL quote…", consultar: "Get DHL quote", confirmar: "Confirm total and continue" },
  es: { instrucoes: "Solicita la tarifa DHL en vivo para ver el total exacto. No se crea ningún pedido ni pago hasta que lo confirmes.", produtos: "Productos", frete: "Envío", dias: "días hábiles", entrega: "entrega estimada", consultando: "Consultando DHL…", reconfirmando: "Verificando de nuevo DHL…", consultar: "Consultar envío DHL", confirmar: "Confirmar total y continuar" },
  fr: { instrucoes: "Demandez un tarif DHL en direct pour voir le total exact. Aucune commande ni aucun paiement n’est créé avant votre confirmation.", produtos: "Articles", frete: "Livraison", dias: "jours ouvrés", entrega: "livraison estimée", consultando: "Consultation de DHL…", reconfirmando: "Nouvelle vérification DHL…", consultar: "Calculer la livraison DHL", confirmar: "Confirmer le total et continuer" },
  de: { instrucoes: "Rufen Sie ein aktuelles DHL-Angebot ab, um den genauen Gesamtbetrag zu sehen. Vor Ihrer Bestätigung werden weder Bestellung noch Zahlung erstellt.", produtos: "Artikel", frete: "Versand", dias: "Werktage", entrega: "voraussichtliche Lieferung", consultando: "DHL-Angebot wird abgerufen…", reconfirmando: "DHL-Angebot wird erneut geprüft…", consultar: "DHL-Versand berechnen", confirmar: "Gesamtbetrag bestätigen und fortfahren" },
};

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
  const [cotacao, setCotacao] = useState<NonNullable<Awaited<ReturnType<typeof criarPedidoInternacionalAction>>["cotacao"]> | null>(null);
  const t = textos(resumo.idioma);
  const cotacaoCopy = COTACAO_COPY[resumo.idioma];

  function atualizar(campo: keyof FormState, valor: string) {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
    setCotacao(null);
    setAceite(false);
    setErroGeral(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErroGeral(null);
    if (cotacao && !aceite) return;

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
      aceite,
      atribuicao: lerAtribuicao(),
      trackingConsent: window.localStorage.getItem("revera-cookies-opcionais-v1") === "aceito",
      confirmarCotacao: cotacao?.token ?? null,
    };

    setEnviando(true);
    const resultado = await criarPedidoInternacionalAction(payload);
    setEnviando(false);
    if (resultado?.cotacao) {
      setCotacao(resultado.cotacao);
      setAceite(false);
    }

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
              disabled={enviando}
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
              disabled={enviando}
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
              disabled={enviando}
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
              disabled={enviando}
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
              disabled={enviando}
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
              disabled={enviando}
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
                disabled={enviando}
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
                  disabled={enviando}
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
            hint={
              resumo.pais.exigeCodigoPostal
                ? t.hintExemplo(resumo.pais.postalExemplo)
                : t.hintOpcional
            }
            error={erros.codigoPostal}
          >
            {(props) => (
              <input
                {...props}
                disabled={enviando}
                required={resumo.pais.exigeCodigoPostal}
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
            </li>
          ))}
        </ul>
        <p className="border-t border-sand pt-3 text-sm text-ink/70">
          {cotacaoCopy.instrucoes}
        </p>
        {cotacao ? (
          <dl className="mt-2 flex flex-col gap-2 border-t border-sand pt-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{cotacaoCopy.produtos}</dt>
              <dd>{formatarDinheiro(cotacao.subtotalCents, resumo)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>
                {cotacaoCopy.frete} — {cotacao.serviceName}
                {cotacao.etaDays ? ` · ${cotacao.etaDays} ${cotacaoCopy.dias}` : ""}
                {cotacao.deliveryDate ? ` · ${cotacaoCopy.entrega} ${new Intl.DateTimeFormat(resumo.locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(cotacao.deliveryDate))}` : ""}
              </dt>
              <dd>{formatarDinheiro(cotacao.shippingCents, resumo)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-sand pt-2 font-semibold">
              <dt>Total</dt>
              <dd>{formatarDinheiro(cotacao.totalCents, resumo)}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {cotacao ? (
        <section className="flex flex-col gap-3 rounded-lg border border-sand/70 bg-paper p-4">
          <h3 className="text-sm font-medium text-ink">⚠️ {resumo.avisoImpostosTitulo}</h3>
          <p className="text-xs leading-relaxed text-ink/70">{resumo.avisoImpostosTexto}</p>

          <label className="mt-2 flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              disabled={enviando}
              checked={aceite}
              onChange={(e) => setAceite(e.target.checked)}
              className="mt-1 h-4 w-4 accent-ink"
            />
            <span>{resumo.aceiteTexto}</span>
          </label>
          {erros.aceite ? <p className="text-xs text-red-700">{erros.aceite}</p> : null}
        </section>
      ) : null}

      <Button type="submit" disabled={enviando || Boolean(cotacao && !aceite)}>
        {enviando
          ? cotacao
            ? cotacaoCopy.reconfirmando
            : cotacaoCopy.consultando
          : cotacao
            ? cotacaoCopy.confirmar
            : cotacaoCopy.consultar}
      </Button>
    </form>
  );
}

function formatarDinheiro(centavos: number, resumo: ResumoInternacional): string {
  return new Intl.NumberFormat(resumo.locale, {
    style: "currency",
    currency: resumo.moeda,
  }).format(centavos / 100);
}
