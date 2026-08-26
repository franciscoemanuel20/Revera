"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";
import { salvarConfiguracaoAction } from "./actions";

export interface SiteSettingItem {
  key: string;
  valueJson: string;
  updatedAt: string;
}

// Chaves sugeridas na missão ("nome da marca, prazos informados, textos
// institucionais, links, quais integrações estão habilitadas") — só texto
// de exemplo no placeholder do formulário de "nova configuração", NUNCA
// criadas automaticamente no banco. Inventar a linha sem o Francisco pedir
// seria inventar dado — o que a missão pediu explicitamente para não
// fazer em lugar nenhum deste painel.
const SUGESTOES = [
  { key: "brand_name", exemplo: '"Reverá"' },
  { key: "shipping_promise", exemplo: '"Envio em até 3 dias úteis após a confirmação do pagamento"' },
  { key: "institutional_texts", exemplo: '{"sobre": "..."}' },
  { key: "links", exemplo: '{"instagram": "https://..."}' },
  { key: "integrations_enabled", exemplo: '{"meta_pixel": true, "ga4": false}' },
];

export function ConfiguracoesManager({ initialItems }: { initialItems: SiteSettingItem[] }) {
  const [items, setItems] = useState(initialItems);

  function aoSalvarComSucesso(item: SiteSettingItem) {
    setItems((atuais) => {
      const semEssaChave = atuais.filter((i) => i.key !== item.key);
      return [...semEssaChave, item].sort((a, b) => a.key.localeCompare(b.key));
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl text-ink">Configurações existentes</h2>
        {items.length === 0 ? (
          <p className="text-sm text-ink/60">Nenhuma configuração cadastrada ainda — crie a primeira abaixo.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {items.map((item) => (
              <LinhaConfiguracao key={item.key} item={item} onSalvo={aoSalvarComSucesso} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-sand p-4">
        <h2 className="font-display text-xl text-ink">Nova configuração</h2>
        <p className="text-sm text-ink/60">
          Sugestões de chave: {SUGESTOES.map((s) => s.key).join(", ")}. Se a chave já existir, isto
          sobrescreve o valor atual.
        </p>
        <NovaConfiguracao onSalvo={aoSalvarComSucesso} />
      </section>
    </div>
  );
}

function LinhaConfiguracao({
  item,
  onSalvo,
}: {
  item: SiteSettingItem;
  onSalvo: (item: SiteSettingItem) => void;
}) {
  const router = useRouter();
  const [valueJson, setValueJson] = useState(item.valueJson);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setSucesso(false);
    setSalvando(true);
    const resultado = await salvarConfiguracaoAction({ key: item.key, valueJson });
    setSalvando(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    setSucesso(true);
    onSalvo({ key: item.key, valueJson, updatedAt: new Date().toISOString() });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-sand p-4">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      {sucesso ? <Toast message="Configuração salva." variant="success" onClose={() => setSucesso(false)} /> : null}

      <p className="font-mono text-sm font-semibold text-ink">{item.key}</p>
      <textarea
        rows={3}
        value={valueJson}
        onChange={(e) => setValueJson(e.target.value)}
        className="min-h-toque rounded-md border border-sand bg-paper px-3 py-2 font-mono text-sm text-ink"
      />
      <div>
        <Button type="button" size="sm" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

function NovaConfiguracao({ onSalvo }: { onSalvo: (item: SiteSettingItem) => void }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [valueJson, setValueJson] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setSucesso(false);
    setSalvando(true);
    const resultado = await salvarConfiguracaoAction({ key, valueJson });
    setSalvando(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    setSucesso(true);
    onSalvo({ key, valueJson, updatedAt: new Date().toISOString() });
    setKey("");
    setValueJson("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      {sucesso ? <Toast message="Configuração criada." variant="success" onClose={() => setSucesso(false)} /> : null}

      <FormField label="Chave" hint="letras minúsculas e underline, ex.: brand_name" error={null}>
        {(props) => (
          <input
            {...props}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="brand_name"
            className="min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink"
          />
        )}
      </FormField>

      <FormField label="Valor (JSON)" hint='texto simples vai entre aspas, ex.: "Reverá"' error={null}>
        {(props) => (
          <textarea
            {...props}
            rows={3}
            value={valueJson}
            onChange={(e) => setValueJson(e.target.value)}
            placeholder='"Reverá"'
            className="min-h-toque rounded-md border border-sand bg-paper px-3 py-2 font-mono text-sm text-ink"
          />
        )}
      </FormField>

      <div>
        <Button type="button" size="sm" onClick={salvar} disabled={salvando || !key.trim()}>
          {salvando ? "Salvando..." : "Criar configuração"}
        </Button>
      </div>
    </div>
  );
}
