import { createClient } from "@/lib/supabase/server";
import { AdminTable, type AdminTableColumn } from "@/components/ui/AdminTable";
import { formatarValorNaMoeda } from "@/lib/internacional/moeda";
import {
  buscarRecuperacao,
  lerConfigRecuperacao,
  ETAPA_LABEL,
  type EtapaExibida,
} from "@/lib/admin/recuperacao-consulta";
import { TEXTO_REENGAJAMENTO } from "@/lib/notificacoes/reengajamento-checkout";
import { ReengajamentoUnico } from "./ReengajamentoUnico";

/**
 * RECUPERAÇÃO DE CARRINHO — a vitrine do que o cron
 * (`/api/cron/carrinho-abandonado`) está decidindo, pedido a pedido.
 *
 * ===========================================================================
 * POR QUE ESTA TELA (11/09/2026)
 * ===========================================================================
 * O cron sempre existiu; o que faltava era um lugar para responder, sem
 * abrir log da Vercel, "por que este pedido pendente não recebeu aviso?".
 * A resposta certa quase nunca é "a Meta recusou" — costuma ser "ainda não
 * é hora", "sem telefone válido" ou, mais comum, "o canal está desligado ou
 * sem modelo aprovado". Confundir essas causas foi exatamente o achado de
 * 11/09/2026 em carrinho-abandonado.ts: um contador só (`envio_recusado`)
 * escondia que a maioria dos casos nunca chegou a ser recusada — nunca foi
 * nem tentada. O bloco de configuração abaixo aparece ANTES da lista para
 * que essa causa mais comum salte aos olhos primeiro.
 */
