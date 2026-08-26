import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { ColorHelpTab, type ColorHelpItem } from "./ColorHelpTab";
import { WarrantyTab, type WarrantyItem } from "./WarrantyTab";
import { ProfessionalTab, type ProfessionalItem } from "./ProfessionalTab";

const ABAS = [
  { id: "cor", label: "Ajuda de cor" },
  { id: "garantia", label: "Garantia" },
  { id: "profissionais", label: "Profissionais" },
] as const;

// Duração da signed URL da foto de ajuda de cor — curta de propósito (é
// dado sensível de LGPD, ver supabase/migrations/00000000000004_storage_color_help.sql):
// tempo suficiente para a página renderizar e o admin olhar a foto uma vez,
// não para virar um link compartilhável que sobrevive depois que a aba
// fecha.
const DURACAO_URL_ASSINADA_SEGUNDOS = 5 * 60;

export default async function SolicitacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const abaAtiva = ABAS.find((a) => a.id === tab)?.id ?? "cor";

  const supabase = await createClient();

  const [{ data: corRequests, error: erroCor }, { data: colors }, { data: warrantyRequests, error: erroGarantia }, { data: pedidosDaGarantia }, { data: leads, error: erroLeads }] =
    await Promise.all([
      supabase
        .from("color_help_requests")
        .select("id, customer_name, contact, photo_url, status, suggested_color_id, admin_notes, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("colors").select("id, code, name").order("sort_order"),
      supabase
        .from("warranty_requests")
        .select("id, order_id, description, photo_urls, video_urls, status, admin_notes, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("orders").select("id, order_number"),
      supabase
        .from("professional_leads")
        .select("id, full_name, phone, email, business_name, city, message, status, created_at")
        .order("created_at", { ascending: false }),
    ]);

  const erro = erroCor || erroGarantia || erroLeads;
  if (erro) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl text-ink">Solicitações</h1>
        <p className="text-sm text-red-700">
          Não foi possível carregar as solicitações. Se isto persistir, confira se a migration
          00000000000005_admin_pedidos_policies.sql já foi aplicada no Supabase.
        </p>
      </div>
    );
  }

  // Geração de signed URL para a foto de color_help_requests — EXCEÇÃO
  // documentada ao "admin usa createClient(), nunca createAdminClient()":
  // o bucket "color-help" não tem NENHUMA policy de select (nem para
  // authenticated), então nem a sessão de um admin autenticado consegue
  // gerar a assinatura — só o service role, que ignora RLS/storage policy
  // por completo. Ver supabase/migrations/00000000000004_storage_color_help.sql,
  // que já previa exatamente este caso ("quem for exibir a foto depois...
  // precisa gerar signed URL com o client de service role").
  const colorHelpItems: ColorHelpItem[] = await Promise.all(
    (corRequests ?? []).map(async (r) => {
      let signedPhotoUrl: string | null = null;
      if (r.photo_url) {
        try {
          const adminSupabase = createAdminClient();
          const { data } = await adminSupabase.storage
            .from("color-help")
            .createSignedUrl(r.photo_url, DURACAO_URL_ASSINADA_SEGUNDOS);
          signedPhotoUrl = data?.signedUrl ?? null;
        } catch {
          signedPhotoUrl = null;
        }
      }
      return {
        id: r.id,
        customerName: r.customer_name,
        contact: r.contact,
        status: r.status,
        suggestedColorId: r.suggested_color_id,
        adminNotes: r.admin_notes,
        createdAt: r.created_at,
        signedPhotoUrl,
      };
    })
  );

  const mapaPedidos = new Map((pedidosDaGarantia ?? []).map((p) => [p.id as string, p.order_number as string]));
  const warrantyItems: WarrantyItem[] = (warrantyRequests ?? []).map((w) => ({
    id: w.id,
    orderNumber: mapaPedidos.get(w.order_id) ?? null,
    description: w.description,
    photoUrls: w.photo_urls ?? [],
    videoUrls: w.video_urls ?? [],
    status: w.status,
    adminNotes: w.admin_notes,
    createdAt: w.created_at,
  }));

  const professionalItems: ProfessionalItem[] = (leads ?? []).map((l) => ({
    id: l.id,
    fullName: l.full_name,
    phone: l.phone,
    email: l.email,
    businessName: l.business_name,
    city: l.city,
    message: l.message,
    status: l.status,
    createdAt: l.created_at,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-ink">Solicitações</h1>

      <div className="flex flex-wrap gap-2">
        {ABAS.map((aba) => (
          <Link
            key={aba.id}
            href={`/admin/solicitacoes?tab=${aba.id}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              aba.id === abaAtiva ? "border-gold bg-gold/10 text-ink" : "border-sand text-ink/70 hover:bg-sand"
            }`}
          >
            {aba.label}
          </Link>
        ))}
      </div>

      {abaAtiva === "cor" ? (
        <ColorHelpTab
          items={colorHelpItems}
          colors={(colors ?? []).map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
        />
      ) : null}
      {abaAtiva === "garantia" ? <WarrantyTab items={warrantyItems} /> : null}
      {abaAtiva === "profissionais" ? <ProfessionalTab items={professionalItems} /> : null}
    </div>
  );
}
