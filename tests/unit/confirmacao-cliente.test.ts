/**
 * E-mail de confirmação ao cliente (07/10/2026): idioma pelo país, CDC só
 * para entrega no Brasil, Muster alemão, e UM e-mail por pedido.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "../stubs/fake-supabase";

class ConfirmationBank extends FakeSupabase {
  async rpc(name: string, args: Record<string, unknown>) {
    if (name === "reserve_paid_confirmations") {
      for (const order of this.tabela("orders")) {
        if (args.p_order_id && order.id !== args.p_order_id) continue;
        if (order.payment_status !== "paid") continue;
        const customer = this.tabela("customers").find(c => c.id === order.customer_id);
        if (!String(customer?.email ?? "").includes("@")) continue;
        const r = await this.from("order_notifications").insert({order_id: order.id,
          kind: "confirmacao_cliente", channel: "email", sent_at: null, attempts: 5, confirmation_attempts: 0,
          confirmation_review_required: false, confirmation_next_attempt_at: new Date(0).toISOString()});
        if (r.error && (r.error as {code:string}).code !== "23505") return r;
      }
      return {data:null,error:null};
    }
    if (name === "paid_confirmation_candidates") {
      const eligible=this.tabela("order_notifications").filter(q=>{
        const o=this.tabela("orders").find(o=>o.id===q.order_id);
        const c=this.tabela("customers").find(c=>c.id===o?.customer_id);
        return o?.payment_status==="paid" && !o.canceled_at && String(c?.email??"").includes("@") && !q.sent_at && !q.confirmation_review_required;
      }); return {data:eligible.slice(0,10),error:null};
    }
    const row = this.tabela("order_notifications").find(r => r.order_id === args.p_order_id);
    if (name === "claim_paid_confirmation") {
      if (!row || row.sent_at || row.confirmation_lease || row.confirmation_review_required) return {data:[],error:null};
      if (row.confirmation_first_attempt_at && Date.parse(String(row.confirmation_first_attempt_at)) < Date.now()-20*3600000) {
        row.confirmation_review_required = true; return {data:[],error:null};
      }
      row.confirmation_payload ??= args.p_payload;
      row.confirmation_had_uncertain_attempt = Boolean(row.confirmation_had_uncertain_attempt || row.confirmation_first_attempt_at);
      row.confirmation_first_attempt_at ??= new Date().toISOString();
      row.confirmation_lease = "lease";
      row.attempts = Math.max(Number(row.attempts), 5);
      row.confirmation_attempts = Number(row.confirmation_attempts ?? 0) + 1;
      return {data:[{lease:"lease",payload:row.confirmation_payload}],error:null};
    }
    if (name === "finish_paid_confirmation" && row && row.confirmation_lease === args.p_lease) {
      row.confirmation_lease = null;
      row.last_error = args.p_sent ? null : args.p_error;
      if (args.p_sent) row.sent_at = new Date().toISOString();
      if (args.p_definite_failure && !row.confirmation_had_uncertain_attempt) {row.confirmation_first_attempt_at = null;row.confirmation_payload=null;}
      return {data:true,error:null};
    }
    return {data:false,error:null};
  }
}

const PEDIDO = "66666666-6666-4666-8666-666666666666";
const enviar = vi.fn();

vi.mock("@/lib/notificacoes/email-operacional", () => ({
  enviarEmail: (...a: unknown[]) => enviar(...a),
  remetente: () => "Revera <avisos@avisos.exemplo.com>",
}));

const base = {
  orderNumber: "REV-T1",
  accessToken: "tok",
  currency: "EUR",
  subtotalCents: 14650,
  discountCents: 0,
  shippingCents: 8631,
  totalCents: 23281,
  nome: "Ivan Pineda Mota",
  itens: [{ product_name_snapshot: "Micropele 0,08mm", variant_label_snapshot: "1b", quantity: 1, subtotal_cents: 14650 }],
  endereco: ["Ivan Pineda Mota", "Hauptstraße 1", "85521 Ottobrunn"],
  base: "https://loja.test",
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("RESEND_API_KEY", "re_teste");
  vi.stubEnv("REVERA_CONFIRMATION_SEND_ENABLED", "1");
  enviar.mockReset().mockResolvedValue({ estado: "enviado", id: "x" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("montarConfirmacao", () => {
  it("Alemanha: alemão, Muster-Widerrufsbelehrung e formulário, sem CDC", async () => {
    const { montarConfirmacao } = await import("@/lib/notificacoes/confirmacao-cliente");
    const m = montarConfirmacao({ ...base, pais: "DE" });
    expect(m.idioma).toBe("de");
    expect(m.assunto).toContain("REV-T1");
    expect(m.texto).toContain("Hallo Ivan,");
    expect(m.texto).toContain("je nachdem, welches der frühere Zeitpunkt ist");
    expect(m.texto).toContain("– Ende der Widerrufsbelehrung –");
    expect(m.texto).toContain("MUSTER-WIDERRUFSFORMULAR");
    expect(m.texto).toContain("https://loja.test/pedido/tok");
    expect(m.texto).not.toContain("Código de Defesa do Consumidor");
  });

  it("Brasil: português com os 7 dias do CDC", async () => {
    const { montarConfirmacao } = await import("@/lib/notificacoes/confirmacao-cliente");
    const m = montarConfirmacao({ ...base, currency: "BRL", pais: "BR" });
    expect(m.idioma).toBe("pt");
    expect(m.texto).toContain("art. 49 do Código de Defesa do Consumidor");
    expect(m.texto).toContain("MODELO DE FORMULÁRIO DE DESISTÊNCIA");
  });

  it("país não-Brasil em português não recebe a regra do CDC", async () => {
    const { montarConfirmacao } = await import("@/lib/notificacoes/confirmacao-cliente");
    const m = montarConfirmacao({ ...base, pais: "PT" });
    expect(m.texto).not.toContain("Código de Defesa do Consumidor");
  });
});

describe("enviarConfirmacaoAoCliente", () => {
  function banco(email: string | null = "ivan@example.com") {
    return new ConfirmationBank(
      {
        orders: [{ payment_status: "paid", id: PEDIDO, order_number: "REV-T1", access_token: "tok", currency: "EUR", subtotal_cents: 14650, discount_cents: 0, shipping_cents: 8631, total_cents: 23281, customer_id: "c1", address_id: "a1" }],
        customers: [{ id: "c1", full_name: "Ivan Pineda Mota", email, phone: "+49" }],
        addresses: [{ id: "a1", country: "DE", recipient_name: "Ivan Pineda Mota", company: null, cep: null, street: null, number: null, complement: null, neighborhood: null, city: "Ottobrunn", state: null, line1: "Hauptstraße 1", line2: null, postal_code: "85521", region: null }],
        order_items: [{ order_id: PEDIDO, product_name_snapshot: "Micropele 0,08mm", variant_label_snapshot: "1b", quantity: 1, subtotal_cents: 14650 }],
        order_notifications: [] as Array<Record<string, unknown>>,
      },
      [{ tabela: "order_notifications", colunas: ["order_id", "kind"] }]
    );
  }

  it("envia uma vez só, com resposta para o e-mail da empresa", async () => {
    const fake = banco();
    const { enviarConfirmacaoAoCliente } = await import("@/lib/notificacoes/confirmacao-cliente");
    await enviarConfirmacaoAoCliente(fake as never, PEDIDO);
    await enviarConfirmacaoAoCliente(fake as never, PEDIDO);
    expect(enviar).toHaveBeenCalledTimes(1);
    const msg = enviar.mock.calls[0]?.[0] as { para: string[]; de: string; responderPara: string; assunto: string };
    expect(msg.para).toEqual(["ivan@example.com"]);
    expect(msg.de).toBe("Reverá <avisos@avisos.exemplo.com>");
    expect(msg.responderPara).toContain("@");
    expect(msg.assunto).toContain("Bestellung REV-T1");
    expect(fake.tabela("order_notifications")[0]).toMatchObject({ kind: "confirmacao_cliente", channel: "email" });
    expect(fake.tabela("order_notifications")[0]?.sent_at).toBeTruthy();
  });

  it("sem e-mail do cliente não reserva nem envia", async () => {
    const fake = banco(null);
    const { enviarConfirmacaoAoCliente } = await import("@/lib/notificacoes/confirmacao-cliente");
    await enviarConfirmacaoAoCliente(fake as never, PEDIDO);
    expect(enviar).not.toHaveBeenCalled();
    expect(fake.tabela("order_notifications")).toHaveLength(0);
  });

  it("falha no envio não lança, guarda o motivo e o reenvio periódico completa", async () => {
    enviar.mockResolvedValueOnce({ estado: "erro", motivo: "Resend fora" });
    const fake = banco();
    const mod = await import("@/lib/notificacoes/confirmacao-cliente");
    await expect(mod.enviarConfirmacaoAoCliente(fake as never, PEDIDO)).resolves.toBeUndefined();
    const linha = fake.tabela("order_notifications")[0]!;
    expect(linha.sent_at ?? null).toBeNull();
    expect(linha.last_error).toBe("Resend fora");
    expect(linha.confirmation_attempts).toBe(1);
    linha.created_at = new Date(Date.now() - 10 * 60_000).toISOString();
    linha.sent_at = null; // no banco real a coluna nasce nula
    await expect(mod.reenviarConfirmacoesPendentes(fake as never)).resolves.toBe(1);
    expect(fake.tabela("order_notifications")[0]?.sent_at).toBeTruthy();
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("sem RESEND_API_KEY preserva reserva e recupera quando disponível", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fake = banco();
    const { enviarConfirmacaoAoCliente } = await import("@/lib/notificacoes/confirmacao-cliente");
    await enviarConfirmacaoAoCliente(fake as never, PEDIDO);
    expect(fake.tabela("order_notifications")).toHaveLength(1);
    expect(enviar).not.toHaveBeenCalled();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const { reenviarConfirmacoesPendentes } = await import("@/lib/notificacoes/confirmacao-cliente");
    expect(await reenviarConfirmacoesPendentes(fake as never)).toBe(1);
  });
  it("recupera falha de reserva a partir do pedido pago", async () => {
    const fake = banco(); fake.falharProxima("order_notifications", "insert");
    const mod = await import("@/lib/notificacoes/confirmacao-cliente");
    await mod.enviarConfirmacaoAoCliente(fake as never, PEDIDO);
    expect(enviar).not.toHaveBeenCalled();
    expect(await mod.reenviarConfirmacoesPendentes(fake as never)).toBe(1);
  });
  it("não abandona reserva sem envio com mais de20h e5tentativas", async () => {
    const fake = banco(); vi.stubEnv("RESEND_API_KEY", "");
    const mod = await import("@/lib/notificacoes/confirmacao-cliente");
    await mod.enviarConfirmacaoAoCliente(fake as never, PEDIDO);
    Object.assign(fake.tabela("order_notifications")[0]!, {attempts:8,created_at:new Date(0).toISOString()});
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(await mod.reenviarConfirmacoesPendentes(fake as never)).toBe(1);
  });
  it("duas recuperações concorrentes enviam uma única mensagem", async () => {
    const fake = banco(); const mod = await import("@/lib/notificacoes/confirmacao-cliente");
    await Promise.all([mod.reenviarConfirmacoesPendentes(fake as never),mod.reenviarConfirmacoesPendentes(fake as never)]);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
  it("resultado incerto antigo fica observável sem reenvio", async () => {
    const fake = banco();vi.stubEnv("RESEND_API_KEY", "");
    const mod = await import("@/lib/notificacoes/confirmacao-cliente");
    await mod.enviarConfirmacaoAoCliente(fake as never,PEDIDO);
    fake.tabela("order_notifications")[0]!.confirmation_first_attempt_at = new Date(0).toISOString();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(await mod.reenviarConfirmacoesPendentes(fake as never)).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
    expect(fake.tabela("order_notifications")[0]!.confirmation_review_required).toBe(true);
  });
  it("transporte desligado ainda recupera intenção sem enviar backlog", async () => {
    vi.stubEnv("REVERA_CONFIRMATION_SEND_ENABLED", "0");
    const fake = banco();const mod=await import("@/lib/notificacoes/confirmacao-cliente");
    expect(await mod.reenviarConfirmacoesPendentes(fake as never)).toBe(0);
    expect(fake.tabela("order_notifications")).toHaveLength(1);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("recusa após timeout não apaga a primeira tentativa incerta",async()=>{
    const fake=banco();const mod=await import("@/lib/notificacoes/confirmacao-cliente");
    enviar.mockResolvedValueOnce({estado:"erro",motivo:"timeout"});
    await mod.enviarConfirmacaoAoCliente(fake as never,PEDIDO);
    const first=fake.tabela("order_notifications")[0]!.confirmation_first_attempt_at;
    enviar.mockResolvedValueOnce({estado:"erro",motivo:"429",definiteFailure:true});
    await mod.reenviarConfirmacoesPendentes(fake as never);
    expect(fake.tabela("order_notifications")[0]!.confirmation_first_attempt_at).toBe(first);
  });
  it("dez reservas canceladas não bloqueiam pedido pago seguinte",async()=>{
    const fake=banco();for(let i=0;i<10;i++){
      fake.tabela("orders").unshift({id:"cancel"+i,customer_id:"c1",payment_status:"paid",canceled_at:"now"});
      fake.tabela("order_notifications").push({order_id:"cancel"+i,kind:"confirmacao_cliente",sent_at:null,confirmation_review_required:false});
    }
    const mod=await import("@/lib/notificacoes/confirmacao-cliente");
    expect(await mod.reenviarConfirmacoesPendentes(fake as never)).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("recusa comprovada permite corrigir destinatário e recuperar",async()=>{
    const fake=banco();const mod=await import("@/lib/notificacoes/confirmacao-cliente");
    enviar.mockResolvedValueOnce({estado:"erro",motivo:"422",definiteFailure:true});
    await mod.enviarConfirmacaoAoCliente(fake as never,PEDIDO);
    fake.tabela("customers")[0]!.email="corrected@example.invalid";
    expect(await mod.reenviarConfirmacoesPendentes(fake as never)).toBe(1);
    expect(enviar.mock.calls[1]![0].para).toEqual(["corrected@example.invalid"]);
  });

});
