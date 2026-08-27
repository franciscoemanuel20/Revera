import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatarBRL } from "@/lib/format/money";
import {
  ABA_LABEL,
  ORDEM_DAS_ABAS,
  filtroDaAba,
  type AbaVendas,
} from "@/lib/admin/venda-status";
import {
  buscarVendas,
  inicioDoPeriodo,
  type Ordenacao,
  type Origem,
  type Periodo,
} from "@/lib/admin/vendas-consulta";
import { bandeira, nomeDoPais } from "@/lib/internacional/paises";
import type { ExportStatus } from "@/lib/internacional/exportacao";
import { VendaCard } from "./VendaCard";

/**
 * VENDAS — a central de onde a loja é operada.
 *
 * ===========================================================================
 * O QUE ESTA TELA PRECISA RESPONDER (27/08/2026)
 * ===========================================================================
 * "O que vendeu hoje", "quem ainda não pagou", "o que eu preciso preparar",
 * "o que já foi". Nessa ordem de importância, e sem a pessoa precisar abrir
 * a InfinitePay, a SuperFrete ou o banco.
 *
 * Estado vem por querystring, não por estado de cliente: assim um link
 * ("Aguardando envio") pode ser salvo, compartilhado e aberto já filtrado, e
 * a tela inteira continua sendo renderizada no servidor — o navegador não
 * recebe nem token nem consulta.
 */

const PERIODOS: Array<{ valor: Periodo; label: string }> = [
  { valor: "hoje", label: "Hoje" },
  { valor: "ontem", label: "Ontem" },
  { valor: "7dias", label: "7 dias" },
  { valor: "30dias", label: "30 dias" },
  { valor: "tudo", label: "Tudo" },
];

// Brasil x exterior. Não é uma aba: as abas descrevem o ANDAMENTO da venda,
// e origem é outra pergunta — ela corta todas as abas ao mesmo tempo.
const ORIGENS: Array<{ valor: Origem; label: string }> = [
  { valor: "todas", label: "Todos os países" },
  { valor: "brasil", label: "Brasil" },
  { valor: "internacional", label: "Internacional" },
];

const ORDENS: Array<{ valor: Ordenacao; label: string }> = [
  { valor: "recentes", label: "Mais recentes" },
  { valor: "antigos", label: "Mais antigos" },
  { valor: "maior_valor", label: "Maior valor" },
  { valor: "menor_valor", label: "Menor valor" },
];

