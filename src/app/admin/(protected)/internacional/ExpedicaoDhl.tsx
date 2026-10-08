"use client";

import { useState } from "react";
import { salvarDadosExpedicaoProdutoAction, salvarExportadorInternacionalAction } from "./actions";

type Exportador = { legal_name: string | null; tax_id: string | null; country: string | null; postal_code: string | null; city: string | null; region: string | null; address_line1: string | null; contact_name: string | null; phone: string | null; email: string | null; invoice_mode: string; dhl_account_confirmed: boolean };
type Variante = { id: string; sku: string; nome: string; shipping_weight_g: number | null; shipping_length_cm: number | null; shipping_width_cm: number | null; shipping_height_cm: number | null; customs_hs_code: string | null; origin_country: string | null };

export function ExpedicaoDhl({ exportador, variantes }: { exportador: Exportador | null; variantes: Variante[] }) {
  const [mensagem, setMensagem] = useState<string | null>(null);
  return <section className="flex flex-col gap-4 rounded-lg border border-sand bg-paper p-4">
    <div><h2 className="font-medium text-ink">Automação DHL — dados obrigatórios</h2><p className="text-xs text-ink/60">Nada é preenchido automaticamente. A etiqueta continua bloqueada enquanto faltar qualquer dado físico ou fiscal.</p></div>
    {mensagem ? <p className="text-sm text-ink/70">{mensagem}</p> : null}
    <form className="grid gap-2 md:grid-cols-3" action={async (fd) => {
      const r = await salvarExportadorInternacionalAction({ legalName: fd.get("legalName"), taxId: fd.get("taxId"), country: fd.get("country"), postalCode: fd.get("postalCode"), city: fd.get("city"), region: fd.get("region") || null, addressLine1: fd.get("addressLine1"), contactName: fd.get("contactName"), phone: fd.get("phone"), email: fd.get("email"), invoiceMode: fd.get("invoiceMode"), dhlAccountConfirmed: fd.get("dhlAccountConfirmed") === "on" });
      setMensagem("error" in r ? r.error : "Exportador salvo.");
    }}>
      {[["legalName","Razão social",exportador?.legal_name],["taxId","CNPJ/ID fiscal",exportador?.tax_id],["country","País ISO",exportador?.country],["postalCode","CEP",exportador?.postal_code],["city","Cidade",exportador?.city],["region","UF/região",exportador?.region],["addressLine1","Endereço",exportador?.address_line1],["contactName","Contato",exportador?.contact_name],["phone","Telefone",exportador?.phone],["email","E-mail",exportador?.email]].map(([name,label,value]) => <label key={name} className="flex flex-col gap-1 text-xs">{label}<input required={name !== "region"} name={name ?? ""} defaultValue={value ?? ""} className="rounded border border-sand px-2 py-2" /></label>)}
      <label className="flex flex-col gap-1 text-xs">Documento fiscal<select name="invoiceMode" defaultValue={exportador?.invoice_mode === "api" ? "api" : "external"} className="rounded border border-sand px-2 py-2"><option value="external">Emitido fora da API</option><option value="api">Gerado pela API DHL</option></select></label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="dhlAccountConfirmed" defaultChecked={exportador?.dhl_account_confirmed ?? false} /> Conta DHL confirmada para a exportadora</label>
      <button className="rounded bg-ink px-3 py-2 text-sm text-paper">Salvar exportador</button>
    </form>
    <div className="flex flex-col gap-3">
      {variantes.map((v) => <form key={v.id} className="grid gap-2 rounded border border-sand p-3 md:grid-cols-7" action={async (fd) => {
        const n = (key: string) => Number(fd.get(key));
        const r = await salvarDadosExpedicaoProdutoAction({ variantId: v.id, weightG: n("weightG"), lengthCm: n("lengthCm"), widthCm: n("widthCm"), heightCm: n("heightCm"), hsCode: fd.get("hsCode"), originCountry: fd.get("originCountry") });
        setMensagem("error" in r ? r.error : `${v.sku} salvo.`);
      }}>
        <div className="text-xs"><strong>{v.sku}</strong><br />{v.nome}</div>
        {[["weightG","Peso g",v.shipping_weight_g],["lengthCm","Comp. cm",v.shipping_length_cm],["widthCm","Larg. cm",v.shipping_width_cm],["heightCm","Alt. cm",v.shipping_height_cm],["hsCode","NCM/HS",v.customs_hs_code],["originCountry","Origem ISO",v.origin_country]].map(([name,label,value]) => <label key={name} className="flex flex-col gap-1 text-xs">{label}<input required name={name as string} defaultValue={value ?? ""} className="rounded border border-sand px-2 py-2" /></label>)}
        <button className="rounded border border-ink px-2 py-1 text-xs md:col-start-7">Salvar</button>
      </form>)}
    </div>
  </section>;
}
