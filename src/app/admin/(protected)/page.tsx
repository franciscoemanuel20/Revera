import { redirect } from "next/navigation";

// /admin sozinho não tem conteúdo próprio ainda — "Produtos" é o único
// item de navegação desta entrega (ver layout.tsx), então a home do
// painel é a lista de produtos. Quando existir mais de uma seção, isto
// vira uma tela de resumo de verdade.
export default function AdminIndexPage() {
  redirect("/admin/produtos");
}
