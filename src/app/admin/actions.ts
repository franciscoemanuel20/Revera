"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Logout do admin. Server Action em vez de client chamando supabase.auth
// direto porque o cookie de sessão que precisa ser apagado é HttpOnly
// (gravado pelo server client) — só o servidor consegue limpar. O layout
// (src/app/admin/layout.tsx) referencia isto direto num <form action={...}>,
// sem precisar de um client component só para o botão "Sair".
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
