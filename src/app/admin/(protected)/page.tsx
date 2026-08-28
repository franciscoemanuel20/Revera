import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatarTotais, totalizarPorMoeda } from "@/lib/internacional/moeda";
import { STATUS_VENDA_CONFIRMADA } from "@/lib/admin/order-status";

// Dashboard do admin — 26/08/2026, substitui o redirect direto para
// /produtos que existia enquanto Produtos era o único módulo (ver git
// history de src/app/admin/(protected)/page.tsx). Todo número aqui vem de
// consulta real ao banco; nenhum é inventado — se a tabela voltar vazia
// (hoje é o caso: zero pedido no banco), o card mostra 0 e a tela explica
// por quê, em vez de fingir atividade que não existe.
//
// "Hoje" é calculado no fuso de São Paulo (America/Sao_Paulo) via
// Intl.DateTimeFormat com locale "en-CA" (formato YYYY-MM-DD, comparável
// como string) — não `new Date().setHours(0,0,0,0)`, que usaria o fuso do
// servidor (UTC na Vercel), e faria "vendas hoje" virar "vendas hoje em
// Londres" para um negócio brasileiro. Sem dependência nova: Intl é nativo
// do runtime Node/Edge.
function diaBR(isoOuData: string | Date): string {
  const data = typeof isoOuData === "string" ? new Date(isoOuData) : isoOuData;
  return data.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const desde30Dias = new Date(Date.now() - TRINTA_DIAS_MS).toISOString();

  const [
    { data: pedidos30, error: erroPedidos },
    { count: aguardandoEnvio, error: erroAguardando },
    { data: variantesEstoqueBaixo, error: erroEstoque },
    { count: corNovas },
    { count: garantiaNovas },
    { count: profissionalNovas },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, total_cents, currency, created_at")
      .gte("created_at", desde30Dias),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["paid", "preparing"]),
    supabase
      .from("product_variants")
      .select("id, sku, stock_qty, products(name)")
      .lt("stock_qty", 5)
      .eq("is_active", true)
      .order("stock_qty", { ascending: true })
      .limit(50),
    supabase.from("color_help_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("warranty_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("professional_leads").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);

  const semAcessoAoBanco = Boolean(erroPedidos || erroAguardando || erroEstoque);

  const hojeBR = diaBR(new Date());
  const statusVendaConfirmada: string[] = STATUS_VENDA_CONFIRMADA;
  const pedidosConfirmados = (pedidos30 ?? []).filter((p) => statusVendaConfirmada.includes(p.status));
  const pedidosHoje = pedidosConfirmados.filter((p) => diaBR(p.created_at) === hojeBR);

  /**
   * Agrupado por moeda, nunca somado entre elas. Ver totalizarPorMoeda():
   * somar BRL com USD produz um número que não existe em moeda nenhuma, e
   * converter exigiria uma taxa com data e fonte que ainda não foi decidida.
   */
  const totaisHoje = totalizarPorMoeda(pedidosHoje);
  const totaisPeriodo = totalizarPorMoeda(pedidosConfirmados);
  const numeroPedidosPeriodo = pedidosConfirmados.length;
  /**
   * Ticket médio também é por moeda: a média entre 650 reais e 320 dólares
   * não significa nada. Com uma moeda só no período, sai um número só — que
   * é o caso da operação hoje.
   */
  const ticketPorMoeda = totaisPeriodo.map((t) => ({
    moeda: t.moeda,
    minor: t.pedidos > 0 ? Math.round(t.minor / t.pedidos) : 0,
    pedidos: t.pedidos,
  }));

  const semVendaNenhuma = numeroPedidosPeriodo === 0;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-2xl text-ink">Painel</h1>

      {semAcessoAoBanco ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Não foi possível ler os dados de pedidos/estoque agora. Se isto persistir, confira se a
          migration 00000000000005_admin_pedidos_policies.sql já foi aplicada no Supabase.
        </p>
      ) : null}

      {semVendaNenhuma ? (
        <p className="rounded-md border border-sand bg-paper px-4 py-3 text-sm text-ink/70">
          Ainda não há nenhum pedido registrado nos últimos 30 dias — os cards abaixo mostram zero
          porque é a realidade do banco agora, não porque algo quebrou. Assim que o primeiro
          pedido chegar, os números aparecem aqui.
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Cartao titulo="Vendas hoje" valor={formatarTotais(totaisHoje)} />
        <Cartao titulo="Vendas nos últimos 30 dias" valor={formatarTotais(totaisPeriodo)} />
        <Cartao titulo="Pedidos (30 dias)" valor={String(numeroPedidosPeriodo)} />
        <Cartao titulo="Ticket médio (30 dias)" valor={formatarTotais(ticketPorMoeda)} />
        <Cartao
          titulo="Aguardando envio"
          valor={String(aguardandoEnvio ?? 0)}
          rodape={
            <Link href="/admin/pedidos?status=paid" className="text-sm text-ink underline decoration-gold decoration-2 underline-offset-4">
              Ver pedidos
            </Link>
          }
        />
        <Cartao titulo="Produtos com estoque baixo" valor={String((variantesEstoqueBaixo ?? []).length)} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-ink">Solicitações novas</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Cartao
            titulo="Ajuda de cor"
            valor={String(corNovas ?? 0)}
            rodape={
              <Link href="/admin/solicitacoes?tab=cor" className="text-sm text-ink underline decoration-gold decoration-2 underline-offset-4">
                Ver solicitações
              </Link>
            }
          />
          <Cartao
            titulo="Garantia"
            valor={String(garantiaNovas ?? 0)}
            rodape={
              <Link href="/admin/solicitacoes?tab=garantia" className="text-sm text-ink underline decoration-gold decoration-2 underline-offset-4">
                Ver solicitações
              </Link>
            }
          />
          <Cartao
            titulo="Profissionais"
            valor={String(profissionalNovas ?? 0)}
            rodape={
              <Link href="/admin/solicitacoes?tab=profissionais" className="text-sm text-ink underline decoration-gold decoration-2 underline-offset-4">
                Ver solicitações
              </Link>
            }
          />
        </div>
      </section>

      {(variantesEstoqueBaixo ?? []).length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl text-ink">Estoque baixo (abaixo de 5 unidades)</h2>
          <ul className="flex flex-col gap-1 text-sm text-ink/80">
            {(variantesEstoqueBaixo ?? []).map((v) => {
              const produto = v.products as { name: string } | { name: string }[] | null;
              const nomeProduto = Array.isArray(produto) ? produto[0]?.name : produto?.name;
              return (
                <li key={v.id} className="flex justify-between border-b border-sand/60 py-1">
                  <span>
                    {nomeProduto ?? "—"} <span className="text-ink/50">· SKU {v.sku}</span>
                  </span>
                  <span className="font-semibold text-red-700">{v.stock_qty} un.</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Cartao({ titulo, valor, rodape }: { titulo: string; valor: string; rodape?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-sand p-4">
      <span className="eyebrow-ink">{titulo}</span>
      <span className="font-display text-2xl text-ink">{valor}</span>
      {rodape}
    </div>
  );
}
