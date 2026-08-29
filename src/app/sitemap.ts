import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/config/urls";
import { createClient } from "@/lib/supabase/server";

/**
 * sitemap.xml (P1, 27/08/2026).
 *
 * A auditoria de 26/08 mediu `/sitemap.xml` → 404.
 *
 * As páginas institucionais são fixas. Os produtos vêm do BANCO, pelo mesmo
 * motivo que os CTAs da home passaram a vir (ver src/lib/catalog/vitrine.ts):
 * um sitemap com slug fixo aponta para 404 no dia em que alguém renomeia o
 * produto — e um sitemap cheio de 404 é pior que sitemap nenhum, porque o
 * Google passa a desconfiar do arquivo inteiro.
 *
 * A policy "public read active products" já filtra `status='active'`, então
 * produto em rascunho não entra aqui — nem precisa de filtro extra.
 *
 * Se o banco não responder, o sitemap sai só com as páginas fixas em vez de
 * quebrar: um sitemap parcial vale mais que um erro 500 na raiz do site.
 */
export const dynamic = "force-dynamic";

const INSTITUCIONAIS: Array<{ caminho: string; prioridade: number }> = [
  { caminho: "", prioridade: 1 },
  // O catálogo (29/08/2026) — prioridade alta porque é a porta de entrada
  // para os quatro produtos que não tinham nenhum link no site.
  { caminho: "/produtos", prioridade: 0.9 },
  { caminho: "/sobre-as-proteses", prioridade: 0.8 },
  { caminho: "/cores", prioridade: 0.8 },
  { caminho: "/naturalidade", prioridade: 0.7 },
  { caminho: "/por-que-revera", prioridade: 0.7 },
  { caminho: "/garantia", prioridade: 0.6 },
  { caminho: "/cuidados", prioridade: 0.6 },
  { caminho: "/faq", prioridade: 0.6 },
  { caminho: "/para-profissionais", prioridade: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();
  const agora = new Date();

  const fixas: MetadataRoute.Sitemap = INSTITUCIONAIS.map((p) => ({
    url: `${base}${p.caminho}`,
    lastModified: agora,
    changeFrequency: "monthly",
    priority: p.prioridade,
  }));

  let produtos: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("products")
      .select("slug, updated_at")
      .order("sort_order");

    produtos = (data ?? []).map((p) => ({
      url: `${base}/produtos/${p.slug as string}`,
      lastModified: p.updated_at ? new Date(p.updated_at as string) : agora,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    }));
  } catch {
    // Banco fora do ar: entrega o que dá, em vez de derrubar o sitemap.
  }

  return [...fixas, ...produtos];
}
