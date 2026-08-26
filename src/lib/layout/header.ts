// Altura do cabeçalho fixo (Header.tsx), em px — mora num módulo SEM "use
// client" de propósito: Header.tsx é client component, e importar uma
// constante de dentro de um arquivo "use client" para um Server Component
// (as páginas públicas, que buscam no Supabase) é o tipo de import que o
// bundler de React Server Components trata como cruzando a fronteira
// cliente/servidor mesmo quando é só um número — evitável só não
// misturando os dois. Este arquivo existe para as páginas (server) e o
// Header (client) importarem o MESMO número sem esse risco.
//
// Camada visual e de conversão, 25/08/2026. Se o header crescer (ganhar uma
// faixa de aviso em cima, por exemplo), muda só aqui — mas o padding-top
// das páginas que compensam o header fixo precisa ser atualizado também,
// não há CSS var lendo isto ainda.
export const HEADER_HEIGHT_PX = 72;
