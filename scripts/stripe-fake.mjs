#!/usr/bin/env node
/**
 * DUBLÊ local da Stripe — para o staging provar o fluxo internacional de
 * ponta a ponta SEM credencial e SEM tocar a Stripe real.
 *
 * ===========================================================================
 * O QUE ISTO É, E O QUE NUNCA PODE SER
 * ===========================================================================
 * É a mesma ideia do stripe-mock oficial: um servidor HTTP local que fala o
 * dialeto mínimo que o NOSSO adapter usa. O código do app que roda contra
 * ele é o código REAL (StripeProvider, webhook assinado, confirmação) — só
 * a outra ponta é falsa. Liga-se apontando STRIPE_API_BASE para cá, o que o
 * próprio adapter RECUSA em produção (e verify-deploy-seguro recusa em
 * qualquer ambiente com comprador real).
 *
 * Endpoints:
 *   POST /v1/checkout/sessions           cria sessão, devolve url local
 *   GET  /v1/checkout/sessions/:id       estado da sessão
 *   GET  /v1/payment_intents/search      busca por metadata (vazio aqui)
 *   GET  /pagar/:id                      a "tela do gateway": botão de pagar
 *   POST /pagar/:id                      marca pago + DISPARA o webhook
 *                                        ASSINADO no app + redireciona
 *
 * O webhook é assinado com STRIPE_WEBHOOK_SECRET — o MESMO que o app usa —
 * no formato real (t=...,v1=HMAC-SHA256 de `${t}.${corpo}`). Se a
 * verificação do app estiver errada, o E2E quebra aqui. É teste, não fé.
 *
 *   STRIPE_WEBHOOK_SECRET=whsec_... APP_BASE=http://localhost:3002 \
 *     node scripts/stripe-fake.mjs
 */
import { createHmac, createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORTA = Number(process.env.FAKE_STRIPE_PORT ?? 4242);
const APP_BASE = (process.env.APP_BASE ?? "http://localhost:3002").replace(/\/$/, "");
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PATH_SECRET = process.env.PAYMENT_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET || !PATH_SECRET) {
  console.error("Preciso de STRIPE_WEBHOOK_SECRET e PAYMENT_WEBHOOK_SECRET (os do staging).");
  process.exit(1);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(APP_BASE + "/")) {
  console.error("APP_BASE precisa ser localhost — este dublê não fala com a internet.");
  process.exit(1);
}

const sessoes = new Map();

function corpoDe(req) {
  return new Promise((resolve) => {
    let dados = "";
    req.on("data", (c) => (dados += c));
    req.on("end", () => resolve(dados));
  });
}

/** Desfaz o form-encode aninhado do adapter no mínimo necessário. */
function parseForm(bruto) {
  const plano = {};
  for (const par of bruto.split("&")) {
    const [k, v] = par.split("=");
    plano[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  const linhas = [];
  for (let i = 0; ; i += 1) {
    const qtd = plano[`line_items[${i}][quantity]`];
    if (qtd === undefined) break;
    linhas.push({
      quantity: Number(qtd),
      unit_amount: Number(plano[`line_items[${i}][price_data][unit_amount]`]),
      currency: plano[`line_items[${i}][price_data][currency]`],
    });
  }
  return { plano, linhas };
}

async function dispararWebhook(sessao) {
  const evento = JSON.stringify({
    id: `evt_fake_${randomUUID().slice(0, 12)}`,
    type: "checkout.session.completed",
    data: { object: sessao },
  });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${evento}`, "utf8").digest("hex");
  const caminho = createHash("sha256").update(PATH_SECRET).digest("hex");
  const url = `${APP_BASE}/api/webhooks/stripe/${caminho}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${t},v1=${v1}` },
      body: evento,
    });
    console.log(`[fake-stripe] webhook -> ${res.status} ${await res.text()}`);
  } catch (e) {
    console.error("[fake-stripe] webhook falhou:", e.message);
  }
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);

  if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    const { plano, linhas } = parseForm(await corpoDe(req));
    const id = `cs_fake_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const sessao = {
      id,
      object: "checkout.session",
      client_reference_id: plano.client_reference_id ?? null,
      metadata: { order_id: plano["metadata[order_id]"] ?? "" },
      payment_status: "unpaid",
      status: "open",
      amount_total: linhas.reduce((s, l) => s + l.unit_amount * l.quantity, 0),
      currency: linhas[0]?.currency ?? "usd",
      success_url: plano.success_url ?? "",
      url: `http://localhost:${PORTA}/pagar/${id}`,
    };
    sessoes.set(id, sessao);
    console.log(`[fake-stripe] sessão ${id} · ${sessao.currency} ${sessao.amount_total} · pedido ${sessao.client_reference_id}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sessao));
    return;
  }

  const retrieve = url.pathname.match(/^\/v1\/checkout\/sessions\/(cs_[\w]+)$/);
  if (req.method === "GET" && retrieve) {
    const sessao = sessoes.get(retrieve[1]);
    res.writeHead(sessao ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sessao ?? { error: { message: "No such session" } }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/payment_intents/search") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: [] }));
    return;
  }

  const pagar = url.pathname.match(/^\/pagar\/(cs_[\w]+)$/);
  if (pagar) {
    const sessao = sessoes.get(pagar[1]);
    if (!sessao) {
      res.writeHead(404);
      res.end("sessão desconhecida");
      return;
    }
    if (req.method === "POST") {
      sessao.payment_status = "paid";
      sessao.status = "complete";
      await dispararWebhook(sessao);
      const destino = sessao.success_url.replace("{CHECKOUT_SESSION_ID}", sessao.id);
      res.writeHead(303, { Location: destino });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Stripe (DUBLÊ DE TESTE)</title>
<body style="font-family:sans-serif;max-width:480px;margin:80px auto">
<h1 style="font-size:18px">DUBLÊ da Stripe — ambiente de teste</h1>
<p>Pedido ${sessao.client_reference_id}</p>
<p><strong>${(sessao.amount_total / 100).toFixed(2)} ${sessao.currency.toUpperCase()}</strong></p>
<form method="post"><button style="padding:12px 24px;font-size:16px">Pagar (fictício)</button></form>
<p style="color:#888;font-size:12px">Nenhum dinheiro existe aqui. Ao pagar, um webhook ASSINADO
é enviado ao app — a mesma verificação da Stripe real.</p></body>`);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: `sem rota para ${req.method} ${url.pathname}` } }));
});

servidor.listen(PORTA, "127.0.0.1", () => {
  console.log(`[fake-stripe] dublê ouvindo em http://localhost:${PORTA} — app: ${APP_BASE}`);
});
