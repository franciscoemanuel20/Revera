import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/config/urls";

/**
 * robots.txt (P1, 27/08/2026).
 *
 * A auditoria de 26/08 mediu `/robots.txt` → 404. Sem ele, o crawler entra
 * sem instrução nenhuma e não sabe onde está o sitemap.
 *
 * O que fica FORA do índice, e por quê:
 *
 *   /checkout, /carrinho  — não são conteúdo, são etapas de compra. Indexá-las
 *                           traz gente de busca para uma sacola vazia.
 *   /pedido/*             — é o comprovante de UMA pessoa, com endereço e
 *                           itens. A página já manda `noindex` no metadata;
 *                           aqui é a segunda camada, para o crawler nem pedir.
 *   /admin/*              — o painel da dona.
 *   /api/*                — não é página.
 *
 * `disallow` NÃO é controle de acesso — é pedido de boa vontade ao robô. O
 * que protege /pedido de verdade é o access_token aleatório na URL, e o que
 * protege /admin é a sessão. Isto aqui só evita que apareçam no Google.
 */
export default function robots(): MetadataRoute.Robots {
  const base = baseUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/checkout", "/carrinho", "/pedido/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
