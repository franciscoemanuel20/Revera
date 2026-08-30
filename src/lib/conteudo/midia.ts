/**
 * Helpers da Biblioteca de Fotos (/admin/midia) — 30/08/2026.
 *
 * Por que este arquivo existe separado de src/app/cores/actions.ts e de
 * src/app/api/pedido-a-distancia/foto/route.ts, que já sobem arquivo para o
 * Supabase Storage: aqueles dois buckets ("color-help", "pedidos-fotos") são
 * PRIVADOS e o nome do arquivo é decidido pelo backend a partir de um ID de
 * pedido — não tem por que ser bonito nem estável, ninguém cola aquela URL
 * em lugar nenhum.
 *
 * O bucket "site-media" (migration 00000000000012_conteudo_editavel.sql) é o
 * oposto: é PÚBLICO, a URL é o produto final (quem usa a tela cola essa URL
 * num produto ou banner) e o arquivo pode ser reenviado por qualquer pessoa
 * do painel a qualquer momento. Daí precisar de nome de arquivo seguro
 * (sem acento/espaço, senão a URL fica feia e alguns navegadores antigos
 * de fato quebram em espaço não escapado) e de um sufixo aleatório: duas
 * fotos chamadas "banner.jpg" no mesmo dia não podem se sobrescrever.
 *
 * Fica em src/lib/conteudo (e não em src/lib/format, onde vivem os outros
 * formatadores do projeto) porque só a tela /admin/midia usa isto até agora
 * — não deixa de ser um "helper compartilhado" entre page/actions/Manager
 * do mesmo módulo, só não é compartilhado com o resto do site ainda.
 */

export const BUCKET_MIDIA = "site-media";

/**
 * O teto REAL do envio pelo painel — e ele não é o do bucket.
 *
 * Existem dois limites em cima do mesmo arquivo, e o menor é que manda:
 *
 *   6 MB  — `bodySizeLimit` das Server Actions, em `next.config.js`
 *           (decidido em 26/08/2026 para a foto de /cores#ajuda)
 *  10 MB  — `file_size_limit` do bucket `site-media`, na migration 12
 *
 * Se este número fosse o do bucket, um arquivo de 7 MB seria recusado pelo
 * PRÓPRIO NEXT antes de chegar aqui — e o que apareceria na tela não seria a
 * mensagem em português abaixo, seria um erro cru de framework. O usuário
 * desta tela não é programador; ver "Body exceeded 6mb limit" é o mesmo que
 * ver nada.
 *
 * 5 MB, e não 6, porque o `multipart/form-data` acrescenta cabeçalho e
 * codificação em cima do arquivo: um arquivo de exatamente 6 MB gera um
 * corpo MAIOR que 6 MB e estouraria o limite mesmo passando na validação.
 *
 * Os 10 MB do bucket continuam valendo como última barreira do lado do
 * servidor — é ela que pega quem subir por fora do painel.
 */
export const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5 MB

// Mesma lista de allowed_mime_types da migration 12.
export const EXTENSAO_POR_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
};

export function tipoAceito(mime: string): boolean {
  return mime in EXTENSAO_POR_TIPO;
}

/**
 * Gera o nome com que o arquivo é salvo no Storage a partir do nome que a
 * pessoa deu no computador dela ("Foto Banner Natal.JPG"). Vira algo como
 * "foto-banner-natal-a1b2c3.jpg": minúsculo, sem acento, sem espaço, com
 * sufixo aleatório para nunca colidir com um upload anterior (o upload em
 * actions.ts usa upsert:false por causa disso — colisão vira erro, não
 * substituição silenciosa de uma foto que já estava em uso em outro lugar).
 */
export function nomeArquivoSeguro(nomeOriginal: string, tipoMime: string): string {
  const extensao = EXTENSAO_POR_TIPO[tipoMime] ?? "bin";
  const base = nomeOriginal
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acento (NFD separa a letra do acento; isto remove só o acento, código U+0300–U+036F)
    .replace(/\.[^./]+$/, "") // tira a extensão original — quem manda é o content-type, não o nome do arquivo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const sufixo = Math.random().toString(36).slice(2, 8);
  return `${base || "imagem"}-${sufixo}.${extensao}`;
}

/**
 * Bytes em texto legível para quem não é programador — "480 KB", nunca
 * "491520". Não entrou em src/lib/format/ (onde vivem formatarBRL e
 * formatarData) para não obrigar o resto do site a herdar uma decisão de
 * arredondamento pensada só para o peso de uma foto.
 */
export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
