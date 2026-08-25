"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Toast } from "@/components/ui/Toast";
import { reaisParaCentavos } from "@/lib/format/money";
import { salvarProdutoAction, type SalvarProdutoInput } from "./actions";

// Formulário único de produto: dados do produto + variantes + regras de
// desconto por quantidade, tudo editado inline e salvo numa única chamada
// de Server Action (salvarProdutoAction) — é o que o escopo pediu ("um
// único botão Salvar que persiste tudo"). Client component porque o
// estado das listas de variante/regra precisa ser editável linha a linha
// antes de qualquer coisa ir para o banco.
//
// `id` de linha (variante/regra) só existe quando ela já está no banco;
// linhas novas não têm `id` e por isso a Server Action as trata como
// insert. `key` é só identidade React local, nunca é enviada ao servidor.

type Opcao = { id: string; label: string };

interface VariantRow {
  key: string;
  id?: string;
  sizeId: string;
  colorId: string;
  grayLevelId: string;
  lengthCm: string;
  sku: string;
  stockQty: string;
  priceReais: string;
  compareAtPriceReais: string;
  isActive: boolean;
}

interface RuleRow {
  key: string;
  id?: string;
  minQty: string;
  mode: "preco" | "percentual";
  unitPriceReais: string;
  discountPercent: string;
  label: string;
  isActive: boolean;
}

export interface ProductFormInitialData {
  id?: string;
  name: string;
  slug: string;
  description: string;
  baseType: string;
  baseThicknessMm: string;
  isFeatured: boolean;
  status: "draft" | "active" | "archived";
  seoTitle: string;
  seoDescription: string;
  variants: VariantRow[];
  discountRules: RuleRow[];
}

export interface ProductFormProps {
  sizes: Opcao[];
  colors: Opcao[];
  grayLevels: Opcao[];
  initialData?: ProductFormInitialData;
}

function novaChave() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `linha-${Date.now()}-${Math.random()}`;
}

function slugificar(texto: string): string {
  return texto
    .normalize("NFD")
    // U+0300-U+036F: faixa Unicode de "combining diacritical marks".
    // Depois do normalize("NFD") um acento vira caractere separado
    // nessa faixa (ex.: "e" + acento agudo em vez de "é" pronto),
    // entao remove-la tira o acento sem mexer na letra base.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function novaVariante(): VariantRow {
  return {
    key: novaChave(),
    sizeId: "",
    colorId: "",
    grayLevelId: "",
    lengthCm: "",
    sku: "",
    stockQty: "0",
    priceReais: "",
    compareAtPriceReais: "",
    isActive: true,
  };
}

function novaRegra(): RuleRow {
  return {
    key: novaChave(),
    minQty: "",
    mode: "percentual",
    unitPriceReais: "",
    discountPercent: "",
    label: "",
    isActive: true,
  };
}

const inputClass = "min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink";
const selectClass = inputClass;

