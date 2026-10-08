import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { reenviarConfirmacoesPendentes } from "@/lib/notificacoes/confirmacao-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reenvia os e-mails de confirmação ao cliente que não saíram (07/10/2026).
 * O e-mail leva a informação de desistência exigida pela UE; um envio
 * perdido não pode ficar perdido calado. Mesma porta fechada dos outros
 * crons: sem CRON_SECRET, 404.
 */
export async function GET(req: NextRequest) {
  const segredo = (process.env.CRON_SECRET ?? "").trim();
  if (!segredo || (req.headers.get("authorization") ?? "") !== `Bearer ${segredo}`) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const reenviados = await reenviarConfirmacoesPendentes(createAdminClient());
  console.info("[cron/confirmacao-cliente]", JSON.stringify({ reenviados }));
  return NextResponse.json({ ok: true, reenviados }, { headers: { "cache-control": "no-store" } });
}
