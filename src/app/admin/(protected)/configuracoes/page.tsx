import { createClient } from "@/lib/supabase/server";
import { ConfiguracoesManager, type SiteSettingItem } from "./ConfiguracoesManager";

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const { data: configuracoes, error } = await supabase.from("site_settings").select("*").order("key");

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl text-ink">Configurações</h1>
        <p className="text-sm text-red-700">
          Não foi possível carregar as configurações. Se isto persistir, confira se a migration
          00000000000005_admin_pedidos_policies.sql já foi aplicada no Supabase.
        </p>
      </div>
    );
  }

  const items: SiteSettingItem[] = (configuracoes ?? []).map((c) => ({
    key: c.key,
    valueJson: JSON.stringify(c.value, null, 2),
    updatedAt: c.updated_at,
  }));

  return (
    <div className="flex flex-col gap-6 pb-16">
      <h1 className="font-display text-2xl text-ink">Configurações</h1>
      <p className="text-sm text-ink/70">
        Chave-valor livre (jsonb) — nome da marca, prazos informados, textos institucionais,
        links e quais integrações estão habilitadas. Se a chave ainda não existir, criar abaixo.
      </p>
      <ConfiguracoesManager initialItems={items} />
    </div>
  );
}
