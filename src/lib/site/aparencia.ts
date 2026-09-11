import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

export type LinkDoSite = { label: string; href: string };
export type AparenciaDoSite = {
  brandName: string; logoUrl: string; seoTitle: string; seoDescription: string; instagramUrl: string;
  menuPrincipal: LinkDoSite[]; menuConheca: LinkDoSite[]; linkProfissionais: LinkDoSite;
};

export const APARENCIA_PADRAO: AparenciaDoSite = {
  brandName: "Reverá", logoUrl: "/media/marca/logo-revera.png",
  seoTitle: "Reverá — Prótese capilar com acabamento natural",
  seoDescription: "Próteses capilares premium. Base ultrafina em 0,08mm e 0,06mm, acabamento natural na linha frontal. Envio para todo o Brasil.",
  instagramUrl: "",
  menuPrincipal: [{ href: "/produtos", label: "Próteses" }, { href: "/cores", label: "Cores" }, { href: "/cuidados", label: "Cuidados" }, { href: "/garantia", label: "Garantia" }, { href: "/faq", label: "FAQ" }],
  menuConheca: [{ href: "/sobre-as-proteses", label: "Sobre as próteses" }, { href: "/naturalidade", label: "Naturalidade" }, { href: "/por-que-revera", label: "Por que Reverá" }],
  linkProfissionais: { href: "/para-profissionais", label: "Para profissionais" },
};

function texto(valor: unknown, padrao: string, maximo = 300) {
  if (typeof valor !== "string") return padrao;
  const limpo = valor.trim();
  return limpo && limpo.length <= maximo ? limpo : padrao;
}

/** Links de navegação são sempre rotas da própria loja. */
export function ehCaminhoInterno(valor: string): boolean {
  return valor.startsWith("/") && !valor.startsWith("//") && !valor.includes("\\") && !/[\u0000-\u001f]/.test(valor);
}

function origemSupabase(): string | null {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin; } catch { return null; }
}

function ehLogoSegura(valor: string): boolean {
  if (ehCaminhoInterno(valor)) return valor.startsWith("/media/");
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && url.origin === origemSupabase() && url.pathname.startsWith("/storage/v1/object/public/site-media/");
  } catch { return false; }
}

function ehInstagramSeguro(valor: string): boolean {
  if (!valor) return true;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && ["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase());
  } catch { return false; }
}

function links(valor: unknown, padrao: LinkDoSite[]) {
  if (!Array.isArray(valor) || valor.length !== padrao.length) return padrao;
  return valor.map((item, i) => {
    const bruto = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const original = padrao[i]!;
    const href = texto(bruto.href, original.href, 500);
    return { label: texto(bruto.label, original.label, 80), href: ehCaminhoInterno(href) ? href : original.href };
  });
}

function normalizar(valor: Record<string, unknown>): AparenciaDoSite {
  const logo = texto(valor.logoUrl, APARENCIA_PADRAO.logoUrl, 500);
  const instagram = typeof valor.instagramUrl === "string" ? valor.instagramUrl.trim() : "";
  return {
    brandName: texto(valor.brandName, APARENCIA_PADRAO.brandName, 80),
    logoUrl: ehLogoSegura(logo) ? logo : APARENCIA_PADRAO.logoUrl,
    seoTitle: texto(valor.seoTitle, APARENCIA_PADRAO.seoTitle, 120),
    seoDescription: texto(valor.seoDescription, APARENCIA_PADRAO.seoDescription, 300),
    instagramUrl: ehInstagramSeguro(instagram) ? instagram : "",
    menuPrincipal: links(valor.menuPrincipal, APARENCIA_PADRAO.menuPrincipal),
    menuConheca: links(valor.menuConheca, APARENCIA_PADRAO.menuConheca),
    linkProfissionais: links([valor.linkProfissionais], [APARENCIA_PADRAO.linkProfissionais])[0]!,
  };
}

/** Não persiste um valor que a camada pública recusaria. */
export function validarAparenciaDoSite(valor: unknown): { ok: true; value: AparenciaDoSite } | { ok: false; error: string } {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return { ok: false, error: "Configuração visual inválida." };
  const bruto = valor as Record<string, unknown>;
  const normalizada = normalizar(bruto);
  if (bruto.logoUrl !== normalizada.logoUrl) return { ok: false, error: "A logo deve ser uma imagem da Biblioteca do site." };
  if (bruto.instagramUrl !== normalizada.instagramUrl) return { ok: false, error: "O Instagram precisa ser um link https://instagram.com válido." };
  for (const [nome, itens, tamanho] of [["menu principal", bruto.menuPrincipal, APARENCIA_PADRAO.menuPrincipal.length], ["menu Conheça", bruto.menuConheca, APARENCIA_PADRAO.menuConheca.length], ["link para profissionais", [bruto.linkProfissionais], 1]] as const) {
    if (!Array.isArray(itens) || itens.length !== tamanho || itens.some((item) => !item || typeof item !== "object" || !ehCaminhoInterno(String((item as Record<string, unknown>).href ?? "")))) return { ok: false, error: `Os links do ${nome} devem apontar para páginas internas, começando com /.` };
  }
  if (typeof bruto.brandName !== "string" || typeof bruto.seoTitle !== "string" || typeof bruto.seoDescription !== "string" || normalizada.brandName !== bruto.brandName.trim() || normalizada.seoTitle !== bruto.seoTitle.trim() || normalizada.seoDescription !== bruto.seoDescription.trim()) return { ok: false, error: "Nome, título e descrição precisam estar preenchidos dentro do limite permitido." };
  return { ok: true, value: normalizada };
}

export async function aparenciaDoSite(): Promise<AparenciaDoSite> {
  try {
    const { data, error } = await createAdminClient().from("site_settings").select("value").eq("key", "site_appearance").maybeSingle();
    if (error || !data || !data.value || typeof data.value !== "object") return APARENCIA_PADRAO;
    return normalizar(data.value as Record<string, unknown>);
  } catch { return APARENCIA_PADRAO; }
}
