// next.config.js — configuração mínima de propósito, mesmo princípio do
// projeto irmão (saas-metodo-francisco/next.config.js): reactStrictMode
// ligado desde o dia 1, custo zero num app que ainda nem nasceu.
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
