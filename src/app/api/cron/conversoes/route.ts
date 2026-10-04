import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { processarPurchasePendente } from "@/lib/tracking/despachar";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return new NextResponse("Not Found", { status: 404 });
  }
  try {
    const db = createAdminClient();
    let processed = 0;
    const deadline = Date.now() + 35_000;
    for (let n = 0; n < 100 && Date.now() < deadline; n++) {
      if (!await processarPurchasePendente(db)) break;
      processed++;
    }
    const counts = await Promise.all(["pending", "processing", "blocked", "exhausted"].map(async (state) => {
      const r = await db.from("purchase_outbox").select("order_id", { count: "exact", head: true }).eq("state", state);
      if (r.error) throw new Error("outbox_count_failed");
      return [state, r.count ?? 0] as const;
    }));
    const backlog = Object.fromEntries(counts);
    return NextResponse.json({ ok: true, processed, backlog, hasMore: (backlog.pending ?? 0) + (backlog.processing ?? 0) > 0 }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "outbox_unavailable" }, { status: 503 });
  }
}