export function ProductForm({ sizes, colors, grayLevels, initialData }: ProductFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [slugTocado, setSlugTocado] = useState(Boolean(initialData));
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [baseType, setBaseType] = useState(initialData?.baseType ?? "");
  const [baseThicknessMm, setBaseThicknessMm] = useState(initialData?.baseThicknessMm ?? "");
  const [isFeatured, setIsFeatured] = useState(initialData?.isFeatured ?? false);
  const [status, setStatus] = useState<"draft" | "active" | "archived">(initialData?.status ?? "draft");
  const [seoTitle, setSeoTitle] = useState(initialData?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initialData?.seoDescription ?? "");
  const [variants, setVariants] = useState<VariantRow[]>(initialData?.variants ?? []);
  const [rules, setRules] = useState<RuleRow[]>(initialData?.discountRules ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function handleNameChange(valor: string) {
    setName(valor);
    if (!slugTocado) {
      setSlug(slugificar(valor));
    }
  }

  function handleSlugChange(valor: string) {
    setSlugTocado(true);
    setSlug(valor);
  }

  function atualizarVariante(key: string, patch: Partial<VariantRow>) {
    setVariants((atuais) => atuais.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  function removerVariante(key: string) {
    setVariants((atuais) => atuais.filter((v) => v.key !== key));
  }

  function atualizarRegra(key: string, patch: Partial<RuleRow>) {
    setRules((atuais) => atuais.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removerRegra(key: string) {
    setRules((atuais) => atuais.filter((r) => r.key !== key));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    // Validação de formato fica no zod da Server Action (fonte única de
    // verdade); aqui só convertemos texto de input para o tipo que o
    // schema espera, sem duplicar regra de negócio.
    const payload: SalvarProdutoInput = {
      id: initialData?.id,
      name,
      slug,
      description: description.trim() ? description : null,
      baseType: baseType.trim() ? baseType : null,
      baseThicknessMm: baseThicknessMm.trim() ? Number(baseThicknessMm) : null,
      isFeatured,
      status,
      seoTitle: seoTitle.trim() ? seoTitle : null,
      seoDescription: seoDescription.trim() ? seoDescription : null,
      variants: variants.map((v) => ({
        id: v.id,
        sizeId: v.sizeId || null,
        colorId: v.colorId || null,
        grayLevelId: v.grayLevelId || null,
        lengthCm: v.lengthCm.trim() ? Number(v.lengthCm) : null,
        sku: v.sku,
        stockQty: Number(v.stockQty || "0"),
        priceCents: reaisParaCentavos(Number(v.priceReais || "0")),
        compareAtPriceCents: v.compareAtPriceReais.trim()
          ? reaisParaCentavos(Number(v.compareAtPriceReais))
          : null,
        isActive: v.isActive,
      })),
      discountRules: rules.map((r) => ({
        id: r.id,
        minQty: Number(r.minQty || "0"),
        unitPriceCents: r.mode === "preco" && r.unitPriceReais.trim() ? reaisParaCentavos(Number(r.unitPriceReais)) : null,
        discountPercent: r.mode === "percentual" && r.discountPercent.trim() ? Number(r.discountPercent) : null,
        label: r.label.trim() ? r.label : null,
        isActive: r.isActive,
      })),
    };

    setSalvando(true);
    const resultado = await salvarProdutoAction(payload);
    setSalvando(false);

    // Em caso de sucesso, a própria Server Action já faz redirect() para
    // /admin/produtos — chegar aqui só acontece no caminho de erro.
    if (resultado?.error) {
      setErro(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-10 pb-16" noValidate>
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl text-ink">Produto</h2>

        <FormField label="Nome" error={null}>
          {(props) => (
            <input
              {...props}
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={inputClass}
            />
          )}
        </FormField>

        <FormField label="Slug" hint="Usado na URL pública. Gerado do nome, mas pode editar." error={null}>
          {(props) => (
            <input
              {...props}
              required
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              className={inputClass}
            />
          )}
        </FormField>

        <FormField label="Descrição" error={null}>
          {(props) => (
            <textarea
              {...props}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          )}
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Tipo de base" error={null}>
            {(props) => (
              <input
                {...props}
                value={baseType}
                onChange={(e) => setBaseType(e.target.value)}
                className={inputClass}
              />
            )}
          </FormField>

          <FormField label="Espessura (mm)" error={null}>
            {(props) => (
              <input
                {...props}
                type="number"
                step="0.01"
                min="0"
                value={baseThicknessMm}
                onChange={(e) => setBaseThicknessMm(e.target.value)}
                className={inputClass}
              />
            )}
          </FormField>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="h-5 w-5"
            />
            Produto em destaque
          </label>

          <FormField label="Status" error={null}>
            {(props) => (
              <select
                {...props}
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className={selectClass}
              >
                <option value="draft">Rascunho</option>
                <option value="active">Ativo</option>
                <option value="archived">Arquivado</option>
              </select>
            )}
          </FormField>
        </div>

        <FormField label="SEO — título" error={null}>
          {(props) => (
            <input {...props} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={inputClass} />
          )}
        </FormField>

        <FormField label="SEO — descrição" error={null}>
          {(props) => (
            <textarea
              {...props}
              rows={2}
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              className={inputClass}
            />
          )}
        </FormField>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Variantes</h2>
          <Button type="button" variant="secondary" size="sm" onClick={() => setVariants((v) => [...v, novaVariante()])}>
            Adicionar variante
          </Button>
        </div>

        {variants.length === 0 ? (
          <p className="text-sm text-ink/60">Nenhuma variante ainda — adicione ao menos uma para vender este produto.</p>
        ) : null}

        <div className="flex flex-col gap-4">
          {variants.map((variante) => (
            <div key={variante.key} className="grid grid-cols-2 gap-3 rounded-md border border-sand p-4 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-sm text-ink">
                Tamanho
                <select
                  value={variante.sizeId}
                  onChange={(e) => atualizarVariante(variante.key, { sizeId: e.target.value })}
                  className={selectClass}
                >
                  <option value="">—</option>
                  {sizes.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink">
                Cor
                <select
                  value={variante.colorId}
                  onChange={(e) => atualizarVariante(variante.key, { colorId: e.target.value })}
                  className={selectClass}
                >
                  <option value="">—</option>
                  {colors.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink">
                Grisalho
                <select
                  value={variante.grayLevelId}
                  onChange={(e) => atualizarVariante(variante.key, { grayLevelId: e.target.value })}
                  className={selectClass}
                >
                  <option value="">—</option>
                  {grayLevels.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink">
                Comprimento (cm)
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={variante.lengthCm}
                  onChange={(e) => atualizarVariante(variante.key, { lengthCm: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink">
                SKU
                <input
                  required
                  value={variante.sku}
                  onChange={(e) => atualizarVariante(variante.key, { sku: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink">
                Estoque
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={variante.stockQty}
                  onChange={(e) => atualizarVariante(variante.key, { stockQty: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink">
                Preço (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={variante.priceReais}
                  onChange={(e) => atualizarVariante(variante.key, { priceReais: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink">
                Preço "de" (R$, opcional)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={variante.compareAtPriceReais}
                  onChange={(e) => atualizarVariante(variante.key, { compareAtPriceReais: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={variante.isActive}
                  onChange={(e) => atualizarVariante(variante.key, { isActive: e.target.checked })}
                  className="h-5 w-5"
                />
                Ativa
              </label>

              <div className="flex items-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => removerVariante(variante.key)}>
                  Remover variante
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Desconto por quantidade</h2>
          <Button type="button" variant="secondary" size="sm" onClick={() => setRules((r) => [...r, novaRegra()])}>
            Adicionar regra
          </Button>
        </div>

        {rules.length === 0 ? <p className="text-sm text-ink/60">Nenhuma regra de desconto cadastrada.</p> : null}

        <div className="flex flex-col gap-4">
          {rules.map((regra) => (
            <div key={regra.key} className="grid grid-cols-2 gap-3 rounded-md border border-sand p-4 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-sm text-ink">
                Quantidade mínima
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={regra.minQty}
                  onChange={(e) => atualizarRegra(regra.key, { minQty: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink">
                Tipo de desconto
                <select
                  value={regra.mode}
                  onChange={(e) => atualizarRegra(regra.key, { mode: e.target.value as RuleRow["mode"] })}
                  className={selectClass}
                >
                  <option value="percentual">Percentual</option>
                  <option value="preco">Preço unitário fixo</option>
                </select>
              </label>

              {regra.mode === "percentual" ? (
                <label className="flex flex-col gap-1 text-sm text-ink">
                  Desconto (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={regra.discountPercent}
                    onChange={(e) => atualizarRegra(regra.key, { discountPercent: e.target.value })}
                    className={inputClass}
                  />
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-sm text-ink">
                  Preço unitário (R$)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={regra.unitPriceReais}
                    onChange={(e) => atualizarRegra(regra.key, { unitPriceReais: e.target.value })}
                    className={inputClass}
                  />
                </label>
              )}

              <label className="flex flex-col gap-1 text-sm text-ink">
                Rótulo (opcional)
                <input
                  value={regra.label}
                  onChange={(e) => atualizarRegra(regra.key, { label: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={regra.isActive}
                  onChange={(e) => atualizarRegra(regra.key, { isActive: e.target.checked })}
                  className="h-5 w-5"
                />
                Ativa
              </label>

              <div className="flex items-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => removerRegra(regra.key)}>
                  Remover regra
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div>
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
