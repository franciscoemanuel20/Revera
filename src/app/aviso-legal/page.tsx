import type { Metadata } from "next";
import { PaginaLegalUE } from "@/components/legal/PaginasLegaisUE";

export const metadata: Metadata = { title: "Aviso legal" };

export default function Page() {
  return <PaginaLegalUE locale="pt" pagina="aviso-legal" />;
}
