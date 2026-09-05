/**
 * A GRAVAÇÃO do aviso de venda paga — provada sem rede e sem banco de verdade.
 *
 * O cabeçalho de pos-venda.test.ts deixou esta garantia listada como NÃO
 * PROVADA: "um aviso só" mora numa constraint, e ali só se testava o TEXTO da
 * mensagem (montarAvisoVendaPaga), nunca o INSERT que reserva a linha.
 *
 * Este arquivo fecha esse buraco contra o FakeSupabase, que emula a constraint
 * `unique (order_id, kind)` real (migration 00000000000008). Ele prova o que o
 * diagnóstico afirma: `avisarVendaPaga` GRAVA a linha em order_notifications
 * como PRIMEIRA ação, ANTES de qualquer decisão sobre enviar WhatsApp — logo,
 * WhatsApp desligado (o estado padrão do projeto) NÃO impede a gravação. Se a
 * tabela nunca recebeu uma linha em produção, a causa não está neste caminho
 * de código: está fora do repositório (tabela/migração ausente, ou nenhum
 * pedido chegou a 'paid' ainda) — o insert falha e é engolido de propósito
 * pelo try/catch, para um aviso perdido nunca derrubar uma venda já paga.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "../stubs/fake-supabase";
import { avisarVendaPaga } from "@/lib/notificacoes/venda-paga";

const ORDER = "99999999-9999-4999-8999-999999999999";
const UNICO_AVISO = [{ tabela: "order_notifications", colunas: ["order_id", "kind"] }];

let fake: FakeSupabase;

function novoFake() {
  return new FakeSupabase({ order_notifications: [] }, UNICO_AVISO);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  // WhatsApp desligado — o estado padrão de hoje (o template ainda não
  // existe). É justamente o cenário em que a reserva PRECISA acontecer mesmo
  // assim, para o painel distinguir "não avisamos" de "tentamos e recusaram".
  vi.stubEnv("WHATSAPP_PROVIDER", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  fake = novoFake();
});

describe("avisarVendaPaga grava a reserva", () => {
  it("com WhatsApp desligado, a linha nasce reservada (sent_at nulo) e não enviada", async () => {
    const r = await avisarVendaPaga(fake as never, ORDER);

    expect(r.estado).toBe("desligado");

    const linhas = fake.tabela("order_notifications");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ order_id: ORDER, kind: "venda_paga", channel: "whatsapp" });
    // Reservada, não enviada: o provedor nunca confirmou nada.
    expect(linhas[0].sent_at ?? null).toBeNull();
    // E o painel enxerga POR QUE não saiu, em vez de achar que se perdeu.
    expect(linhas[0].last_error).toBe("WHATSAPP_PROVIDER desligado");
  });

  it("o segundo webhook do mesmo pedido não duplica: 'ja_avisado' e ainda UMA linha", async () => {
    await avisarVendaPaga(fake as never, ORDER);
    const segunda = await avisarVendaPaga(fake as never, ORDER);

    // A garantia é da constraint (23505), não de um `if` — é o ponto inteiro
    // do desenho descrito no cabeçalho de venda-paga.ts.
    expect(segunda.estado).toBe("ja_avisado");
    expect(fake.tabela("order_notifications")).toHaveLength(1);
  });
});
