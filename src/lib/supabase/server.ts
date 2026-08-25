import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Client de servidor (route handler / server component) — ainda usando a
// chave anon + cookies da sessão, então continua sob RLS. Para operação
// administrativa que precisa furar RLS de propósito, use createAdminClient
// abaixo, e só em código que roda no servidor (daí o "server-only" acima:
// importar isto num componente cliente já quebra o build).
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes — " +
        "ainda não existe projeto Supabase real (ver README)."
    );
  }

  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // set() chamado de um Server Component sem middleware de refresh
          // de sessão — inofensivo se houver middleware cuidando disso.
          // Mesmo tratamento silencioso recomendado pela doc do @supabase/ssr.
        }
      },
    },
  });
}

// Client administrativo — service role, ignora RLS por completo. Só para
// rotina de backend que precisa disso de fato (seed, webhook, admin CRUD
// com policy própria checando admin_users). Nunca importar em código que
// também roda no cliente: a service role key não pode vazar para o bundle
// do navegador (ver scripts/verify-no-secrets-in-bundle.mjs).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes — " +
        "ainda não existe projeto Supabase real (ver README)."
    );
  }

  // @supabase/supabase-js puro, sem gerenciamento de cookie — client
  // stateless de servidor.
  return createSupabaseJsClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
