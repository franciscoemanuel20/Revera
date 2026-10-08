import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A RODADA inteira, com Clint recusando tudo.
 *
 * Teste pedido pelo Codex em 05/09/2026, e o motivo é caro: enquanto o teto
 * por rodada contava sucessos, um provedor recusando tudo não fazia o
 * contador subir — uma única execução varria todos os candidatos e podia
 * consumir sozinha o orçamento do dia. O que se prova aqui é que a rodada
 * para no terceiro candidato mesmo quando nenhum envio dá certo.
 */

vi.mock("@/lib/config/ambiente", () => ({
  podeUsarServicosReais: () => true,
  descricaoDoAmbiente: () => "teste",
}));

let pedidos: Array<{
  id: string;
  created_at: string;
  total_cents?: number;
  currency: string;
  access_token: string;
  customers: { phone: string; email: string; full_name: string };
}> = [];
let notificacoes: Array<{
  order_id: string;
  kind: string;
  created_at: string;
  sent_at: string | null;
}> = [];
let reservas = 0;
let reservasLiberadas = 0;
let pedidosReservados: string[] = [];
let contagemDoDia = 0;
/** Simula "esta pessoa já pagou por outro checkout". */
let jaComprouPorOutro = false;
let telefonesPagos = new Set<string>();
let emailsPagos = new Set<string>();
/** Simula histórico de avisos ilegível (erro de consulta). */
let historicoQuebrado = false;
let pagamentoAtual: "pending" | "paid" = "pending";
let pedidoCancelado = false;

/**
 * Supabase falso: cada método encadeável devolve o próprio objeto, e o
 * `then` resolve conforme a tabela e a operação em curso. É o mínimo para
 * exercitar o laço sem banco.
 */
vi.mock("@/lib/supabase/server", () => {
  const construir = (tabela: string) => {
    const estado = {
      tabela,
      op: "select",
      contando: false,
      single: false,
      buscaPagos: false,
      valorPago: "",
      rangeFrom: null as number | null,
      rangeTo: null as number | null,
      insertPayload: null as null | { order_id?: string },
    };
    const alvo: Record<string, unknown> = {};
    const encadeia = new Proxy(alvo, {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolver: (v: unknown) => void) => {
            if (estado.tabela === "order_notifications") {
              if (estado.op === "insert") {
                reservas += 1;
                if (estado.insertPayload?.order_id) pedidosReservados.push(estado.insertPayload.order_id);
                return resolver({ error: null });
              }
              if (estado.op === "delete") {
                reservasLiberadas += 1;
                return resolver({ error: null });
              }
              if (estado.op === "update") return resolver({ error: null });
              if (estado.contando) return resolver({ count: contagemDoDia, error: null });
              if (historicoQuebrado) return resolver({ data: null, error: { message: "banco fora" } });
              return resolver({ data: notificacoes, error: null });
            }
            if (estado.single) {
              return resolver({ data: { payment_status: pagamentoAtual, canceled_at: pedidoCancelado ? "2026-09-05T17:00:00Z" : null }, error: null });
            }
            // A consulta de "pagou por outro pedido" filtra por paid.
            if (estado.buscaPagos) {
              const achou = jaComprouPorOutro || telefonesPagos.has(estado.valorPago) || emailsPagos.has(estado.valorPago);
              return resolver({ data: achou ? [{ id: "outro" }] : [], error: null });
            }
            if (estado.rangeFrom !== null && estado.rangeTo !== null) {
              return resolver({ data: pedidos.slice(estado.rangeFrom, estado.rangeTo + 1), error: null });
            }
            return resolver({ data: pedidos, error: null });
          };
        }
        return (...args: unknown[]) => {
          if (prop === "insert") {
            estado.op = "insert";
            estado.insertPayload = args[0] as { order_id?: string };
          }
          if (prop === "delete") estado.op = "delete";
          if (prop === "update") estado.op = "update";
          if (prop === "maybeSingle") estado.single = true;
          if (prop === "eq" && args[0] === "payment_status" && args[1] === "paid") {
            estado.buscaPagos = true;
          }
          if (prop === "eq" && (args[0] === "customers.phone" || args[0] === "customers.email")) {
            estado.valorPago = String(args[1]);
          }
          if (prop === "select" && typeof args[1] === "object" && args[1] !== null) {
            estado.contando = true;
          }
          if (prop === "range") {
            estado.rangeFrom = Number(args[0]);
            estado.rangeTo = Number(args[1]);
          }
          return encadeia;
        };
      },
    });
    return encadeia;
  };
  return { createAdminClient: () => ({ from: (tabela: string) => construir(tabela) }) };
});

