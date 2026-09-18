import { afterEach, describe, expect, it, vi } from "vitest";
import {
  avisarPedidoPendentePorEmail,
  enviarEmailOperacional,
  emailOperacionalDisponivel,
} from "@/lib/notificacoes/email-operacional";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("e-mail operacional da Reverá", () => {
  it("fica desligado sem chave ou destinatário", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("REVERA_ALERT_EMAIL_TO", "");

    expect(emailOperacionalDisponivel()).toBe(false);
    await expect(
      enviarEmailOperacional({ assunto: "Teste", texto: "Mensagem" })
    ).resolves.toEqual({ estado: "desligado" });
  });

  it("envia para os destinatários configurados sem expor segredo", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_xxx");
    vi.stubEnv("REVERA_ALERT_EMAIL_TO", "ketlingnt@yahoo.com, equipe@example.com");
    vi.stubEnv("REVERA_ALERT_EMAIL_FROM", "Revera <avisos@example.com>");
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: "email_123" }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await enviarEmailOperacional({
      assunto: "Nova venda Reverá",
      texto: "Pedido RV-1028",
      idempotencyKey: "revera-venda-paga:123",
    });

    expect(resultado).toEqual({ estado: "enviado", id: "email_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const chamadas = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>;
    const [, init] = chamadas[0]!;
    const headers = init?.headers as Record<string, string>;
    const body = JSON.parse(String(init?.body));
    expect(headers.authorization).toBe("Bearer re_xxx");
    expect(headers["Idempotency-Key"]).toBe("revera-venda-paga:123");
    expect(body).toMatchObject({
      from: "Revera <avisos@example.com>",
      to: ["ketlingnt@yahoo.com", "equipe@example.com"],
      subject: "Nova venda Reverá",
      text: "Pedido RV-1028",
    });
  });

  it("não lança quando o provedor recusa", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_xxx");
    vi.stubEnv("REVERA_ALERT_EMAIL_TO", "ketlingnt@yahoo.com");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "domínio não verificado" }), { status: 403 }))
    );

    const resultado = await enviarEmailOperacional({ assunto: "Teste", texto: "Mensagem" });

    expect(resultado).toMatchObject({
      estado: "erro",
      motivo: expect.stringContaining("Resend recusou"),
    });
  });

  it("avisa checkout pendente com dados operacionais e chave idempotente", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_xxx");
    vi.stubEnv("REVERA_ALERT_EMAIL_TO", "ketlingnt@yahoo.com");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://revera-one.vercel.app");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email_pending" })));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await avisarPedidoPendentePorEmail({
      orderId: "ord_123",
      orderNumber: "REV-1234ABCD",
      cliente: "Cliente Teste",
      totalCents: 153351,
      moeda: "BRL",
      origem: "checkout nacional",
      cidade: "São Paulo",
      pais: "BR",
    });

    expect(resultado).toEqual({ estado: "enviado", id: "email_pending" });
    const chamadas = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>;
    const [, init] = chamadas[0]!;
    const headers = init?.headers as Record<string, string>;
    const body = JSON.parse(String(init?.body));
    expect(headers["Idempotency-Key"]).toBe("revera-checkout-pendente:ord_123");
    expect(body.subject).toBe("Checkout Reverá pendente — REV-1234ABCD");
    expect(body.text).toContain("CHECKOUT REVERÁ PENDENTE");
    expect(body.text).toContain("Valor: R$ 1.533,51");
    expect(body.text).toContain("Painel: https://revera-one.vercel.app/admin/pedidos/ord_123");
  });
});
