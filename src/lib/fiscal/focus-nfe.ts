import { createHash } from "node:crypto";

export type FocusEnvironment = "homologacao" | "producao";
export type FocusStatus = "processing" | "authorized" | "rejected" | "cancelled" | "unknown";
export type FocusResult = {
  status: FocusStatus;
  rawStatus: string | null;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  protocol: string | null;
  rejection: string | null;
  xmlPath: string | null;
  danfePath: string | null;
  safeResponse: Record<string, string | null>;
};

const BASE: Record<FocusEnvironment, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

export function focusReference(orderId: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(orderId)) throw new Error("Identificador de pedido inválido");
  return `REVERA${createHash("sha256").update(orderId.toLowerCase()).digest("hex").slice(0, 32).toUpperCase()}`;
}

export function normalizeFocusResponse(input: unknown): FocusResult {
  const o = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const str = (key: string) => typeof o[key] === "string" ? (o[key] as string).slice(0, 500) : null;
  const rawStatus = str("status");
  const status: FocusStatus = rawStatus === "autorizado" ? "authorized"
    : rawStatus === "processando_autorizacao" ? "processing"
    : rawStatus === "erro_autorizacao" || rawStatus === "denegado" ? "rejected"
    : rawStatus === "cancelado" ? "cancelled" : "unknown";
  const result = {
    status, rawStatus, number: str("numero"), series: str("serie"), accessKey: str("chave_nfe"),
    protocol: str("numero_protocolo"), rejection: status === "rejected" ? str("mensagem_sefaz") : null,
    xmlPath: str("caminho_xml_nota_fiscal"), danfePath: str("caminho_danfe"),
  };
  return { ...result, safeResponse: { status: result.rawStatus, numero: result.number, serie: result.series,
    chave_nfe: result.accessKey, numero_protocolo: result.protocol,
    status_sefaz: str("status_sefaz"), mensagem_sefaz: str("mensagem_sefaz") } };
}

export class FocusRequestError extends Error {
  constructor(readonly kind: "ambiguous" | "rejected" | "not_found" | "configuration", message: string) {
    super(message);
  }
}

export class FocusNfeProvider {
  private readonly base: string;
  private readonly auth: string;
  constructor(readonly environment: FocusEnvironment, token: string,
    private readonly request: typeof fetch = fetch) {
    if (!token.trim()) throw new FocusRequestError("configuration", "FOCUS_NFE_TOKEN ausente");
    this.base = BASE[environment];
    this.auth = `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
  }

  private async call(path: string, method: "GET" | "POST", payload?: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      return await this.request(`${this.base}${path}`, { method, signal: controller.signal,
        headers: { Authorization: this.auth, Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json" } : {}) },
        ...(payload ? { body: JSON.stringify(payload) } : {}) });
    } catch {
      throw new FocusRequestError("ambiguous", "Resposta da Focus desconhecida; consulte a referência antes de qualquer ação.");
    } finally { clearTimeout(timer); }
  }

  private async json(response: Response): Promise<FocusResult> {
    if (!response.ok) {
      if (response.status === 404) throw new FocusRequestError("not_found", "Referência não encontrada na Focus.");
      // 4xx da emissão pode indicar validação ou nota já existente. A consulta por
      // referência decide o estado; não repetimos o POST automaticamente.
      throw new FocusRequestError(response.status >= 500 ? "ambiguous" : "rejected",
        `Focus respondeu HTTP ${response.status}; consulte a referência para reconciliar.`);
    }
    try { return normalizeFocusResponse(await response.json()); }
    catch { throw new FocusRequestError("ambiguous", "Resposta da Focus inválida; consulte a referência."); }
  }

  async issueOnce(reference: string, payload: Record<string, unknown>): Promise<FocusResult> {
    return this.json(await this.call(`/v2/nfe?ref=${encodeURIComponent(reference)}`, "POST", payload));
  }

  async consult(reference: string): Promise<FocusResult> {
    return this.json(await this.call(`/v2/nfe/${encodeURIComponent(reference)}`, "GET"));
  }

  async download(privatePath: string): Promise<Buffer> {
    // A Focus retorna caminhos relativos de arquivos. Nunca aceite host, query,
    // fragmento ou traversal vindos da resposta para evitar SSRF e fuga do token.
    if (!privatePath.startsWith("/") || privatePath.startsWith("//") ||
      privatePath.includes("..") || /[?#\\]/.test(privatePath))
      throw new FocusRequestError("configuration", "Caminho de documento Focus inválido.");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const r = await this.request(`${this.base}${privatePath}`, { signal: controller.signal,
        headers: { Authorization: this.auth } });
      if (!r.ok) throw new Error("download failed");
      const size = Number(r.headers.get("content-length") ?? "0");
      if (size > 10_000_000) throw new Error("document too large");
      const body = Buffer.from(await r.arrayBuffer());
      if (body.length > 10_000_000) throw new Error("document too large");
      return body;
    } catch { throw new FocusRequestError("ambiguous", "Falha ao recuperar documento Focus; consulte novamente."); }
    finally { clearTimeout(timer); }
  }

  prepareCancellation(reference: string): { method: "DELETE"; path: string; requiresJustification: true } {
    return { method: "DELETE", path: `/v2/nfe/${encodeURIComponent(reference)}`, requiresJustification: true };
  }
}

export function focusFromEnvironment(environment: FocusEnvironment) {
  return new FocusNfeProvider(environment, process.env.FOCUS_NFE_TOKEN ?? "");
}
