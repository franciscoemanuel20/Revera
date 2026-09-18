"use client";

import { useEffect } from "react";
import Script from "next/script";
import { GOOGLE_TAG_ID, META_PIXEL_ID } from "@/lib/tracking/config";

declare global {
  interface Window {
    _fbq?: Window["fbq"];
  }
}

type MetaFbqQueue = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  push: unknown;
  loaded: boolean;
  version: string;
  queue: unknown[][];
};

export function garantirFilaMetaPixel() {
  if (!META_PIXEL_ID) return;
  if (window.fbq) return;

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue.push(args);
    }
  } as MetaFbqQueue;

  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  window.fbq("init", META_PIXEL_ID);
}

/**
 * Carrega as bases do Meta Pixel e do Google, uma vez por sessão.
 *
 * ===========================================================================
 * DUAS ARMADILHAS JÁ PAGAS NO SITE IRMÃO — não repetir
 * ===========================================================================
 *
 * 1. NADA de <noscript><img> aqui dentro.
 *    O React monta os filhos de <noscript> como DOM real, então a "imagem de
 *    fallback" que a Meta manda colar dispara um SEGUNDO PageView em todo
 *    visitante — dobrando a métrica de topo e envenenando o custo por
 *    resultado. O fallback existe para HTML estático, não para React.
 *
 * 2. `fbq('track','PageView')` NÃO fica aqui.
 *    Este componente só carrega a base. Quem dispara PageView é
 *    PageViewTracker, que também escuta troca de rota — sem isso, o site
 *    inteiro contaria uma única visualização por sessão, porque navegar no
 *    App Router não recarrega a página.
 *
 * Estratégia de carregamento: `afterInteractive`. Não é `beforeInteractive`
 * porque script de terceiro não deve atrasar a primeira pintura de uma página
 * que precisa vender; e não é `lazyOnload` porque aí o PageView chegaria tarde
 * demais para quem sai rápido.
 */
export function Pixels({ ativo }: { ativo: boolean }) {
  // CAMADA 0 do P0-3 (27/08/2026): fora de produção o Pixel nem CARREGA.
  //
  // As camadas de dentro já impedem um Purchase falso, mas o pixel base
  // dispara PageView e ViewContent em toda navegação — e em desenvolvimento
  // isso ia para a MESMA conta de anúncios de produção, inflando o topo do
  // funil com tráfego de quem está programando. Quem decide é o servidor
  // (ver src/lib/tracking/permissao.ts): este componente é client e só
  // enxergaria variáveis NEXT_PUBLIC_, que não distinguem ambiente.
  useEffect(() => {
    if (!ativo) return;
    garantirFilaMetaPixel();
  }, [ativo]);

  if (!ativo) return null;

  return (
    <>
      {GOOGLE_TAG_ID ? (
        <>
          <Script
            id="google-tag-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`}
          />
          <Script id="google-tag-base" strategy="afterInteractive">
            {`
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function(){dataLayer.push(arguments);}
window.gtag('js', new Date());
// send_page_view:false porque quem manda page_view é o PageViewTracker, na
// troca de rota também. Deixar o padrão ligado contaria a primeira página
// duas vezes.
window.gtag('config','${GOOGLE_TAG_ID}',{send_page_view:false});
            `}
          </Script>
        </>
      ) : null}
    </>
  );
}
