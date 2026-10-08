import type { Metadata } from "next";
import { PaginaLegalUE } from "@/components/legal/PaginasLegaisUE";

export const metadata: Metadata = { title: "Devolução e direito de desistência" };

export default function Page() {
  return <PaginaLegalUE locale="pt" pagina="devolucao" />;
}
