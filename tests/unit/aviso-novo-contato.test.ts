import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O aviso de contato novo (05/09/2026).
 *
 * O que se prova aqui é o que custou caro descobrir: que o lead entra e
 * ninguém fica sabendo. Nada toca a Clint — o `fetch` é falso.
 */

vi.mock("@/lib/config/ambiente", () => ({
  podeUsarServicosReais: () => true,
  descricaoDoAmbiente: () => "teste",
}));

import { avisarNovoContato } from "@/lib/notificacoes/novo-contato";

const ORIGINAL = { ...process.env };
let chamadas: Array<{ url: string; corpo: Record<string, unknown> }> = [];

function fetchFalso(status = 200) {
  return vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const corpo = init?.body ? JSON.parse(String(init.body)) : {};
    chamadas.push({ url, corpo });
    if (url.includes("/v1/contacts")) {
      // Devolve o contato COM o telefone que foi buscado: a Clint casa pelos
      // 8 últimos dígitos, então um número fixo aqui faria o código achar
      // que não encontrou e partir para criar — mascarando o que se testa.
      const buscado = decodeURIComponent(url.split(/phone=|search=/)[1] ?? "").split("&")[0];
      return new Response(JSON.stringify({ data: [{ id: "contato-1", phone: buscado }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(status === 200 ? { id: "msg-1" } : { error: "recusado" }), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
}

function configurarClint() {
  process.env.WHATSAPP_PROVIDER = "clint";
  process.env.CLINT_API_TOKEN = "token-de-teste";
  process.env.CLINT_CANAL_ID = "canal-1";
  process.env.CLINT_TEMPLATE_ID = "template-da-venda";
  process.env.WHATSAPP_DESTINO = "5511999990000";
}

beforeEach(() => {
  chamadas = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const nome of [
    "WHATSAPP_PROVIDER",
    "CLINT_API_TOKEN",
    "CLINT_CANAL_ID",
    "CLINT_TEMPLATE_ID",
    "CLINT_TEMPLATE_CONTATO_ID",
    "WHATSAPP_DESTINO",
  ]) {
    delete process.env[nome];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("aviso de contato novo", () => {
  it("sem WHATSAPP_PROVIDER não manda nada e não quebra", async () => {
    const fetchSpy = fetchFalso();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(avisarNovoContato("profissional")).resolves.toEqual({ estado: "desligado" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /**
   * O teste que justifica o arquivo inteiro: sem o template próprio, é
   * PROIBIDO cair no da venda paga. A equipe leria "nova venda" por causa de
   * alguém que só pediu ajuda com a cor.
   */
  it("no modo clint sem CLINT_TEMPLATE_CONTATO_ID não usa o template da venda", async () => {
    configurarClint();
    const fetchSpy = fetchFalso();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(avisarNovoContato("ajuda_cor")).resolves.toEqual({ estado: "sem_template" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("com o template configurado manda UM template, o do contato", async () => {
    configurarClint();
    process.env.CLINT_TEMPLATE_CONTATO_ID = "template-do-contato";
    vi.stubGlobal("fetch", fetchFalso());

    await expect(avisarNovoContato("profissional")).resolves.toEqual({ estado: "enviado" });

    const envios = chamadas.filter((c) => c.url.includes("/v2/messages/template"));
    expect(envios).toHaveLength(1);
    const enviado = envios[0]!;
    expect(enviado.corpo.template_id).toBe("template-do-contato");
    expect(enviado.corpo.contact_id).toBe("contato-1");
    // Template fixo: sem parâmetros, e portanto sem nome de cliente na
    // mensagem. Ver o comentário em novo-contato.ts.
    expect(enviado.corpo.parameters).toBeUndefined();
  });

  it("recusa da Clint vira erro com motivo, nunca exceção", async () => {
    configurarClint();
    process.env.CLINT_TEMPLATE_CONTATO_ID = "template-do-contato";
    vi.stubGlobal("fetch", fetchFalso(400));

    const r = await avisarNovoContato("ajuda_cor");
    expect(r.estado).toBe("erro");
  });

  /**
   * `WHATSAPP_DESTINO=" "` é a família do TAB que parou a loja de cobrar em
   * 29/08: espaço em branco é invisível para quem configura. O aviso tem de
   * cair no número da Reverá, não em destino nenhum.
   */
  it("destino em branco cai no número da Reverá em vez de sumir", async () => {
    configurarClint();
    process.env.CLINT_TEMPLATE_CONTATO_ID = "template-do-contato";
    process.env.WHATSAPP_DESTINO = "   ";
    vi.stubGlobal("fetch", fetchFalso());

    await expect(avisarNovoContato("profissional")).resolves.toEqual({ estado: "enviado" });
    const busca = chamadas.find((c) => c.url.includes("/v1/contacts"));
    expect(busca?.url).toContain("5512981499901");
  });
});
