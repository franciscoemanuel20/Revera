"use client";

import Script from "next/script";
import { GOOGLE_TAG_ID, META_PIXEL_ID } from "@/lib/tracking/config";

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
  if (!ativo) return null;

  return (
    <>
      {META_PIXEL_ID ? (
        <Script id="meta-pixel-base" strategy="afterInteractive">
          {`
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${META_PIXEL_ID}');
          `}
        </Script>
      ) : null}

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
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
// send_page_view:false porque quem manda page_view é o PageViewTracker, na
// troca de rota também. Deixar o padrão ligado contaria a primeira página
// duas vezes.
gtag('config','${GOOGLE_TAG_ID}',{send_page_view:false});
            `}
          </Script>
        </>
      ) : null}
    </>
  );
}
