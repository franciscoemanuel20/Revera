import { createClient } from "@/lib/supabase/server";
import { listarFotosDoRepositorio } from "@/lib/conteudo/fotos-do-repositorio";
import { REGISTRO, nomeDaPagina } from "@/lib/conteudo/registro";
import { FotosDoSiteManager, type FotoGerenciavel } from "./FotosDoSiteManager";

export default async function MidiaPage() {
  const supabase = await createClient();

  const fotosDoRepositorio = await listarFotosDoRepositorio();
  const { data, error } = await supabase.from("site_media_assets").select("id, source_path, storage_path, url, nome, tamanho, tipo, categoria, ativo").order("created_at", { ascending: false });
  const fotosBase = (data ?? []) as FotoGerenciavel[];
  const valores = [...new Set(fotosBase.flatMap((foto) => [foto.url, foto.source_path].filter(Boolean) as string[]))];
  const [cores, produtos, banners, textos] = valores.length === 0 ? [[], [], [], []] : await Promise.all([
    supabase.from("colors").select("photo_url, code, name").in("photo_url", valores).then((r) => r.data ?? []),
    supabase.from("product_media").select("url, products(name)").in("url", valores).then((r) => r.data ?? []),
    supabase.from("banners").select("imagem_url, titulo").in("imagem_url", valores).then((r) => r.data ?? []),
    supabase.from("site_texts").select("valor, chave").in("valor", valores).then((r) => r.data ?? []),
  ]);
  const usosPorUrl = new Map<string, string[]>();
  const incluirUso = (valor: string | null, uso: string) => {
    if (!valor) return;
    usosPorUrl.set(valor, [...(usosPorUrl.get(valor) ?? []), uso]);
  };
  for (const cor of cores) incluirUso(cor.photo_url as string | null, `Cor ${cor.code}${cor.name ? ` — ${cor.name}` : ""}`);
  for (const produto of produtos) {
    const nome = (produto.products as { name?: string } | null)?.name ?? "produto";
    incluirUso(produto.url as string | null, `Produto — ${nome}`);
  }
  for (const banner of banners) incluirUso(banner.imagem_url as string | null, `Banner — ${banner.titulo ?? "sem título"}`);
  for (const texto of textos) {
    const chave = texto.chave as keyof typeof REGISTRO;
    const registro = REGISTRO[chave];
    incluirUso(texto.valor as string | null, registro ? `${nomeDaPagina(registro.pagina)} — ${registro.rotulo}` : "Seção do site");
  }
  const fotos = fotosBase.map((foto) => ({
    ...foto,
    usos: [...new Set([...(usosPorUrl.get(foto.url) ?? []), ...(foto.source_path ? usosPorUrl.get(foto.source_path) ?? [] : [])])],
  }));

  return (
    <div className="flex flex-col gap-10 pb-16">
      <div>
        <h1 className="font-display text-2xl text-ink">Biblioteca de mídias</h1>
        <p className="mt-1 text-sm text-ink/60">Fotos e vídeos usados no site, organizados em um único lugar.</p>
      </div>

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
