/**
 * A camada 0 do P0-3 — se o Pixel sequer CARREGA neste ambiente.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE (27/08/2026)
 * ===========================================================================
 * `podeEnviarConversao()` decide sobre UMA venda e já tem 21 testes em
 * tests/unit/purchase-isolamento.test.ts. `rastreamentoAtivoNesteAmbiente()`
 * decide outra coisa: se o pixel base entra na página, antes de existir
 * venda nenhuma. É ela que o layout consulta para passar `ativo` ao
 * componente `Pixels` — e era a única das duas SEM teste.
 *
 * A diferença importa. Sem esta trava, o pixel base carrega em
 * desenvolvimento e dispara PageView e ViewContent na conta de anúncios REAL
 * a cada navegação de quem está programando. Não é venda falsa — é topo de
 * funil falso, que é mais difícil de perceber e igualmente ruim: a Meta passa
 * a otimizar para um público que é a nossa própria máquina.
 *
 * Por que não dá para provar isto abrindo o navegador: o `next/script` com
 * `strategy="afterInteractive"` é injetado pelo cliente depois da
 * hidratação, então o script NÃO aparece no HTML servido — nem em produção,
 * nem em desenvolvimento. Um teste por HTML daria o mesmo resultado nos dois
 * casos e provaria nada. E abrir o servidor de produção num navegador para
 * conferir dispararia um PageView de verdade no pixel real, que é exatamente
 * o que este arquivo existe para impedir.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rastreamentoAtivoNesteAmbiente } from "@/lib/tracking/permissao";

const ORIGINAL = { ...process.env };

function ambiente(vars: Record<string, string | undefined>) {
  const env = process.env as Record<string, string | undefined>;
  for (const k of [
    "VERCEL_ENV",
    "NODE_ENV",
    "TRACKING_ALLOW_DEV_SEND",
    "META_TEST_EVENT_CODE",
  ]) {
    delete env[k];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) env[k] = v;
  }
}

beforeEach(() => ambiente({}));
afterEach(() => {
  const env = process.env as Record<string, string | undefined>;
  for (const k of Object.keys(env)) delete env[k];
  Object.assign(env, ORIGINAL);
});

describe("rastreamentoAtivoNesteAmbiente", () => {
  it("PRODUÇÃO carrega o pixel — sem isto o site não mede nada", () => {
    // Controle positivo. Sem ele, uma trava que devolvesse `false` sempre
    // passaria em todos os outros testes deste arquivo e deixaria a loja
    // cega em produção.
    ambiente({ VERCEL_ENV: "production" });
    expect(rastreamentoAtivoNesteAmbiente()).toBe(true);
  });

  it("DESENVOLVIMENTO não carrega — é o caso do .env.local de hoje", () => {
    // Hoje o .env.local combina PAYMENT_PROVIDER=mock com pixel e token
    // REAIS. Sem esta linha, programar no site alimenta a conta de anúncios.
    ambiente({ NODE_ENV: "development" });
    expect(rastreamentoAtivoNesteAmbiente()).toBe(false);
  });

  it("PREVIEW da Vercel não carrega — tem URL pública e não é produção", () => {
    ambiente({ VERCEL_ENV: "preview" });
    expect(rastreamentoAtivoNesteAmbiente()).toBe(false);
  });

  it("sem nenhum sinal de ambiente, assume produção e carrega", () => {
    // Coerente com ambienteAtual(): na dúvida é produção. Aqui o fail-closed
    // aponta para CARREGAR, e está certo — o erro caro deste lado é um site
    // de verdade que não mede, não um PageView a mais.
    ambiente({});
    expect(rastreamentoAtivoNesteAmbiente()).toBe(true);
  });

  it("next start local (NODE_ENV=production) carrega — é o mesmo binário de produção", () => {
    ambiente({ NODE_ENV: "production" });
    expect(rastreamentoAtivoNesteAmbiente()).toBe(true);
  });

  describe("escotilha para exercitar a integração em desenvolvimento", () => {
    it("TRACKING_ALLOW_DEV_SEND sozinho NÃO basta", () => {
      // Sem código de teste, o evento entraria como venda real na conta.
      ambiente({ NODE_ENV: "development", TRACKING_ALLOW_DEV_SEND: "1" });
      expect(rastreamentoAtivoNesteAmbiente()).toBe(false);
    });

    it("META_TEST_EVENT_CODE sozinho NÃO basta", () => {
      ambiente({ NODE_ENV: "development", META_TEST_EVENT_CODE: "TEST123" });
      expect(rastreamentoAtivoNesteAmbiente()).toBe(false);
    });

    it("as DUAS juntas liberam — e só assim", () => {
      ambiente({
        NODE_ENV: "development",
        TRACKING_ALLOW_DEV_SEND: "1",
        META_TEST_EVENT_CODE: "TEST123",
      });
      expect(rastreamentoAtivoNesteAmbiente()).toBe(true);
    });

    it("valor diferente de '1' não libera", () => {
      ambiente({
        NODE_ENV: "development",
        TRACKING_ALLOW_DEV_SEND: "true",
        META_TEST_EVENT_CODE: "TEST123",
      });
      expect(rastreamentoAtivoNesteAmbiente()).toBe(false);
    });

    it("código de teste em branco não conta como configurado", () => {
      ambiente({
        NODE_ENV: "development",
        TRACKING_ALLOW_DEV_SEND: "1",
        META_TEST_EVENT_CODE: "   ",
      });
      expect(rastreamentoAtivoNesteAmbiente()).toBe(false);
    });
  });
});
