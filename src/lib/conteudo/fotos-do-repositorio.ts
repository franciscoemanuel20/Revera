import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

// Extensões de IMAGEM que as telas do painel listam. Vídeo (há um em
// public/media/hero/implantacao.mp4) fica de fora de propósito: gerar
// miniatura de vídeo a partir de um arquivo do disco exigiria decodificar o
// .mp4 (ffmpeg ou afim), trabalho que nenhuma dessas telas precisa fazer.
const EXTENSOES_IMAGEM = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

export interface FotoDoRepositorio {
  /** Já É a URL pública — public/ é servido em "/" pelo Next. */
  caminho: string;
  tamanho: number;
}

/**
 * Varre public/media recursivamente. O caminho relativo a public/ já é a URL
 * pública — não existe tabela nem API para essa lista, os arquivos só estão
 * no disco do deploy.
 *
 * Nunca lança: pasta ausente (ex.: alguém apagou public/media num ambiente
 * de teste) vira lista vazia, não erro de página.
 *
 * Morava dentro de /admin/midia/page.tsx até 03/09/2026; saiu de lá quando a
 * tela de produto passou a precisar da mesma lista para oferecer as fotos que
 * já vieram com o site na hora de amarrar foto a uma cor.
 */
export async function listarFotosDoRepositorio(): Promise<FotoDoRepositorio[]> {
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