function comQuery(base: Record<string, string | undefined>, mudanca: Record<string, string>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...mudanca })) {
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `/admin/pedidos?${s}` : "/admin/pedidos";
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    periodo?: string;
    ordem?: string;
    busca?: string;
    origem?: string;
    pais?: string;
  }>;
}) {
  const sp = await searchParams;
  const aba = (ORDEM_DAS_ABAS.includes(sp.aba as AbaVendas) ? sp.aba : "todas") as AbaVendas;
  const periodo = (["hoje", "ontem", "7dias", "30dias", "tudo"].includes(sp.periodo ?? "")
    ? sp.periodo
    : "tudo") as Periodo;
  const ordem = (["recentes", "antigos", "maior_valor", "menor_valor"].includes(sp.ordem ?? "")
    ? sp.ordem
    : "recentes") as Ordenacao;
  const busca = sp.busca?.trim() || undefined;
  const origem = (["todas", "brasil", "internacional"].includes(sp.origem ?? "")
    ? sp.origem
    : "todas") as Origem;
  const pais = sp.pais?.trim().toUpperCase() || undefined;

  const supabase = await createClient();
  const agora = new Date();

  const [{ vendas, erro }, contadores, resumo] = await Promise.all([
    buscarVendas(supabase, { aba, periodo, ordem, busca, origem, pais }, agora),
    contarPorAba(supabase),
    resumoDeHoje(supabase, agora),
  ]);

  const query = { aba, periodo, ordem, busca, origem, pais };

  // Os países que apareceram de fato nas vendas — não a lista teórica de
  // países suportados. Filtro por país que a loja nunca vendeu é ruído.
  const paisesComVenda = [...new Set(vendas.map((v) => v.pais))].sort();

  if (erro) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl text-ink">Vendas</h1>
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Não foi possível carregar as vendas agora. Se continuar assim, confira se a
          atualização <code>00000000000008_pos_venda.sql</code> já foi aplicada no banco.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-ink">Vendas</h1>

      {/* RESUMO — o que a pessoa quer saber antes de qualquer clique. */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <CardResumo titulo="Vendas hoje" valor={String(resumo.vendasHoje)} />
        <CardResumo titulo="Faturamento hoje" valor={formatarBRL(resumo.faturamentoHoje)} />
        <CardResumo titulo="Aguardando pagamento" valor={String(contadores.pendentes)} />
        <CardResumo
          titulo="Para preparar"
          valor={String(contadores.aguardando_envio)}
          destaque={contadores.aguardando_envio > 0}
        />
        <CardResumo titulo="Enviadas hoje" valor={String(resumo.enviadasHoje)} />
      </section>

      {/* ABAS — visões dos dois eixos, nunca um campo novo. */}
      <nav className="-mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          {ORDEM_DAS_ABAS.map((a) => {
            const ativa = a === aba;
            const n = contadores[a];
            return (
              <li key={a}>
                <Link
                  href={comQuery(query, { aba: a })}
                  className={`inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-sm font-medium ${
                    ativa ? "bg-ink text-white" : "border border-sand bg-white text-ink"
                  }`}
                >
                  {ABA_LABEL[a]}
                  {n > 0 ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        ativa ? "bg-white/20" : "bg-sand text-ink/70"
                      }`}
                    >
                      {n}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* BUSCA E FILTROS */}
      <section className="flex flex-col gap-3">
        <form action="/admin/pedidos" method="get" className="flex gap-2">
          <input type="hidden" name="aba" value={aba} />
          <input type="hidden" name="periodo" value={periodo} />
          <input type="hidden" name="ordem" value={ordem} />
          <input type="hidden" name="origem" value={origem} />
          <input
            type="search"
            name="busca"
            defaultValue={busca ?? ""}
            placeholder="Buscar venda: pedido, cliente ou rastreio"
            className="min-h-12 flex-1 rounded-md border border-sand bg-white px-4 text-sm text-ink"
          />
          <button
            type="submit"
            className="min-h-12 rounded-md bg-ink px-5 text-sm font-medium text-white"
          >
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {ORIGENS.map((o) => (
            <Link
              key={o.valor}
              href={comQuery({ ...query, pais: undefined }, { origem: o.valor })}
              className={`inline-flex min-h-10 items-center rounded-full px-3 text-xs font-medium ${
                origem === o.valor && !pais
                  ? "bg-ink text-white"
                  : "border border-sand bg-white text-ink/70"
              }`}
            >
              {o.label}
            </Link>
          ))}
          {paisesComVenda.length > 1
            ? paisesComVenda.map((p) => (
                <Link
                  key={p}
                  href={comQuery(query, { pais: p })}
                  className={`inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-xs font-medium ${
                    pais === p ? "bg-ink text-white" : "border border-sand bg-white text-ink/70"
                  }`}
                >
                  {bandeira(p)} {nomeDoPais(p)}
                </Link>
              ))
            : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <Link
              key={p.valor}
              href={comQuery(query, { periodo: p.valor })}
              className={`inline-flex min-h-10 items-center rounded-full px-3 text-xs font-medium ${
                periodo === p.valor ? "bg-gold text-ink" : "border border-sand bg-white text-ink/70"
              }`}
            >
              {p.label}
            </Link>
          ))}
          <span className="mx-1 self-center text-xs text-ink/40">|</span>
          {ORDENS.map((o) => (
            <Link
              key={o.valor}
              href={comQuery(query, { ordem: o.valor })}
              className={`inline-flex min-h-10 items-center rounded-full px-3 text-xs font-medium ${
                ordem === o.valor ? "bg-gold text-ink" : "border border-sand bg-white text-ink/70"
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>
      </section>

      {/* A LISTA */}
      {vendas.length === 0 ? (
        <p className="rounded-md border border-sand bg-sand/30 p-6 text-center text-sm text-ink/70">
          {busca
            ? `Nenhuma venda encontrada para "${busca}".`
            : aba === "todas"
              ? "Ainda não há vendas registradas."
              : `Nenhuma venda em "${ABA_LABEL[aba]}" neste período.`}
        </p>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {vendas.map((v) => (
            <VendaCard
              key={v.id}
              id={v.id}
              numero={v.numero}
              criadoEm={v.criadoEm}
              cliente={v.cliente}
              produto={v.produto}
              quantidade={v.quantidade}
              totalCents={v.totalCents}
              cidade={v.cidade}
              uf={v.uf}
              paymentStatus={v.paymentStatus}
              shippingStatus={v.shippingStatus}
              canceladoEm={v.canceladoEm}
              motivoCancelamento={v.motivoCancelamento}
              rastreio={v.rastreio}
              etiquetaUrl={v.etiquetaUrl}
              transportadora={v.transportadora}
              naoVista={v.paymentStatus === "paid" && !v.vistoEm}
              pais={v.pais}
              internacional={v.internacional}
              moeda={v.moeda}
              exportStatus={v.exportStatus as ExportStatus}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function CardResumo({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border p-4 ${
        destaque ? "border-gold bg-gold/10" : "border-sand bg-white"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-ink/60">{titulo}</p>
      <p className="font-display text-xl text-ink">{valor}</p>
    </div>
  );
}

/**
 * Um `count` por aba. São consultas com `head: true`, que não trazem linha
 * nenhuma — só o número. Sete idas ao banco em paralelo custam menos que
 * carregar todos os pedidos para contar em memória.
 */
async function contarPorAba(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Record<AbaVendas, number>> {
  const entradas = await Promise.all(
    ORDEM_DAS_ABAS.map(async (aba) => {
      let q = supabase.from("orders").select("id", { count: "exact", head: true });
      const f = filtroDaAba(aba);
      if (f.paymentStatus) q = q.in("payment_status", f.paymentStatus);
      if (f.shippingStatus) q = q.in("shipping_status", f.shippingStatus);
      if (f.cancelado === true) q = q.not("canceled_at", "is", null);
      if (f.cancelado === false) q = q.is("canceled_at", null);
      const { count } = await q;
      return [aba, count ?? 0] as const;
    })
  );
  return Object.fromEntries(entradas) as Record<AbaVendas, number>;
}

async function resumoDeHoje(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agora: Date
): Promise<{ vendasHoje: number; faturamentoHoje: number; enviadasHoje: number }> {
  const inicio = inicioDoPeriodo("hoje", agora)?.toISOString();
  if (!inicio) return { vendasHoje: 0, faturamentoHoje: 0, enviadasHoje: 0 };

  const [{ data: pagasHoje }, { count: enviadasHoje }] = await Promise.all([
    supabase
      .from("orders")
      .select("total_cents")
      .eq("payment_status", "paid")
      .is("canceled_at", null)
      .gte("created_at", inicio),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("shipping_status", ["shipped", "delivered"])
      .gte("updated_at", inicio),
  ]);

  const linhas = (pagasHoje ?? []) as Array<{ total_cents: number }>;
  return {
    vendasHoje: linhas.length,
    faturamentoHoje: linhas.reduce((s, l) => s + l.total_cents, 0),
    enviadasHoje: enviadasHoje ?? 0,
  };
}