export default async function RecuperacaoPage() {
  const supabase = await createClient();
  const agora = new Date();

  const { pedidos, resumo, erro } = await buscarRecuperacao(supabase, agora);
  const config = lerConfigRecuperacao();

  if (erro) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl text-ink">Recuperação de carrinho</h1>
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Não foi possível carregar os pedidos pendentes agora. Se continuar assim, confira se a
          migration <code>00000000000021_recuperacao_checkout_segundo_lembrete.sql</code> já foi
          aplicada no banco.
        </p>
      </div>
    );
  }

  const canalDesligado = config.modo === "desligado";
  const canalMetaNaoSuportado = config.modo === "meta";
  const canalSimulado = config.modo === "simulado";
  const semTemplate =
    config.modo === "clint" &&
    (!config.templatePrimeiroConfigurado || !config.templateUltimoConfigurado);

  const columns: AdminTableColumn[] = [
    { key: "pedido", label: "Pedido" },
    { key: "cliente", label: "Cliente" },
    { key: "valor", label: "Valor" },
    { key: "criado", label: "Abandonado há" },
    { key: "etapa", label: "Etapa" },
    { key: "detalhe", label: "Detalhe" },
  ];

  const rows = pedidos.map((p) => ({
    pedido: (
      <a href={`/admin/pedidos/${p.id}`} className="text-ink underline decoration-sand hover:decoration-ink">
        {p.orderNumber}
      </a>
    ),
    cliente: (
      <div className="flex flex-col">
        <span>{p.cliente}</span>
        <span className="text-xs text-ink/60">{p.telefone ?? "sem telefone"}</span>
      </div>
    ),
    valor: formatarValorNaMoeda(p.totalCents, p.currency),
    criado: horasDesde(p.criadoEm, agora),
    etapa: <EtapaBadge etapa={p.etapa} />,
    detalhe: <span className="text-xs text-ink/70">{detalheDoPedido(p)}</span>,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Recuperação de carrinho</h1>
        <p className="text-sm text-ink/60">
          Pedidos pendentes de pagamento e em que pé está o aviso de WhatsApp de cada um.
        </p>
      </div>

      {canalDesligado || canalMetaNaoSuportado || canalSimulado || semTemplate ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">
            {canalDesligado
              ? "Envio de WhatsApp desligado — nenhum aviso está saindo."
              : canalMetaNaoSuportado
                ? "Modo Meta não suportado neste fluxo — nenhum aviso de recuperação está saindo."
                : canalSimulado
                  ? "Ambiente fora de produção — os avisos são só simulados (log, sem envio real)."
                  : "Faltam modelos configurados para o canal Clint."}
          </p>
          <p className="mt-1 text-amber-800">
            {canalDesligado
              ? 'WHATSAPP_PROVIDER não está definido como "clint" (ou "meta") no ambiente. Isto não é uma recusa da Meta nem da Clint — é configuração pendente.'
              : canalMetaNaoSuportado
                ? 'O cron bloqueia WHATSAPP_PROVIDER="meta" para carrinho abandonado, porque este fluxo ainda não tem template Meta próprio. Use Clint para enviar recuperação.'
                : canalSimulado
                  ? "Fora de produção o envio real fica desligado de propósito (ver modoWhatsApp() em whatsapp.ts), para nenhum teste mandar mensagem paga de verdade."
                  : "CLINT_TEMPLATE_CARRINHO_PRIMEIRO_ID e/ou CLINT_TEMPLATE_CARRINHO_ULTIMO_ID não estão definidos. Sem eles o pedido nem chega a ser reservado — ver docs/recuperacao-checkout-abandonado.md."}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Cartao label="Pendentes" valor={resumo.total} />
        <Cartao label="Aguardando janela" valor={resumo.aguardandoJanela} />
        <Cartao label="Prontos para enviar" valor={resumo.elegiveis} />
        <Cartao label="1º aviso enviado" valor={resumo.primeiroEnviado} />
        <Cartao label="Último aviso enviado" valor={resumo.ultimoEnviado} />
        <Cartao
          label="Recusados de verdade"
          valor={resumo.recusadosDeVerdade}
          destaque={resumo.recusadosDeVerdade > 0}
        />
      </div>

      <ReengajamentoUnico texto={TEXTO_REENGAJAMENTO} />

      <AdminTable columns={columns} rows={rows} emptyMessage="Nenhum pedido pendente agora." />
    </div>
  );
}

function Cartao({ label, valor, destaque }: { label: string; valor: number; destaque?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 ${destaque ? "border-red-300 bg-red-50" : "border-sand"}`}
    >
      <p className={`text-2xl font-display ${destaque ? "text-red-700" : "text-ink"}`}>{valor}</p>
      <p className="text-xs text-ink/60">{label}</p>
    </div>
  );
}

const BADGE_TOM: Record<EtapaExibida, string> = {
  aguardando_janela: "bg-sand text-ink/70",
  elegivel_primeiro: "bg-gold/30 text-ink",
  elegivel_ultimo: "bg-gold/30 text-ink",
  primeiro_enviado: "bg-emerald-100 text-emerald-800",
  ultimo_enviado: "bg-emerald-100 text-emerald-800",
  primeiro_recusado: "bg-red-100 text-red-800",
  ultimo_recusado: "bg-red-100 text-red-800",
  fora_da_janela: "bg-sand text-ink/50",
  nao_elegivel: "bg-sand text-ink/50",
};

function EtapaBadge({ etapa }: { etapa: EtapaExibida }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TOM[etapa]}`}>
      {ETAPA_LABEL[etapa]}
    </span>
  );
}

function detalheDoPedido(p: {
  etapa: EtapaExibida;
  motivoNaoElegivel: string | null;
  primeiro: { ultimoErro: string | null } | null;
  ultimo: { ultimoErro: string | null } | null;
}): string {
  if (p.etapa === "primeiro_recusado") return p.primeiro?.ultimoErro ?? "";
  if (p.etapa === "ultimo_recusado") return p.ultimo?.ultimoErro ?? "";
  if (p.motivoNaoElegivel) return p.motivoNaoElegivel;
  return "";
}

// Idade em texto simples, sem biblioteca — mesmo padrão do resto do admin
// (ver ChecklistExportacao.tsx), para não introduzir uma dependência só
// para "há 3h".
function horasDesde(iso: string, agora: Date): string {
  const ms = agora.getTime() - new Date(iso).getTime();
  const horas = Math.floor(ms / 3600_000);
  if (horas < 1) return "menos de 1h";
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  return `${dias}d`;
}
