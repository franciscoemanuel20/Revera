import { aparenciaDoSite } from "@/lib/site/aparencia";
import { SiteManager } from "./SiteManager";

export default async function SitePage() {
  const site = await aparenciaDoSite();
  return <div className="flex flex-col gap-6 pb-16"><div><h1 className="font-display text-2xl text-ink">Identidade e navegação</h1><p className="mt-1 text-sm text-ink/70">Altere a marca, logo, SEO, Instagram e os links que aparecem no site. Pagamento, frete e integrações ficam protegidos.</p></div><SiteManager initial={site} /></div>;
}
