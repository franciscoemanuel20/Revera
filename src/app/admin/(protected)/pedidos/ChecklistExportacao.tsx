import {
  EXPORT_STATUS_BADGE,
  EXPORT_STATUS_LABEL,
  type EtapaExportacao,
  type ExportStatus,
} from "@/lib/internacional/exportacao";
import { bandeira, nomeDoPais } from "@/lib/internacional/paises";

/** Estado calculado das evidências do pedido, compartilhado com as ações. */
export function ChecklistExportacao({
  pais,
  etapas,
  status,
  bloqueios,
}: {
  pais: string;
  etapas: EtapaExportacao[];
  status: ExportStatus;
  bloqueios: string[];
}) {

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-sand p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-ink">
          Exportação · {bandeira(pais)} {nomeDoPais(pais)}
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${EXPORT_STATUS_BADGE[status]}`}
        >
          {EXPORT_STATUS_LABEL[status]}
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {etapas.map((etapa) => (
          <li key={etapa.chave} className="flex gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 select-none font-mono text-sm ${
                etapa.estado === "pronto"
                  ? "text-moss"
                  : etapa.estado === "pendente"
                    ? "text-gold-deep"
                    : "text-ink/30"
              }`}
            >
              {etapa.estado === "pronto" ? "✓" : etapa.estado === "pendente" ? "•" : "—"}
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-ink">
                {etapa.titulo}
                {etapa.estado === "nao_configurado" ? (
                  <span className="ml-2 rounded bg-ink/8 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink/50">
                    Não configurado
                  </span>
                ) : null}
              </p>
              {etapa.detalhe ? (
                <p className="text-sm text-ink/60">{etapa.detalhe}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {bloqueios.length > 0 ? (
        <p className="rounded-md border border-sand bg-sand/40 p-3 text-sm text-ink/70">
          Este pedido <strong>ainda não pode ser despachado</strong>. {bloqueios.length} pendência(s)
          precisam ser resolvidas e conferidas.
        </p>
      ) : null}
    </section>
  );
}