import { rodadaDeCarrinhoAbandonado } from "@/lib/notificacoes/carrinho-abandonado";

const ORIGINAL = { ...process.env };
const AGORA = new Date("2026-09-05T18:00:00Z"); // 15h em São Paulo

beforeEach(() => {
  reservas = 0;
  reservasLiberadas = 0;
  pedidosReservados = [];
  notificacoes = [];
  contagemDoDia = 0;
  jaComprouPorOutro = false;
  telefonesPagos = new Set();
  emailsPagos = new Set();
  historicoQuebrado = false;
  pagamentoAtual = "pending";
  pedidoCancelado = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  process.env.WHATSAPP_PROVIDER = "clint";
  process.env.CLINT_API_TOKEN = "t";
  process.env.CLINT_CANAL_ID = "c";
  process.env.CLINT_TEMPLATE_CARRINHO_PRIMEIRO_ID = "template-carrinho-primeiro";
  process.env.CLINT_TEMPLATE_CARRINHO_ULTIMO_ID = "template-carrinho-ultimo";
  // dez candidatos elegíveis, todos com 2h de idade
  // Pessoas DIFERENTES: o teto por rodada é o que se testa aqui. Telefones
  // iguais são o outro teste, o da dedupe por pessoa.
  pedidos = Array.from({ length: 10 }, (_, i) => ({
    id: `pedido-${i}`,
    access_token: `token-${i}`,
    created_at: new Date(AGORA.getTime() - 2 * 3600_000).toISOString(),
    total_cents: 67000 + i,
    currency: "BRL",
    customers: { phone: `4899988${String(i).padStart(4, "0")}`, email: `c${i}@exemplo.com`, full_name: `Cliente ${i}` },
  }));
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("rodada com a Clint recusando tudo", () => {
  it("para no teto por rodada, em vez de varrer o dia inteiro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: RequestInfo | URL) => {
        const url = String(entrada);
        if (url.includes("/v1/contacts")) {
          return new Response(JSON.stringify({ data: [{ id: "c1", phone: "5548999887766" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "recusado" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      })
    );

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(r.executou).toBe(true);
    expect(r.enviados).toBe(0);
    // O que importa: 1 reserva (o teto), não 10 nem 20.
    expect(reservas).toBe(1);
    expect(r.pulados.envio_recusado).toBe(1);
    expect(r.reservasSemConfirmacao).toBe(1);
  });

  it("reserva recusada bloqueia novo pedido da mesma pessoa, sem chamada à Clint", async () => {
    pedidos = [
      {
        id: "pedido-reservado", access_token: "token-a",
        created_at: new Date(AGORA.getTime() - 2 * 3600_000).toISOString(),
        total_cents: 67000, currency: "BRL",
        customers: { phone: "48999887766", email: "ficticio@exemplo.test", full_name: "Teste" },
      },
      {
        id: "pedido-novo", access_token: "token-b",
        created_at: new Date(AGORA.getTime() - 60 * 60_000).toISOString(),
        total_cents: 68000, currency: "BRL",
        customers: { phone: "48999887766", email: "ficticio@exemplo.test", full_name: "Teste" },
      },
    ];
    notificacoes = [{
      order_id: "pedido-reservado", kind: "checkout_abandonado_primeiro",
      created_at: new Date(AGORA.getTime() - 50 * 60_000).toISOString(), sent_at: null,
    }];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await rodadaDeCarrinhoAbandonado(AGORA);
    expect(r.enviados).toBe(0);
    expect(r.reservasSemConfirmacao).toBe(0);
    expect(r.pulados.mesma_pessoa_nesta_rodada).toBe(1);
    expect(r.pulados.reserva_sem_confirmacao).toBe(1);
    expect(reservas).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /**
   * Achado do Codex (6ª rodada): o pagamento falha, a pessoa refaz o checkout
   * do zero e paga. `checkout/actions.ts` cria um customer NOVO a cada vez,
   * então o pedido abandonado continua pending e ela receberia "você não
   * finalizou" depois de ter comprado.
   */
  it("quem pagou por outro checkout não recebe o toque", async () => {
    jaComprouPorOutro = true;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(r.pulados.comprou_em_outro_pedido).toBe(10);
    expect(reservas).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("quem pagou com o mesmo telefone salvo com DDI não recebe recuperação", async () => {
    pedidos = [
      {
        id: "pendente",
        access_token: "token-pendente",
        created_at: new Date(AGORA.getTime() - 2 * 3600_000).toISOString(),
        total_cents: 67000,
        currency: "BRL",
        customers: { phone: "11999990000", email: "maria@exemplo.com", full_name: "Maria Souza" },
      },
    ];
    telefonesPagos = new Set(["5511999990000"]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(r.pulados.comprou_em_outro_pedido).toBe(1);
    expect(reservas).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("relê o pedido e não envia se ele foi pago antes da reserva", async () => {
    pagamentoAtual = "paid";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(r.pulados.mudou_de_estado).toBe(10);
    expect(reservas).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("relê o pedido e não envia se ele foi cancelado antes da reserva", async () => {
    pedidoCancelado = true;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(r.pulados.mudou_de_estado).toBe(10);
    expect(reservas).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /**
   * Achado do Codex (8ª rodada): quem tenta pagar três vezes gera três
   * pedidos e três customers. A reserva por `order_id` impede repetir pelo
   * MESMO pedido, mas não protege a pessoa — ela receberia a mesma mensagem
   * paga três vezes, possivelmente na mesma rodada.
   */
  it("três tentativas da mesma pessoa viram UM toque só", async () => {
    process.env.CARRINHO_MAX_POR_RODADA = "3";
    pedidos = Array.from({ length: 3 }, (_, i) => ({
      id: `tentativa-${i}`,
      access_token: `token-tentativa-${i}`,
      created_at: new Date(AGORA.getTime() - 2 * 3600_000).toISOString(),
      total_cents: 67000,
      currency: "BRL",
      customers: { phone: "48999887766", email: "mesma@pessoa.com", full_name: "Maria Souza" },
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: RequestInfo | URL) => {
        const url = String(entrada);
        if (url.includes("/v1/contacts")) {
          return new Response(JSON.stringify({ data: [{ id: "c1", phone: "5548999887766" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ id: "msg" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(reservas).toBe(1);
    expect(r.enviados).toBe(1);
    expect(r.pulados.mesma_pessoa_nesta_rodada).toBeUndefined();
  });

  it("mesma pessoa com dois pedidos elegíveis recebe só pelo maior valor", async () => {
    process.env.CARRINHO_MAX_POR_RODADA = "3";
    pedidos = [
      {
        id: "pedido-menor",
        access_token: "token-menor",
        created_at: new Date(AGORA.getTime() - 40 * 60_000).toISOString(),
        total_cents: 67275,
        currency: "BRL",
        customers: { phone: "71987345510", email: "aqfjunior@hotmail.com", full_name: "Antonio" },
      },
      {
        id: "pedido-maior",
        access_token: "token-maior",
        created_at: new Date(AGORA.getTime() - 25 * 60_000).toISOString(),
        total_cents: 77382,
        currency: "BRL",
        customers: { phone: "71987345510", email: "aqfjunior@hotmail.com", full_name: "Antonio" },
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const url = String(entrada);
        if (url.includes("/v1/contacts")) {
          if (init?.method === "POST") {
            return new Response(JSON.stringify({ id: "c1" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ data: [{ id: "c1" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ id: "msg" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(r.enviados).toBe(1);
    expect(pedidosReservados).toEqual(["pedido-maior"]);
  });

  it("mesma pessoa e mesmo valor escolhe o pedido mais recente", async () => {
    process.env.CARRINHO_MAX_POR_RODADA = "3";
    pedidos = [
      {
        id: "pedido-antigo",
        access_token: "token-antigo",
        created_at: new Date(AGORA.getTime() - 80 * 60_000).toISOString(),
        total_cents: 66861,
        currency: "BRL",
        customers: { phone: "11979503437", email: "osmar@example.com", full_name: "Osmar" },
      },
      {
        id: "pedido-recente",
        access_token: "token-recente",
        created_at: new Date(AGORA.getTime() - 40 * 60_000).toISOString(),
        total_cents: 66861,
        currency: "BRL",
        customers: { phone: "11979503437", email: "osmar@example.com", full_name: "Osmar" },
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const url = String(entrada);
        if (url.includes("/v1/contacts")) {
          if (init?.method === "POST") {
            return new Response(JSON.stringify({ id: "c1" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ data: [{ id: "c1" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ id: "msg" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    await rodadaDeCarrinhoAbandonado(AGORA);

    expect(pedidosReservados).toEqual(["pedido-recente"]);
  });

  it("escolhe o maior pedido mesmo quando ele cai em outra página da fila", async () => {
    process.env.CARRINHO_MAX_POR_RODADA = "1";
    const filler = Array.from({ length: 49 }, (_, i) => ({
      id: `filler-${i}`,
      access_token: `token-filler-${i}`,
      created_at: new Date(AGORA.getTime() - (30 + i) * 60_000).toISOString(),
      total_cents: 67000 + i,
      currency: "BRL",
      customers: {
        phone: `4899900${String(i).padStart(4, "0")}`,
        email: `filler${i}@exemplo.com`,
        full_name: `Cliente ${i}`,
      },
    }));
    pedidos = [
      {
        id: "antonio-menor-pagina-1",
        access_token: "token-menor",
        created_at: new Date(AGORA.getTime() - 25 * 60_000).toISOString(),
        total_cents: 67275,
        currency: "BRL",
        customers: { phone: "71987345510", email: "aqfjunior@hotmail.com", full_name: "Antonio" },
      },
      ...filler,
      {
        id: "antonio-maior-pagina-2",
        access_token: "token-maior",
        created_at: new Date(AGORA.getTime() - 2 * 3600_000).toISOString(),
        total_cents: 77382,
        currency: "BRL",
        customers: { phone: "71987345510", email: "aqfjunior@hotmail.com", full_name: "Antonio" },
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const url = String(entrada);
        if (url.includes("/v1/contacts")) {
          if (init?.method === "POST") {
            return new Response(JSON.stringify({ id: "c1" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ data: [{ id: "c1" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ id: "msg" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    await rodadaDeCarrinhoAbandonado(AGORA);

    expect(pedidosReservados).toEqual(["antonio-maior-pagina-2"]);
  });

  it("pedido maior criado depois de aviso menor aparece como suprimido por pessoa", async () => {
    process.env.CARRINHO_MAX_POR_RODADA = "3";
    pedidos = [
      {
        id: "pedido-menor-ja-avisado",
        access_token: "token-menor",
        created_at: new Date(AGORA.getTime() - 60 * 60_000).toISOString(),
        total_cents: 67275,
        currency: "BRL",
        customers: { phone: "71987345510", email: "aqfjunior@hotmail.com", full_name: "Antonio" },
      },
      {
        id: "pedido-maior-posterior",
        access_token: "token-maior",
        created_at: new Date(AGORA.getTime() - 25 * 60_000).toISOString(),
        total_cents: 77382,
        currency: "BRL",
        customers: { phone: "71987345510", email: "aqfjunior@hotmail.com", full_name: "Antonio" },
      },
    ];
    notificacoes = [
      {
        order_id: "pedido-menor-ja-avisado",
        kind: "checkout_abandonado_primeiro",
        created_at: new Date(AGORA.getTime() - 30 * 60_000).toISOString(),
        sent_at: new Date(AGORA.getTime() - 30 * 60_000).toISOString(),
      },
    ];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(r.enviados).toBe(0);
    expect(reservas).toBe(0);
    expect(r.pulados.mesma_pessoa_nesta_rodada).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("histórico salvo com DDI também suprime pedido novo do mesmo telefone", async () => {
    process.env.CARRINHO_MAX_POR_RODADA = "3";
    pedidos = [
      {
        id: "pedido-ja-avisado-com-ddi",
        access_token: "token-avisado",
        created_at: new Date(AGORA.getTime() - 60 * 60_000).toISOString(),
        total_cents: 67275,
        currency: "BRL",
        customers: { phone: "5571987345510", email: "aqfjunior@hotmail.com", full_name: "Antonio" },
      },
      {
        id: "pedido-novo-sem-ddi",
        access_token: "token-novo",
        created_at: new Date(AGORA.getTime() - 25 * 60_000).toISOString(),
        total_cents: 77382,
        currency: "BRL",
        customers: { phone: "71987345510", email: "aqfjunior@hotmail.com", full_name: "Antonio" },
      },
    ];
    notificacoes = [
      {
        order_id: "pedido-ja-avisado-com-ddi",
        kind: "checkout_abandonado_primeiro",
        created_at: new Date(AGORA.getTime() - 30 * 60_000).toISOString(),
        sent_at: new Date(AGORA.getTime() - 30 * 60_000).toISOString(),
      },
    ];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(r.enviados).toBe(0);
    expect(reservas).toBe(0);
    expect(r.pulados.mesma_pessoa_nesta_rodada).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /**
   * Achado do Codex (13ª rodada): `contatoNaClint` criava todo contato com o
   * nome fixo "Equipe Reverá", que era certo quando só a equipe recebia. Num
   * fluxo que fala com o CLIENTE, cadastraria cada comprador como se fosse a
   * loja — e a atendente veria "Equipe Reverá" do outro lado da conversa.
   */
  it("cliente novo entra na Clint com o nome dele, não como a equipe", async () => {
    const criacoes: Array<Record<string, unknown>> = [];
    pedidos = [
      {
        id: "pedido-unico",
        access_token: "token-unico",
        created_at: new Date(AGORA.getTime() - 2 * 3600_000).toISOString(),
        total_cents: 67000,
        currency: "BRL",
        customers: { phone: "48999887766", email: "maria@exemplo.com", full_name: "Maria Souza" },
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const url = String(entrada);
        if (url.includes("/v1/contacts")) {
          if (init?.method === "POST") {
            criacoes.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({ id: "novo" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          // Não encontrado: força o caminho de criação.
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ id: "msg" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    await rodadaDeCarrinhoAbandonado(AGORA);
    expect(criacoes).toHaveLength(1);
    expect(criacoes[0]!.name).toBe("Maria Souza");
    expect(criacoes[0]!.name).not.toBe("Equipe Reverá");
  });

  it("modelo de recuperação sem variável não envia parâmetros para a Clint", async () => {
    const corposDeTemplate: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const url = String(entrada);
        if (url.includes("/v1/contacts")) {
          if (init?.method === "POST") {
            return new Response(JSON.stringify({ id: "c1" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        corposDeTemplate.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ id: "msg" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    const resultado = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(resultado.enviados).toBeGreaterThan(0);
    expect(corposDeTemplate).not.toHaveLength(0);
    expect(corposDeTemplate.every((corpo) => !("parameters" in corpo))).toBe(true);
  });

  it("sem modelo aprovado, não reserva pedido nem tenta falar com a Clint", async () => {
    delete process.env.CLINT_TEMPLATE_CARRINHO_PRIMEIRO_ID;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const resultado = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(resultado.enviados).toBe(0);
    // Falta de template é config ausente, não recusa do provedor — nunca
    // chegou a tentar falar com a Clint. Ver achado de 11/09/2026 em
    // carrinho-abandonado.ts (a causa real do "envio recusado").
    expect(resultado.pulados.sem_template).toBe(10);
    expect(resultado.pulados.envio_recusado).toBeUndefined();
    expect(reservas).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("libera a reserva recém-criada se o WhatsApp desligar antes do envio", async () => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.WHATSAPP_PROVIDER = "clint";

    pedidos = [
      {
        id: "pedido-unico",
        access_token: "token-unico",
        created_at: new Date(AGORA.getTime() - 2 * 3600_000).toISOString(),
        total_cents: 67000,
        currency: "BRL",
        customers: { phone: "48999887766", email: "maria@exemplo.com", full_name: "Maria Souza" },
      },
    ];

    const originalPush = pedidosReservados.push.bind(pedidosReservados);
    vi.spyOn(pedidosReservados, "push").mockImplementation((...itens) => {
      process.env.WHATSAPP_PROVIDER = "";
      return originalPush(...itens);
    });

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(r.enviados).toBe(0);
    expect(r.pulados.whatsapp_desligado).toBe(1);
    expect(reservas).toBe(1);
    expect(reservasLiberadas).toBe(1);
  });

  /**
   * Achado do Codex (9ª rodada): ler o histórico como vazio quando a consulta
   * FALHA desliga a dedupe por pessoa justamente quando não se sabe o que já
   * saiu — e a constraint (order_id, kind) não protege a pessoa. Melhor não
   * mandar nada.
   */
  it("histórico de avisos ilegível aborta a rodada", async () => {
    historicoQuebrado = true;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(r.executou).toBe(false);
    expect(reservas).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("teto diário já consumido não abre rodada nenhuma", async () => {
    contagemDoDia = 20;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await rodadaDeCarrinhoAbandonado(AGORA);

    expect(r.executou).toBe(false);
    expect(reservas).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
