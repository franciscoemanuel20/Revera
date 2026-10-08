import { describe, expect, it, vi } from "vitest";
import { FocusNfeProvider, FocusRequestError, focusReference } from "@/lib/fiscal/focus-nfe";
import { issueWithPermanentReservation } from "@/lib/fiscal/focus-idempotency";
import { focusBlockers, validateFocusPayload, type FiscalSettings } from "@/lib/fiscal/focus-validation";
import type { EntradaProcesso } from "@/lib/internacional/processo-exportacao";

const orderId = "2c4d3a59-0c6e-453d-b5af-78c10cd8c120";
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const mock = (response: Response | Error) => vi.fn(async (_url: string, _init?: RequestInit) => {
  if (response instanceof Error) throw response;
  return response;
});

describe("Focus NFe provider", () => {
  it("usa a mesma referência alfanumérica para o mesmo pedido", () => {
    expect(focusReference(orderId)).toBe(focusReference(orderId.toUpperCase()));
    expect(focusReference(orderId)).toMatch(/^[A-Z0-9]+$/);
  });
  it("separa homologação de produção e usa Basic com senha vazia", async () => {
    const request = mock(ok({ status: "processando_autorizacao" }, 202));
    const p = new FocusNfeProvider("homologacao", "token-de-teste", request as typeof fetch);
    expect((await p.issueOnce(focusReference(orderId), { natureza_operacao: "TESTE" })).status).toBe("processing");
    expect(request.mock.calls[0]![0]).toContain("https://homologacao.focusnfe.com.br/v2/nfe?ref=");
    expect(request.mock.calls[0]![1]?.headers).toMatchObject({ Authorization: `Basic ${Buffer.from("token-de-teste:").toString("base64")}` });
  });
  it("interpreta autorização e rejeição sem guardar resposta bruta", async () => {
    const authorized = new FocusNfeProvider("producao", "test", mock(ok({ status: "autorizado", chave_nfe: "1".repeat(44),
      numero: "23", serie: "1", numero_protocolo: "123", segredo_extra: "não persistir" })) as typeof fetch);
    const result = await authorized.consult(focusReference(orderId));
    expect(result.status).toBe("authorized");
    expect(JSON.stringify(result.safeResponse)).not.toContain("segredo_extra");
    const rejected = new FocusNfeProvider("homologacao", "test", mock(ok({ status: "erro_autorizacao", mensagem_sefaz: "CFOP inválido" })) as typeof fetch);
    expect((await rejected.consult(focusReference(orderId))).rejection).toBe("CFOP inválido");
  });
  it("classifica timeout e HTTP 5xx como ambíguos para consulta posterior", async () => {
    const timeout = new FocusNfeProvider("homologacao", "test", mock(new Error("timeout")) as typeof fetch);
    await expect(timeout.issueOnce("REF", {})).rejects.toMatchObject({ kind: "ambiguous" });
    const http = new FocusNfeProvider("homologacao", "test", mock(ok({}, 503)) as typeof fetch);
    await expect(http.issueOnce("REF", {})).rejects.toMatchObject({ kind: "ambiguous" });
    expect(FocusRequestError).toBeDefined();
  });
  it("recusa caminho remoto no download privado", async () => {
    const p = new FocusNfeProvider("homologacao", "test", mock(ok({})) as typeof fetch);
    await expect(p.download("https://evil.example/doc.xml")).rejects.toMatchObject({ kind: "configuration" });
    await expect(p.download("/../token")).rejects.toMatchObject({ kind: "configuration" });
  });
  it("prepara cancelamento sem chamar HTTP", () => {
    const request = mock(ok({})); const p = new FocusNfeProvider("homologacao", "test", request as typeof fetch);
    expect(p.prepareCancellation("REF")).toEqual({ method: "DELETE", path: "/v2/nfe/REF", requiresJustification: true });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("reserva permanente da emissão", () => {
  it("não faz segundo POST após autorização ou timeout", async () => {
    let claimed = false; const post = vi.fn(async () => ({ status: "autorizado" }));
    const reserve = async () => claimed ? null : (claimed = true, { id: 1 });
    expect((await issueWithPermanentReservation(reserve, async () => {}, post)).state).toBe("sent");
    expect((await issueWithPermanentReservation(reserve, async () => {}, post)).state).toBe("existing");
    expect(post).toHaveBeenCalledTimes(1);
    claimed = false; const lost = vi.fn(async () => { throw new Error("response lost"); });
    expect((await issueWithPermanentReservation(reserve, async () => {}, lost)).state).toBe("unknown");
    expect((await issueWithPermanentReservation(reserve, async () => {}, lost)).state).toBe("existing");
    expect(lost).toHaveBeenCalledTimes(1);
  });
  it("não faz POST se a validação final antes da chamada falhar", async () => {
    const post = vi.fn(async () => ({ status: "autorizado" }));
    const result = await issueWithPermanentReservation(async () => ({ id: 1 }),
      async () => { throw new Error("snapshot changed"); }, post);
    expect(result.state).toBe("unknown");
    expect(post).not.toHaveBeenCalled();
  });
});

const settings: FiscalSettings = { cfop: "7501", natureza_operacao: "validada", tributacao: "validada",
  regime_exportacao: "validado", serie: "1", numeracao: "Focus", emitente_confirmado: true, contador_validou: true };
const entrada: EntradaProcesso = { internacional: true, pago: true, cancelado: false,
  contato: { nome: "Teste" }, destino: { country: "DE", city: "Berlin", line1: "Rua 1" },
  linhas: [{ id: "item1", nome: "Produto teste", quantity: 1 }],
  itens: [{ order_item_id: "item1", ncm: "67042000", hs_code: "670420", country_of_origin: "BR",
    description_en: "Hairpiece", net_weight_g: 75, customs_value_cents: 1000, fiscal_value_brl_cents: 6000,
    fx_rate_brl_per_unit: 6, fx_source: "test", fx_date: "2026-10-07" }],
  pacote: { gross_weight_g: 100, length_cm: 20, width_cm: 10, height_cm: 10, incoterm: "DAP" },
  documentos: [], exportador: null, rastreio: null, remessaEmProcessamento: false,
  moedaPedido: "EUR", valorMercadoriasCents: 1000 };

describe("trava fiscal", () => {
  it("bloqueia campos humanos e caixa sem peso bruto", () => {
    const p = { ...entrada, pacote: null };
    expect(focusBlockers(p, null).join(" ")).toContain("CFOP");
    expect(focusBlockers(p, null).join(" ")).toContain("peso bruto");
  });
  it("recusa NF-e com NCM ou valor diferente do snapshot", () => {
    const payload = { natureza_operacao: "validada", serie: "1", tipo_documento: 1, local_destino: 3,
      nome_destinatario: "Teste", cnpj_emitente: "1".repeat(14), valor_produtos: 60, valor_total: 60,
      items: [{ codigo_ncm: "39191000", cfop: "7501", quantidade_comercial: 1, valor_bruto: 60,
        descricao: "Produto", unidade_comercial: "UN", valor_unitario_comercial: 60 }] };
    expect(validateFocusPayload(payload, entrada, settings).join(" ")).toContain("diverge");
  });
});
