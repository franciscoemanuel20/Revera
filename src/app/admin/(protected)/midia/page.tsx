import { createClient } from "@/lib/supabase/server";
import { listarFotosDoRepositorio } from "@/lib/conteudo/fotos-do-repositorio";
import { FotosDoSiteManager, type FotoGerenciavel } from "./FotosDoSiteManager";

export default async function MidiaPage() {
  const supabase = await createClient();

  const fotosDoRepositorio = await listarFotosDoRepositorio();
  const { data, error } = await supabase.from("site_media_assets").select("id, source_path, storage_path, url, nome, tamanho, tipo, ativo").order("created_at", { ascending: false });
  const fotos = (data ?? []) as FotoGerenciavel[];

  return (
    <div className="flex flex-col gap-10 pb-16">
      <h1 className="font-display text-2xl text-ink">Biblioteca de fotos</h1>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Não foi possível carregar a biblioteca. Aplique a migration 19 no Supabase e recarregue esta página.
        </p>
      ) : (
        <FotosDoSiteManager originais={fotosDoRepositorio} fotosIniciais={fotos} />
      )}
    </div>
  );
}
