import {
  EXPORT_STATUS_BADGE,
  EXPORT_STATUS_LABEL,
  type EtapaExportacao,
  type ExportStatus,
} from "@/lib/internacional/exportacao";
import { bandeira, nomeDoPais } from "@/lib/internacional/paises";

/**
 * O bloco de exportação — e a diferença entre "falta fazer" e "não existe".
 *
 * Três marcadores, não dois:
 *
 *   ✓  pronto            — feito
 *   •  pendente          — falta fazer, e dá para fazer agora
 *   —  não configurado   — a peça não existe no sistema ainda
 *
 * O terceiro é o que impede a tela de mentir. Hoje NF-e, Commercial Invoice
 * e DHL estão todos nele, e mostrá-los como "pendente" faria parecer que a
 * responsável está devendo alguma coisa — quando na verdade ninguém pode
 * fazer, porque não foi contratado.
 *
 * Por isso também não existe botão nenhum aqui. Botão que abre uma tela
 * dizendo "ainda não disponível" é pior que a ausência do botão.
 */
export function ChecklistExportacao({
  pais,
  etapas,
  status,
}: {
  pais: string;
  etapas: EtapaExportacao[];
  status: ExportStatus;
}) {
  const naoConfigurados = etapas.filter((e) => e.estado === "nao_configurado");

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

      {naoConfigurados.length > 0 ? (
        <p className="rounded-md border border-sand bg-sand/40 p-3 text-sm text-ink/70">
          Este pedido <strong>ainda não pode ser despachado</strong>. Faltam{" "}
          {naoConfigurados.length === 1 ? "peças" : `${naoConfigurados.length} peças`} que
          dependem de contratação: {naoConfigurados.map((e) => e.titulo).join(", ")}.
        </p>
      ) : null}
    </section>
  );
}
