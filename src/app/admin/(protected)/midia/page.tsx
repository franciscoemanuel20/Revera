import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_MIDIA, formatarBytes } from "@/lib/conteudo/midia";
import { MidiaManager, type FotoEnviada } from "./MidiaManager";

// Extensões de IMAGEM que a seção somente-leitura mostra. Vídeo (há um em
// public/media/hero/implantacao.mp4) fica de fora desta lista de propósito:
// a missão pediu miniatura de foto, e gerar preview de vídeo estático a
// partir de um arquivo do disco exigiria decodificar o .mp4 (ffmpeg ou
// afim) — trabalho que esta tela não precisa fazer para cumprir o pedido.
const EXTENSOES_IMAGEM = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

interface FotoDoRepositorio {
  caminho: string; // já é a URL pública — public/ é servido em "/" pelo Next
  tamanho: number;
}

export default async function MidiaPage() {
  const supabase = await createClient();

  // list("") pede o nível raiz do bucket. enviarImagem (actions.ts) nunca
  // grava em subpasta, então isto já é a lista inteira — não precisa
  // percorrer recursivamente como a varredura de public/media abaixo.
  const { data: objetos, error: erroStorage } = await supabase.storage
    .from(BUCKET_MIDIA)
    .list("", { sortBy: { column: "created_at", order: "desc" } });

  const fotosEnviadas: FotoEnviada[] = (objetos ?? [])
    // list() também devolve "pastas" nesse formato (sem metadata) quando
    // existirem — filtrar por metadata presente garante que só arquivo de
    // verdade apareça na grade, mesmo que alguém crie uma subpasta um dia.
    .filter((item) => item.metadata != null)
    .map((item) => {
      const metadata = item.metadata as { size?: number; mimetype?: string } | null;
      return {
        caminho: item.name,
        nome: item.name,
        tamanho: metadata?.size ?? 0,
        tipo: metadata?.mimetype ?? "application/octet-stream",
        criadoEm: item.created_at ?? new Date().toISOString(),
        url: supabase.storage.from(BUCKET_MIDIA).getPublicUrl(item.name).data.publicUrl,
      };
    });

  const fotosDoRepositorio = await listarFotosDoRepositorio();

  return (
    <div className="flex flex-col gap-10 pb-16">
      <h1 className="font-display text-2xl text-ink">Biblioteca de fotos</h1>

      {erroStorage ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Não foi possível carregar as fotos enviadas pelo painel. Se isto persistir, confira se a
          migration 00000000000012_conteudo_editavel.sql já foi aplicada no Supabase — é ela que cria o
          espaço de armazenamento ("site-media") usado por esta tela.
        </p>
      ) : (
        <MidiaManager fotosIniciais={fotosEnviadas} />
      )}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-xl text-ink">Fotos que vieram com o site</h2>
          <p className="text-sm text-ink/70">
            Estas fotos fazem parte do código do site, não do painel. Trocar qualquer uma delas exige um
            deploy — por isso não há botão de excluir aqui.
          </p>
        </div>

        {fotosDoRepositorio.length === 0 ? (
          <p className="text-sm text-ink/60">Nenhuma foto encontrada em public/media.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {fotosDoRepositorio.map((foto) => (
              <figure key={foto.caminho} className="flex flex-col gap-2 rounded-md border border-sand p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- arquivo
                    estático de public/, não vale a pena passar pelo otimizador
                    de imagem do Next só para uma tela interna de conferência. */}
                <img src={foto.caminho} alt="" className="aspect-square w-full rounded object-cover" />
                <figcaption className="truncate text-xs text-ink" title={foto.caminho}>
                  {foto.caminho}
                </figcaption>
                <span className="text-xs text-ink/60">{formatarBytes(foto.tamanho)}</span>
              </figure>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Varre public/media recursivamente. O caminho relativo a public/ já É a URL
 * pública (o Next serve tudo dentro de public/ na raiz do site) — não existe
 * tabela nem API para essa lista, os arquivos só estão no disco do deploy.
 *
 * Nunca lança: pasta ausente (ex.: alguém apagou public/media num ambiente
 * de teste) vira lista vazia, não erro de página — mesmo princípio dos
 * outros lugares desta tela.
 */
async function listarFotosDoRepositorio(): Promise<FotoDoRepositorio[]> {
  const raizPublic = path.join(process.cwd(), "public");
  const raizMedia = path.join(raizPublic, "media");
  const resultado: FotoDoRepositorio[] = [];

  async function percorrer(diretorio: string): Promise<void> {
    let itens: Dirent[];
    try {
      itens = await fs.readdir(diretorio, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of itens) {
      const caminhoAbsoluto = path.join(diretorio, item.name);
      if (item.isDirectory()) {
        await percorrer(caminhoAbsoluto);
        continue;
      }
      if (!EXTENSOES_IMAGEM.has(path.extname(item.name).toLowerCase())) continue;

      const info = await fs.stat(caminhoAbsoluto).catch(() => null);
      if (!info) continue;

      const relativo = path.relative(raizPublic, caminhoAbsoluto).split(path.sep).join("/");
      resultado.push({ caminho: `/${relativo}`, tamanho: info.size });
    }
  }

  await percorrer(raizMedia);
  return resultado.sort((a, b) => a.caminho.localeCompare(b.caminho));
}
