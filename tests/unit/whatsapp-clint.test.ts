import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O modo `clint` do aviso de WhatsApp (03/09/2026).
 *
 * Nada aqui toca a Clint: o `fetch` é falso e conta as chamadas. O que se
 * prova é o contrato — sem variável não sai nada; com tudo configurado sai
 * UM template, para o contato certo, sem `parameters` e sem `chat_id`; e a
 * recusa da Clint vira `erro` com motivo, nunca exceção.
 */

vi.mock("@/lib/config/ambiente", () => ({
  podeUsarServicosReais: () => ambienteProducao,
  descricaoDoAmbiente: () => "teste",
}));

let ambienteProducao = true;

import { enviarWhatsApp, modoWhatsApp } from "@/lib/notificacoes/whatsapp";

const ORIGINAL = { ...process.env };
const DESTINO = "5512981409901";

type Chamada = { url: string; init?: RequestInit };
let chamadas: Chamada[] = [];

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchFalso(roteiro: (c: Chamada) => Response) {
  return vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const chamada = { url: String(entrada), init };
    chamadas.push(chamada);
    return roteiro(chamada);
  });
}

function configurarClint() {
  process.env.WHATSAPP_PROVIDER = "clint";
  process.env.CLINT_API_TOKEN = "token-de-teste";
  process.env.CLINT_CANAL_ID = "canal-1";
  process.env.CLINT_TEMPLATE_ID = "template-1";
}

beforeEach(() => {
  ambienteProducao = true;
  chamadas = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  for (const nome of [
    "WHATSAPP_PROVIDER",
    "CLINT_API_TOKEN",
    "CLINT_CANAL_ID",
    "CLINT_TEMPLATE_ID",
  ]) {
    delete process.env[nome];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("modo clint", () => {
  it("é reconhecido como modo próprio em produção", () => {
    process.env.WHATSAPP_PROVIDER = "clint";
    expect(modoWhatsApp()).toBe("clint");
  });

  it("fora de produção cai para simulado e não chama a Clint", async () => {
    ambienteProducao = false;
    configurarClint();
    vi.stubGlobal("fetch", fetchFalso(() => respostaJson(500, {})));

    const r = await enviarWhatsApp({ para: DESTINO, texto: "x", parametros: [] });

    expect(r).toEqual({ estado: "enviado", providerMessageId: null });
    expect(chamadas).toHaveLength(0);
  });

  it("sem CLINT_API_TOKEN devolve erro nomeando a variável, sem chamar nada", async () => {
    process.env.WHATSAPP_PROVIDER = "clint";
    process.env.CLINT_CANAL_ID = "canal-1";
    process.env.CLINT_TEMPLATE_ID = "template-1";
    vi.stubGlobal("fetch", fetchFalso(() => respostaJson(200, {})));

    const r = await enviarWhatsApp({ para: DESTINO, texto: "x", parametros: [] });

    expect(r.estado).toBe("erro");
    expect(r.estado === "erro" && r.motivo).toContain("CLINT_API_TOKEN");
    expect(chamadas).toHaveLength(0);
  });

  it("acha o contato pelo telefone e manda o template fixo, sem parâmetros", async () => {
    configurarClint();
    vi.stubGlobal(
      "fetch",
      fetchFalso((c) => {
        if (c.url.includes("/v1/contacts?")) {
          return respostaJson(200, [{ id: "c-equipe", phone: "+55 (12) 98140-9901" }]);
        }
        if (c.url.endsWith("/v2/messages/template")) {
          return respostaJson(200, { data: { id: "msg-1" } });
        }
        return respostaJson(404, {});
      })
    );

    const r = await enviarWhatsApp({
      para: DESTINO,
      texto: "NOVA VENDA",
      parametros: ["RV-1", "Cliente", "Produto", "1", "R$ 1,00", "SJC/SP", "https://x"],
    });

    expect(r).toEqual({ estado: "enviado", providerMessageId: "msg-1" });
    const envio = chamadas.find((c) => c.url.endsWith("/v2/messages/template"));
    expect(envio).toBeDefined();
    expect(envio?.init?.method).toBe("POST");
    expect((envio?.init?.headers as Record<string, string>)["api-token"]).toBe("token-de-teste");
    const corpo = JSON.parse(String(envio?.init?.body));
    expect(corpo).toEqual({
      channel_account_id: "canal-1",
      contact_id: "c-equipe",
      template_id: "template-1",
    });
    // nenhum POST em /v1/contacts: o contato já existia
    expect(chamadas.some((c) => c.url.endsWith("/v1/contacts") && c.init?.method === "POST")).toBe(
      false
    );
  });

  it("cria o contato quando a busca não acha, e só então envia", async () => {
    configurarClint();
    vi.stubGlobal(
      "fetch",
      fetchFalso((c) => {
        if (c.url.includes("/v1/contacts?")) return respostaJson(200, { data: [] });
        if (c.url.endsWith("/v1/contacts")) return respostaJson(201, { data: { id: "c-novo" } });
        if (c.url.endsWith("/v2/messages/template")) return respostaJson(200, { id: "msg-2" });
        return respostaJson(404, {});
      })
    );

    const r = await enviarWhatsApp({ para: DESTINO, texto: "x", parametros: [] });

    expect(r).toEqual({ estado: "enviado", providerMessageId: "msg-2" });
    const criacao = chamadas.find(
      (c) => c.url.endsWith("/v1/contacts") && c.init?.method === "POST"
    );
    expect(JSON.parse(String(criacao?.init?.body)).phone).toBe(DESTINO);
    const envio = chamadas.find((c) => c.url.endsWith("/v2/messages/template"));
    expect(JSON.parse(String(envio?.init?.body)).contact_id).toBe("c-novo");
  });

  it("recusa da Clint vira erro com o motivo dela, sem lançar", async () => {
    configurarClint();
    vi.stubGlobal(
      "fetch",
      fetchFalso((c) => {
        if (c.url.includes("/v1/contacts?")) return respostaJson(200, [{ id: "c1", phone: DESTINO }]);
        return respostaJson(400, { error: { message: "Template must have APPROVED status" } });
      })
    );

    const r = await enviarWhatsApp({ para: DESTINO, texto: "x", parametros: [] });

    expect(r.estado).toBe("erro");
    expect(r.estado === "erro" && r.motivo).toBe(
      "Clint recusou: Template must have APPROVED status"
    );
  });

  it("falha de rede vira erro, não exceção", async () => {
    configurarClint();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("rede caiu");
      })
    );

    const r = await enviarWhatsApp({ para: DESTINO, texto: "x", parametros: [] });

    expect(r).toEqual({ estado: "erro", motivo: "Clint: rede caiu" });
  });
});
