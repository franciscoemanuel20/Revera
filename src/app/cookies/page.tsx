import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PaginaLegal } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = { title: "Política de Cookies" };

export default function CookiesPage() {
  return (
    <PaginaLegal titulo="Política de Cookies" atualizadoEm="9 de setembro de 2026">
      <p>Cookies são pequenos arquivos que ajudam o site a funcionar e, quando autorizados, a medir navegação e campanhas.</p>
      <Secao titulo="Cookies necessários"><p>Usamos recursos técnicos necessários para manter a sessão, a sacola de compras, a segurança e o funcionamento do checkout. Eles não podem ser desligados pelo aviso, pois sem eles a compra não funciona.</p></Secao>
      <Secao titulo="Cookies opcionais de medição"><p>Com sua autorização, a Reverá ativa ferramentas da Meta e do Google para medir visitas, páginas visualizadas e resultados de campanhas. A decisão fica salva no seu navegador e pode ser alterada a qualquer momento neste dispositivo.</p></Secao>
      <Secao titulo="Como escolher"><p>Ao entrar no site, você pode aceitar ou recusar os cookies opcionais. Recusar não impede a navegação nem a compra. Para mudar uma escolha anterior, limpe os dados do site no navegador e volte a acessar a Reverá.</p></Secao>
    </PaginaLegal>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section><h2 className="font-display text-2xl text-ink">{titulo}</h2><div className="mt-3 space-y-3">{children}</div></section>;
}
