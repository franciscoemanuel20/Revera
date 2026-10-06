import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("codifica o espaco do orderby como %20 para a API PTAX aceitar a consulta", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    expect(url).toContain("%24orderby=dataHoraCotacao%20desc");
    expect(url).not.toContain("dataHoraCotacao+desc");
    return new Response(JSON.stringify({
      value: [{
        tipoBoletim: "Fechamento",
        cotacaoVenda: 5.25,
        dataHoraCotacao: "2026-10-05T13:10:00.000",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);

  const { obterCotacaoPtax } = await import("@/lib/internacional/cambio-ptax");
  const quote = await obterCotacaoPtax("USD");

  expect(quote.reaisPorUnidade).toBe(5.25);
  expect(fetchMock).toHaveBeenCalledOnce();
});
