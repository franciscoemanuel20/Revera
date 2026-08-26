import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * As partes do rastreamento que quebram EM SILÊNCIO.
 *
 * Métrica errada não dá erro na tela: o site funciona, a venda acontece, e só
 * semanas depois alguém nota que o relatório não bate. Estes testes existem
 * para os dois pontos onde isso é mais provável.
 */

describe("client_id do GA4 — extração do cookie _ga", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("window", { location: { search: "" } });
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function ler() {
    const mod = await import("@/lib/tracking/atribuicao");
    return mod.lerAtribuicao();
  }

  it("extrai só as duas últimas partes do cookie, não o cookie inteiro", async () => {
    // O cookie _ga tem forma GA1.1.<clientId>. Mandar o cookie inteiro para o
    // Measurement Protocol é o erro clássico: o GA4 aceita, trata como
    // usuário novo, e a compra fica desligada da visita que a gerou.
    vi.stubGlobal("document", { cookie: "_ga=GA1.1.1234567890.1700000000" });
    expect((await ler()).gaClientId).toBe("1234567890.1700000000");
  });

  it("funciona com o formato de domínio profundo (GA1.2.x.y)", async () => {
    vi.stubGlobal("document", { cookie: "_ga=GA1.2.987654321.1699999999" });
    expect((await ler()).gaClientId).toBe("987654321.1699999999");
  });

  it("devolve null quando o cookie não existe — melhor nada que um id inventado", async () => {
    vi.stubGlobal("document", { cookie: "outro=coisa" });
    expect((await ler()).gaClientId).toBeNull();
  });

  it("devolve null para cookie truncado, em vez de mandar lixo ao GA4", async () => {
    vi.stubGlobal("document", { cookie: "_ga=GA1.1" });
    expect((await ler()).gaClientId).toBeNull();
  });

  it("acha o _ga mesmo com outros cookies antes e depois", async () => {
    vi.stubGlobal("document", {
      cookie: "revera_cart_token=abc; _ga=GA1.1.111.222; _fbp=fb.1.333.444",
    });
    const a = await ler();
    expect(a.gaClientId).toBe("111.222");
    expect(a.fbp).toBe("fb.1.333.444");
  });

  it("não confunde _ga com _ga_XXXX, que é outro cookie", async () => {
    // O GA4 escreve também _ga_<container>, com formato diferente. Casar por
    // prefixo pegaria o errado.
    vi.stubGlobal("document", {
      cookie: "_ga_ABC123=GS1.1.999; _ga=GA1.1.111.222",
    });
    expect((await ler()).gaClientId).toBe("111.222");
  });
});

describe("atribuição de campanha", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("a primeira origem da sessão vence a URL atual", async () => {
    // A pessoa chegou pelo Instagram, navegou, e no checkout a URL não tem
    // mais nada — ou tem outra coisa. Quem trouxe a venda foi o Instagram.
    vi.stubGlobal("window", { location: { search: "?utm_source=google" } });
    vi.stubGlobal("sessionStorage", {
      getItem: () => JSON.stringify({ utm_source: "instagram" }),
      setItem: () => {},
    });
    const mod = await import("@/lib/tracking/atribuicao");
    expect(mod.lerAtribuicao().utmSource).toBe("instagram");
  });

  it("usa a URL quando não há nada guardado", async () => {
    vi.stubGlobal("window", { location: { search: "?utm_source=google&gclid=xyz" } });
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {} });
    const mod = await import("@/lib/tracking/atribuicao");
    const a = mod.lerAtribuicao();
    expect(a.utmSource).toBe("google");
    expect(a.gclid).toBe("xyz");
  });

  it("sessionStorage indisponível (navegação privada) não derruba nada", async () => {
    vi.stubGlobal("window", { location: { search: "?utm_source=google" } });
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("acesso negado");
      },
      setItem: () => {
        throw new Error("acesso negado");
      },
    });
    const mod = await import("@/lib/tracking/atribuicao");
    // Perder atribuição é ruim; quebrar o checkout por causa dela seria pior.
    expect(() => mod.lerAtribuicao()).not.toThrow();
    expect(mod.lerAtribuicao().utmSource).toBe("google");
  });
});
