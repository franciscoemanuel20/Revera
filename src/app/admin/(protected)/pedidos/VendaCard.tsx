"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ENVIO_BADGE,
  ENVIO_LABEL,
  PAGAMENTO_BADGE,
  PAGAMENTO_LABEL,
  type PaymentStatusValue,
  type ShippingStatusValue,
} from "@/lib/admin/venda-status";
import { formatarBRL } from "@/lib/format/money";
import { bandeira, nomeDoPais } from "@/lib/internacional/paises";
import { dinheiro, ehMoedaSuportada, formatarDinheiro } from "@/lib/internacional/moeda";
import { EXPORT_STATUS_BADGE, EXPORT_STATUS_LABEL, type ExportStatus } from "@/lib/internacional/exportacao";
import { formatarDataHora } from "@/lib/format/date";

export interface VendaCardProps {
  id: string;
  numero: string;
  criadoEm: string;
  cliente: string;
  produto: string;
  quantidade: number;
  totalCents: number;
  cidade: string | null;
  uf: string | null;
  paymentStatus: PaymentStatusValue;
  shippingStatus: ShippingStatusValue;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  rastreio: string | null;
  etiquetaUrl: string | null;
  transportadora: string | null;
  naoVista: boolean;
  pais: string;
  internacional: boolean;
  moeda: string;
  exportStatus: ExportStatus;
}

/**
 * O valor sai SEMPRE na moeda em que o cliente foi cobrado. Converter para
 * real na tela do admin pareceria uma gentileza e seria um erro: a
 * responsável precisa reconhecer o número que aparece no extrato e na
 * Commercial Invoice, e nenhum dos dois está em reais numa venda em dólar.
 */
function formatarValor(minor: number, moeda: string): string {
  if (!ehMoedaSuportada(moeda)) return formatarBRL(minor);
  return formatarDinheiro(dinheiro(minor, moeda));
}

/**
 * Um pedido, em card — nunca em linha de tabela.
 *
 * Tabela larga no celular vira rolagem horizontal, e a responsável opera
 * esta loja pelo telefone. Card empilha, cabe na tela e deixa o alvo do
 * toque grande (min-h-12 ≈ 48px, que é o mínimo confortável para o polegar).
 *
 * Cor nunca é a única informação: todo badge traz a palavra escrita. Quem
 * enxerga pouca diferença entre verde e laranja continua lendo o status.
 */
export function VendaCard(props: VendaCardProps) {
  const [copiado, setCopiado] = useState(false);

  async function copiarRastreio() {
    if (!props.rastreio) return;
    try {
      await navigator.clipboard.writeText(props.rastreio);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência (acontece em
      // WebView e em http). O código continua visível no card para copiar
      // com o dedo — não vale quebrar a tela por causa disto.
      setCopiado(false);
    }
  }

  const cancelado = Boolean(props.canceladoEm);

  return (
    <article
      className={`flex flex-col gap-3 rounded-lg border p-4 ${
        cancelado ? "border-sand bg-sand/30 opacity-90" : "border-sand bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {props.naoVista ? (
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-gold"
              aria-label="Venda nova"
              title="Venda nova"
            />
          ) : null}
          <div>
            <p className="font-mono text-sm font-semibold text-ink">{props.numero}</p>
            <p className="text-xs text-ink/60">{formatarDataHora(props.criadoEm)}</p>
          </div>
        </div>
        <p className="font-display text-lg text-ink">
          {formatarValor(props.totalCents, props.moeda)}
        </p>
      </div>

      <div className="text-sm text-ink">
        <p className="font-medium">{props.cliente}</p>
        <p className="text-ink/70">
          {props.produto} · {props.quantidade} {props.quantidade === 1 ? "unidade" : "unidades"}
        </p>
        <p className="text-ink/60">
          {props.cidade ? `${props.cidade}${props.uf ? `/${props.uf}` : ""} · ` : ""}
          {bandeira(props.pais)} {nomeDoPais(props.pais)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {cancelado ? (
          <span className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-800">
            Cancelado
          </span>
        ) : (
          <>
            <span
              className={`rounded-full px-2 py-1 font-medium ${PAGAMENTO_BADGE[props.paymentStatus]}`}
            >
              {PAGAMENTO_LABEL[props.paymentStatus]}
            </span>
            <span
              className={`rounded-full px-2 py-1 font-medium ${ENVIO_BADGE[props.shippingStatus]}`}
            >
              {ENVIO_LABEL[props.shippingStatus]}
            </span>
            {/* O terceiro selo só existe quando há exportação. Pedido
                nacional não ganha etapa que não lhe diz respeito. */}
            {props.internacional ? (
              <span
                className={`rounded-full px-2 py-1 font-medium ${EXPORT_STATUS_BADGE[props.exportStatus]}`}
              >
                Exportação: {EXPORT_STATUS_LABEL[props.exportStatus]}
              </span>
            ) : null}
          </>
        )}
      </div>

      {cancelado && props.motivoCancelamento ? (
        <p className="text-xs text-ink/60">Motivo: {props.motivoCancelamento}</p>
      ) : null}

      {props.rastreio ? (
        <p className="text-xs text-ink/70">
          {props.transportadora ? `${props.transportadora} · ` : ""}
          <span className="font-mono">{props.rastreio}</span>
        </p>
      ) : null}

      {/* Só as ações que fazem sentido AGORA. Botão que não serve para este
          estado não aparece cinza com explicação: não aparece. */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/pedidos/${props.id}`}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-md bg-ink px-4 text-sm font-medium text-white sm:flex-none"
        >
          Ver pedido
        </Link>

        {!cancelado && props.etiquetaUrl ? (
          <a
            href={props.etiquetaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-md border border-ink/20 px-4 text-sm font-medium text-ink sm:flex-none"
          >
            Imprimir etiqueta
          </a>
        ) : null}

        {!cancelado && props.rastreio ? (
          <button
            type="button"
            onClick={copiarRastreio}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-md border border-ink/20 px-4 text-sm font-medium text-ink sm:flex-none"
          >
            {copiado ? "Copiado!" : "Copiar rastreio"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
