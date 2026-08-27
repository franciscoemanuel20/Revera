import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ambienteAtual,
  ehProducao,
  ehStaging,
  pediuStagingEmProducao,
  permiteSandboxDeFrete,
  permiteSimulacao,
  podeGastarDinheiroReal,
  podeReceberComprador,
  podeUsarServicosReais,
  type Ambiente,
} from "@/lib/config/ambiente";
import { modoWhatsApp } from "@/lib/notificacoes/whatsapp";

/**
 * A matriz de ambientes.
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR (27/08/2026)
 * ===========================================================================
 * Duas coisas, e a segunda é a que assusta:
 *
 *   1. Que staging volte a ser impossível de configurar — a trava de deploy
 *      tratava preview e staging como a mesma coisa, e exigia de staging a
 *      configuração de produção.
 *
 *   2. Que APP_ENV vire um caminho de REBAIXAMENTO. Se a variável pudesse
 *      escolher qualquer ambiente, escrever `APP_ENV=development` no projeto
 *      de produção destravaria o provedor simulado — e a loja real passaria
 *      a aprovar compra sem cobrar.
 *
 * Por isso os testes de produção abaixo tentam ATIVAMENTE afrouxar a
 * produção, e exigem que ela não ceda.
 */

const ORIGINAL = { ...process.env };

function ambiente(vars: Record<string, string | undefined>) {
  for (const chave of ["VERCEL_ENV", "APP_ENV", "NODE_ENV"]) {
    delete (process.env as Record<string, string | undefined>)[chave];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string>)[k] = v;
  }
}

beforeEach(() => ambiente({}));
afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL)) delete (process.env as Record<string, string | undefined>)[k];
  }
  Object.assign(process.env, ORIGINAL);
});

/* =========================================================================
 * COMO O AMBIENTE É DECIDIDO
 * =======================================================================*/

describe("determinação do ambiente", () => {
  const casos: Array<[string, Record<string, string | undefined>, Ambiente]> = [
    ["next dev local", { NODE_ENV: "development" }, "desenvolvimento"],
    ["suíte de testes", { NODE_ENV: "test" }, "desenvolvimento"],
    ["Vercel development", { VERCEL_ENV: "development" }, "desenvolvimento"],
    ["Vercel preview", { VERCEL_ENV: "preview" }, "preview"],
    ["Vercel produção", { VERCEL_ENV: "production" }, "producao"],
    ["staging declarado sobre preview", { VERCEL_ENV: "preview", APP_ENV: "staging" }, "staging"],
    ["staging declarado sem Vercel", { APP_ENV: "staging" }, "staging"],
    ["STAGING em maiúsculas", { VERCEL_ENV: "preview", APP_ENV: "STAGING" }, "staging"],
    ["staging com espaços", { VERCEL_ENV: "preview", APP_ENV: "  staging " }, "staging"],
  ];

  for (const [nome, vars, esperado] of casos) {
    it(`${nome} → ${esperado}`, () => {
      ambiente(vars);
      expect(ambienteAtual()).toBe(esperado);
    });
  }
});

describe("fail-closed: sinal ausente ou inválido nunca vira staging", () => {
  it("nada definido → produção", () => {
    ambiente({});
    expect(ambienteAtual()).toBe("producao");
  });

  it("APP_ENV vazio → NÃO é staging", () => {
    ambiente({ VERCEL_ENV: "preview", APP_ENV: "" });
    expect(ambienteAtual()).toBe("preview");
  });

  it("APP_ENV com erro de digitação → NÃO é staging", () => {
    for (const valor of ["stagging", "stage", "hml", "homolog", "test", "1", "true"]) {
      ambiente({ APP_ENV: valor });
      expect(ambienteAtual(), `APP_ENV=${valor}`).toBe("producao");
      expect(ehStaging()).toBe(false);
    }
  });

  it("VERCEL_ENV desconhecido → produção, não desenvolvimento", () => {
    ambiente({ VERCEL_ENV: "qualquer-coisa", NODE_ENV: "development" });
    expect(ambienteAtual()).toBe("producao");
  });
});

/* =========================================================================
 * O ATAQUE DE REBAIXAMENTO
 * =======================================================================*/

describe("APP_ENV não afrouxa a produção", () => {
  it("APP_ENV=staging no domínio de produção é IGNORADO", () => {
    ambiente({ VERCEL_ENV: "production", APP_ENV: "staging" });
    expect(ambienteAtual()).toBe("producao");
    expect(permiteSimulacao()).toBe(false);
    expect(podeGastarDinheiroReal()).toBe(true);
  });

  it("mas a incoerência é detectável, para a trava de deploy recusar", () => {
    ambiente({ VERCEL_ENV: "production", APP_ENV: "staging" });
    expect(pediuStagingEmProducao()).toBe(true);
  });

  it("APP_ENV=development na produção não existe como valor — e não muda nada", () => {
    ambiente({ VERCEL_ENV: "production", APP_ENV: "development" });
    expect(ambienteAtual()).toBe("producao");
    expect(permiteSimulacao()).toBe(false);
  });

  it("NODE_ENV=development não rebaixa a produção da Vercel", () => {
    ambiente({ VERCEL_ENV: "production", NODE_ENV: "development" });
    expect(ambienteAtual()).toBe("producao");
    expect(permiteSimulacao()).toBe(false);
  });
});

/* =========================================================================
 * A MATRIZ DE CAPACIDADES
 * =======================================================================*/

interface Capacidades {
  comprador: boolean;
  simulacao: boolean;
  sandboxFrete: boolean;
  gastoReal: boolean;
  servicosReais: boolean;
}

