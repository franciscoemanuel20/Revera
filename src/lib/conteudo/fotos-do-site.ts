import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";

/** Valor persistido quando uma imagem de conteúdo foi deliberadamente removida. */
export const MIDIA_REMOVIDA = "__MIDIA_REMOVIDA__";

function clienteLeitura() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseJsClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Resolve caminhos que vieram no deploy para a cópia administrada no
 * Storage. Sem linha (antes da migração ou banco indisponível), mantém o
 * caminho original; uma linha inativa devolve string vazia, para que a tela
 * possa não renderizar a mídia apagada.
 */
export async function urlsDasFotosDoSite(caminhos: string[]): Promise<Map<string, string>> {
  const resultado = new Map(caminhos.map((caminho) => [caminho, caminho]));
  if (caminhos.length === 0) return resultado;
  try {
    const supabase = clienteLeitura();
    if (!supabase) return resultado;
    const { data, error } = await supabase
      .from("site_media_assets")
      .select("source_path, url, ativo")
      .in("source_path", caminhos);
    if (error || !data) return resultado;
    for (const linha of data) {
      if (linha.source_path) {
        resultado.set(linha.source_path as string, linha.ativo ? String(linha.url ?? "") : "");
      }
    }
  } catch {
    // Falha de banco nunca tira as fotos do ar: o código segue como piso.
  }
  return resultado;
}

export async function urlDaFotoDoSite(caminho: string): Promise<string> {
  return (await urlsDasFotosDoSite([caminho])).get(caminho) ?? caminho;
}
