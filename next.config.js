// next.config.js — configuração mínima de propósito, mesmo princípio do
// projeto irmão (saas-metodo-francisco/next.config.js): reactStrictMode
// ligado desde o dia 1, custo zero num app que ainda nem nasceu.
/**
 * DE ONDE PODE VIR UMA FOTO (02/09/2026)
 * ---------------------------------------------------------------------------
 * Com as fotos das páginas editáveis pelo painel (/admin/textos, tipo
 * "imagem"), o `src` de um <Image> deixou de ser sempre um arquivo de
 * public/ e passou a poder ser uma URL do Supabase Storage.
 *
 * O next/image RECUSA host que não esteja listado aqui, e recusa com erro de
 * runtime — a página inteira quebra, não a foto. Sem este bloco, a primeira
 * foto trocada pelo painel derrubaria a página onde ela está, e o defeito só
 * apareceria depois de publicado.
 *
 * O host sai da própria variável de ambiente, não escrito à mão: escrito à
 * mão, ele apontaria para o projeto Supabase de hoje e ficaria silenciosamente
 * errado em staging (.env.staging aponta para outro projeto) e no dia em que
 * o banco mudar de endereço.
 *
 * O caminho é travado no bucket `site-media` — o único que é público
 * (migration 12). Os outros dois buckets guardam foto de cliente e não têm o
 * que fazer numa tag <img>.
 */
const hostDoSupabase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  } catch {
    // Variável ausente ou malformada. Devolver undefined aqui (em vez de
    // deixar estourar) mantém `next build` funcionando num ambiente sem
    // Supabase configurado: o site continua servindo as fotos de public/,
    // que é de onde vêm todas até alguém trocar a primeira pelo painel.
    return undefined;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: hostDoSupabase
      ? [
          {
            protocol: "https",
            hostname: hostDoSupabase,
            pathname: "/storage/v1/object/public/site-media/**",
          },
        ]
      : [],
  },
  // Limite padrão de Server Action é 1MB — baixo demais para a foto que a
  // ferramenta "Ajude-me a descobrir minha cor" recebe em /cores#ajuda
  // (até 5MB, ver src/app/cores/actions.ts). 6mb dá folga para o overhead
  // do multipart/form-data em cima do arquivo em si, 26/08/2026.
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

module.exports = nextConfig;
