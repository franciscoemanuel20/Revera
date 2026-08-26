import "server-only";
import { createClient } from "@/lib/supabase/server";

// Trilha de auditoria do admin — decidida na auditoria de 26/08/2026 que
// criou os módulos além de Produtos: toda escrita administrativa (pedido,
// preço, solicitação, conteúdo, configuração) grava uma linha em
// audit_logs (admin_user_id, action, entity_type, entity_id, diff).
//
// Extraído para cá em vez de repetido em cada Server Action nova porque
// admin_user_id precisa vir de supabase.auth.getUser() — esquecer essa
// chamada numa action nova e gravar null ali é o tipo de erro que só
// aparece meses depois, quando alguém perguntar "quem mudou isso".
//
// Recebe o client de SESSÃO (createClient(), sob RLS), não
// createAdminClient(): audit_logs também é regida pela policy "admin manage
// audit_logs" de supabase/migrations/00000000000005_admin_pedidos_policies.sql,
// e é o mesmo client que já fez a escrita sendo registrada — abrir um
// segundo client só para isto multiplicaria conexão sem motivo.
//
// Falha ao gravar auditoria NUNCA derruba a ação principal (pedido mudou de
// status, produto foi salvo): perder o rastro é ruim, mas travar a
// operação de verdade por causa do rastro seria pior. Por isso só loga no
// console — quem chamar isto não precisa (nem deve) tratar o retorno.
//
// As ações de produto já existentes (src/app/admin/(protected)/produtos/actions.ts)
// não foram reescritas para usar isto — não fazia parte do escopo desta
// entrega mexer no que já funcionava — mas o helper está pronto para quando
// alguém fizer essa ligação.
type ClienteSupabase = Awaited<ReturnType<typeof createClient>>;

export interface ParametrosAuditoria {
  action: string;
  entityType: string;
  entityId: string | null;
  diff?: unknown;
}

export async function registrarAuditoria(
  supabase: ClienteSupabase,
  params: ParametrosAuditoria
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("audit_logs").insert({
    admin_user_id: user?.id ?? null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    diff: (params.diff ?? null) as never,
  });

  if (error) {
    console.error("[audit] falha ao registrar", params.action, params.entityType, error);
  }
}
