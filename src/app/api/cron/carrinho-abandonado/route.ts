import { NextResponse, type NextRequest } from "next/server";
import { rodadaDeCarrinhoAbandonado } from "@/lib/notificacoes/carrinho-abandonado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron do carrinho abandonado. A Vercel chama de 15 em 15 minutos
 * (`vercel.json`) mandando `Authorization: Bearer $CRON_SECRET`.
 *
 * ===========================================================================
 * POR QUE A ROTA É FECHADA, MESMO SÓ MANDANDO WHATSAPP
 * ===========================================================================
 * Uma URL pública que dispara mensagem paga é um botão de gastar dinheiro
 * exposto na internet. Quem descobrisse o caminho poderia esvaziar o teto
 * diário — e, pior, queimar o limite de marketing da conta na Meta, que já
 * tem caso de "Sending spam" aberto desde 29/08/2026.
 *
 * Sem `CRON_SECRET` definida a rota RECUSA tudo, inclusive a própria Vercel.
 * O contrário — abrir quando a variável falta — é o modo de falha que
 * transforma um esquecimento de configuração em disparo aberto.
 *
 * Devolve 200 mesmo quando não fez nada: para o agendador da Vercel, "não
 * havia ninguém para avisar" é sucesso. Erro de verdade vira log, não 500 —
 * 500 faz o cron ser reexecutado, e reexecução em fluxo que paga por
 * mensagem é o caminho para pagar duas vezes.
 */
export async function GET(req: NextRequest) {
  const segredo = (process.env.CRON_SECRET ?? "").trim();
  if (!segredo) {
    console.error("[cron/carrinho] CRON_SECRET não definida — rodada recusada");
    return new NextResponse("Not Found", { status: 404 });
  }

  const autorizacao = req.headers.get("authorization") ?? "";
  if (autorizacao !== `Bearer ${segredo}`) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const resultado = await rodadaDeCarrinhoAbandonado();
  console.info("[cron/carrinho]", JSON.stringify(resultado));
  return NextResponse.json(resultado, { headers: { "cache-control": "no-store" } });
}