const MATRIZ: Array<[Ambiente, Record<string, string>, Capacidades]> = [
  [
    "desenvolvimento",
    { NODE_ENV: "development" },
    { comprador: false, simulacao: true, sandboxFrete: true, gastoReal: false, servicosReais: false },
  ],
  [
    "staging",
    { VERCEL_ENV: "preview", APP_ENV: "staging" },
    { comprador: false, simulacao: true, sandboxFrete: true, gastoReal: false, servicosReais: false },
  ],
  [
    "preview",
    { VERCEL_ENV: "preview" },
    { comprador: true, simulacao: false, sandboxFrete: false, gastoReal: false, servicosReais: false },
  ],
  [
    "producao",
    { VERCEL_ENV: "production" },
    { comprador: true, simulacao: false, sandboxFrete: false, gastoReal: true, servicosReais: true },
  ],
];

describe("matriz de capacidades", () => {
  for (const [nome, vars, esperado] of MATRIZ) {
    describe(nome, () => {
      beforeEach(() => ambiente(vars));

      it("é o ambiente esperado", () => expect(ambienteAtual()).toBe(nome));
      it(`pode receber comprador: ${esperado.comprador}`, () =>
        expect(podeReceberComprador()).toBe(esperado.comprador));
      it(`permite simulação (mock/test): ${esperado.simulacao}`, () =>
        expect(permiteSimulacao()).toBe(esperado.simulacao));
      it(`permite sandbox de frete: ${esperado.sandboxFrete}`, () =>
        expect(permiteSandboxDeFrete()).toBe(esperado.sandboxFrete));
      it(`pode gastar dinheiro real: ${esperado.gastoReal}`, () =>
        expect(podeGastarDinheiroReal()).toBe(esperado.gastoReal));
      it(`pode usar serviços reais (pixel/WhatsApp): ${esperado.servicosReais}`, () =>
        expect(podeUsarServicosReais()).toBe(esperado.servicosReais));
    });
  }
});

/* =========================================================================
 * AS QUATRO EXIGÊNCIAS DO ESCOPO
 * =======================================================================*/

describe("development permite simulação", () => {
  it("mock é aceito", () => {
    ambiente({ NODE_ENV: "development" });
    expect(permiteSimulacao()).toBe(true);
  });
});

describe("staging permite test/sandbox e bloqueia gasto real", () => {
  beforeEach(() => ambiente({ VERCEL_ENV: "preview", APP_ENV: "staging" }));

  it("aceita mock", () => expect(permiteSimulacao()).toBe(true));
  it("aceita sandbox de frete", () => expect(permiteSandboxDeFrete()).toBe(true));
  it("NÃO pode gastar dinheiro real", () => expect(podeGastarDinheiroReal()).toBe(false));
  it("NÃO dispara pixel nem GA4 de produção", () => expect(ehProducao()).toBe(false));
  it("NÃO conta como ambiente com comprador", () =>
    expect(podeReceberComprador()).toBe(false));
});

describe("preview NÃO vira staging sozinho e continua seguro", () => {
  beforeEach(() => ambiente({ VERCEL_ENV: "preview" }));

  it("não é staging", () => {
    expect(ambienteAtual()).toBe("preview");
    expect(ehStaging()).toBe(false);
  });
  it("mock continua RECUSADO — a URL é pública", () =>
    expect(permiteSimulacao()).toBe(false));
  it("sandbox de frete continua recusado", () =>
    expect(permiteSandboxDeFrete()).toBe(false));
  it("gasto real continua bloqueado", () => expect(podeGastarDinheiroReal()).toBe(false));
  it("rastreamento continua desligado", () => expect(ehProducao()).toBe(false));
});

describe("production não ficou mais permissiva", () => {
  beforeEach(() => ambiente({ VERCEL_ENV: "production" }));

  it("bloqueia mock", () => expect(permiteSimulacao()).toBe(false));
  it("bloqueia sandbox de frete", () => expect(permiteSandboxDeFrete()).toBe(false));
  it("continua sendo o único que gasta de verdade", () =>
    expect(podeGastarDinheiroReal()).toBe(true));
  it("continua sendo o único que usa serviços reais", () =>
    expect(podeUsarServicosReais()).toBe(true));
});

/* =========================================================================
 * WHATSAPP REAL SÓ EM PRODUÇÃO
 * =======================================================================*/

describe("WhatsApp real é recusado fora de produção", () => {
  it("staging com WHATSAPP_PROVIDER=meta cai para simulado", () => {
    ambiente({ VERCEL_ENV: "preview", APP_ENV: "staging" });
    process.env.WHATSAPP_PROVIDER = "meta";
    expect(modoWhatsApp()).toBe("simulado");
  });

  it("preview com meta também cai para simulado", () => {
    ambiente({ VERCEL_ENV: "preview" });
    process.env.WHATSAPP_PROVIDER = "meta";
    expect(modoWhatsApp()).toBe("simulado");
  });

  it("produção com meta envia de verdade", () => {
    ambiente({ VERCEL_ENV: "production" });
    process.env.WHATSAPP_PROVIDER = "meta";
    expect(modoWhatsApp()).toBe("meta");
  });

  it("sem a variável, ninguém manda nada em ambiente nenhum", () => {
    for (const vars of [
      { NODE_ENV: "development" },
      { VERCEL_ENV: "preview", APP_ENV: "staging" },
      { VERCEL_ENV: "preview" },
      { VERCEL_ENV: "production" },
    ]) {
      ambiente(vars);
      delete process.env.WHATSAPP_PROVIDER;
      expect(modoWhatsApp()).toBe("desligado");
    }
  });
});
