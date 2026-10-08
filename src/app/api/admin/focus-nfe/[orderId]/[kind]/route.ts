import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ orderId: string; kind: string }> }) {
  const { orderId, kind } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(orderId) || !["xml", "danfe"].includes(kind))
    return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const { data: admin } = await s.from("admin_users").select("id").eq("id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const db = createAdminClient();
  const { data: row } = await db.from("order_focus_nfe").select("status,xml_storage_path,danfe_storage_path")
    .eq("order_id", orderId).maybeSingle();
  const path = kind === "xml" ? row?.xml_storage_path : row?.danfe_storage_path;
  if (row?.status !== "authorized" || !path || !path.startsWith(`${orderId}/focus/`))
    return NextResponse.json({ error: "Documento indisponível" }, { status: 404 });
  const { data, error } = await db.storage.from("export-documents").download(path);
  if (error || !data) return NextResponse.json({ error: "Documento indisponível" }, { status: 404 });
  return new Response(await data.arrayBuffer(), { headers: {
    "Content-Type": kind === "xml" ? "application/xml" : "application/pdf",
    "Content-Disposition": `attachment; filename="focus-${orderId}.${kind === "xml" ? "xml" : "pdf"}"`,
    "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
  } });
}
