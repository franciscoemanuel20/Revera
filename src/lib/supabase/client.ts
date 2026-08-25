"use client";

import { createBrowserClient } from "@supabase/ssr";

// Client de navegador — usa a chave anon (respeita RLS; ver
// supabase/migrations/00000000000001_init.sql para as policies públicas).
// Nunca importar isto num arquivo que também usa a service role key.
//
// Neste scaffold não há projeto Supabase real por trás — NEXT_PUBLIC_SUPABASE_URL
// e NEXT_PUBLIC_SUPABASE_ANON_KEY ficam vazias até o Francisco decidir criar
// o projeto (ver README, "decisões pendentes"). Chamar isto sem as env
// configuradas lança em runtime, de propósito: preferimos falhar alto a
// silenciosamente apontar para lugar nenhum.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes — " +
        "ainda não existe projeto Supabase real (ver README). Preencha o " +
        ".env.local quando o projeto for criado."
    );
  }

  return createBrowserClient(url, anonKey);
}
