"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GOOGLE_TAG_ID, META_PIXEL_ID } from "@/lib/tracking/config";
import { guardarAtribuicaoDaUrl } from "@/lib/tracking/atribuicao";

/**
 * Dispara PageView a cada página vista — inclusive nas trocas de rota.
 *
 * Por que isto é um componente separado da base do pixel: no App Router,
 * navegar de /produtos para /carrinho NÃO recarrega a página. O snippet
 * padrão da Meta dispara PageView uma vez, no carregamento, e pronto — o
 * resultado é um site inteiro contando uma única visualização por sessão.
 * Aqui o efeito escuta pathname e query, então cada tela vista conta.
 *
 * A trava do `ultimaUrl`: em desenvolvimento o React monta cada componente
 * duas vezes (StrictMode), e trocas de rota podem reexecutar o efeito com a
 * mesma URL. Sem a comparação, o PageView sairia dobrado — que é exatamente o
 * bug que este arquivo existe para evitar.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ultimaUrl = useRef<string | null>(null);

  useEffect(() => {
    const query = searchParams.toString();
    const url = query ? `${pathname}?${query}` : pathname;

    if (ultimaUrl.current === url) return;
    ultimaUrl.current = url;

    /**
     * Guarda a origem da campanha ANTES de qualquer outra coisa.
     *
     * A pessoa chega em `/?utm_source=instagram`, navega para o produto, vai
     * ao carrinho — e no checkout a query string já não tem nada. Sem guardar
     * na primeira tela, a campanha que trouxe a venda ficaria sem crédito.
     *
     * Fica aqui, e não num efeito só da home, porque a pessoa pode entrar por
     * qualquer página: um anúncio pode apontar direto para o produto.
     */
    guardarAtribuicaoDaUrl();

    if (META_PIXEL_ID) {
      window.fbq?.("track", "PageView");
    }
    if (GOOGLE_TAG_ID) {
      window.gtag?.("event", "page_view", {
        page_path: url,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }, [pathname, searchParams]);

  return null;
}
