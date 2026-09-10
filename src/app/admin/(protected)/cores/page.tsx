import { createClient } from "@/lib/supabase/server";
import { CoresManager, type CorEditavel } from "./CoresManager";

/**
 * A cartela é uma parte comercial do site: nome, foto, ordem e visibilidade
 * precisam ser alteráveis sem SQL. As variantes continuam apontando para o
 * mesmo id da cor, portanto editar esta tela não desmonta estoque ou preço.
 */
export default async function CoresPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("colors")
    .select("id, code, name, photo_url, sort_order, is_active")
    .order("sort_order");

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl text-ink">Cores</h1>
        <p className="text-sm text-red-700">
          Não foi possível carregar as cores. Confira se a política de acesso do admin foi aplicada no Supabase.
        </p>
      </div>
    );
  }

  const cores: CorEditavel[] = (data ?? []).map((cor) => ({
    id: cor.id as string,
    code: cor.code as string,
    name: cor.name as string,
    photoUrl: (cor.photo_url as string | null) ?? "",
    sortOrder: Number(cor.sort_order ?? 0),
    isActive: cor.is_active !== false,
  }));

  return (
    <div className="flex flex-col gap-6 pb-16">
      <div>
        <h1 className="font-display text-2xl text-ink">Cores da cartela</h1>
        <p className="mt-1 text-sm text-ink/70">
          Altere nomes, fotos, ordem e visibilidade. As mudanças aparecem na cartela e nos produtos em instantes.
        </p>
      </div>
      <CoresManager coresIniciais={cores} />
    </div>
  );
}
