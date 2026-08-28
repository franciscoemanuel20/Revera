#!/usr/bin/env node
/**
 * Teste VIVO contra o banco de STAGING — não é teste unitário.
 *
 * Os 270 testes unitários provam regra pura. As travas que realmente
 * protegem dinheiro moram em constraint do Postgres (coluna gerada,
 * `envio_exige_pagamento`, `endereco_completo_por_pais`, uniques de
 * idempotência) e só se provam contra um banco real. Este script prova.
 *
 * ===========================================================================
 * SEGURANÇA: ESTE SCRIPT SÓ RODA CONTRA O STAGING
 * ===========================================================================
 * Antes de qualquer escrita ele repete a prova de isolamento: o ref de
 * DENTRO da service key de .env.staging precisa (a) bater com a URL de
 * staging e (b) ser DIFERENTE do ref de produção lido de .env.local.
 * Qualquer dúvida → exit 1 sem escrever nada. Nenhum segredo é impresso.
 *
 * Todos os dados criados são fictícios e marcados com o prefixo
 * "TESTE VIVO" (clientes) / "REV-TV" (pedidos), para limpeza auditável.
 *
 * Uso:
 *   node scripts/teste-vivo-staging.mjs            # roda tudo e LIMPA no fim
 *   node scripts/teste-vivo-staging.mjs --manter   # mantém o dataset (p/ Admin)
 *   node scripts/teste-vivo-staging.mjs --limpar   # só remove dados marcados
 */
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Guarda de ambiente
// ---------------------------------------------------------------------------
function lerEnv(caminho) {
  if (!existsSync(caminho)) return null;
  const mapa = {};
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const t = linha.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    mapa[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return mapa;
}
function refDaChave(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")).ref ?? null;
  } catch {
    return null;
  }
}
const stg = lerEnv(".env.staging");
const prod = lerEnv(".env.local");
if (!stg || !prod) {
  console.error("✗ Preciso de .env.staging E .env.local (referência do que NÃO tocar).");
  process.exit(1);
}
const refStgUrl = new URL(stg.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
const refProdUrl = new URL(prod.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
const refDaKey = refDaChave(stg.SUPABASE_SERVICE_ROLE_KEY);
if (!refStgUrl || refStgUrl === refProdUrl || refDaKey !== refStgUrl) {
  console.error("✗ Isolamento não comprovado. NADA foi escrito. Rode provar-isolamento-staging.mjs.");
  process.exit(1);
}
console.log(`\n=== TESTE VIVO — staging ${refStgUrl} (produção ${refProdUrl} intocada) ===\n`);

const BASE = `${stg.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const HEADERS = {
  apikey: stg.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${stg.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function api(metodo, caminho, corpo, prefer) {
  const r = await fetch(`${BASE}/${caminho}`, {
    method: metodo,
    headers: { ...HEADERS, ...(prefer ? { Prefer: prefer } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* deixa null */
  }
  return { ok: r.ok, status: r.status, json };
}

let passou = 0;
let falhou = 0;
const problemas = [];
function verificar(nome, condicao, detalhe) {
  if (condicao) {
    passou++;
    console.log(`  ✓ ${nome}`);
  } else {
    falhou++;
    problemas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    console.error(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Limpeza (dados marcados). Ordem respeita as FKs.
// ---------------------------------------------------------------------------
async function limpar() {
  const clientes = await api("GET", "customers?select=id&full_name=like.TESTE*VIVO*");
  const ids = (clientes.json ?? []).map((c) => c.id);
  if (ids.length === 0) {
    console.log("Nada marcado para limpar.");
    return;
  }
  const filtroCliente = `customer_id=in.(${ids.join(",")})`;
  const pedidos = await api("GET", `orders?select=id&${filtroCliente}`);
  const pedidoIds = (pedidos.json ?? []).map((p) => p.id);
  if (pedidoIds.length > 0) {
    const filtroPedido = `order_id=in.(${pedidoIds.join(",")})`;
    for (const t of ["payment_events_por_payment", "payments", "order_items", "order_notifications", "shipments", "pixel_event_log"]) {
      if (t === "payment_events_por_payment") {
        const pays = await api("GET", `payments?select=id&${filtroPedido}`);
        const payIds = (pays.json ?? []).map((p) => p.id);
        if (payIds.length > 0) await api("DELETE", `payment_events?payment_id=in.(${payIds.join(",")})`);
        continue;
      }
      if (t === "pixel_event_log") {
        await api("DELETE", `pixel_event_log?event_id=in.(${pedidoIds.join(",")})`);
        continue;
      }
      await api("DELETE", `${t}?${filtroPedido}`);
    }
    await api("DELETE", `audit_logs?entity_id=in.(${pedidoIds.join(",")})`);
    await api("DELETE", `orders?id=in.(${pedidoIds.join(",")})`);
  }
  // payment_events de teste sem payment (idempotência) usam provider_event_id marcado
  await api("DELETE", "payment_events?provider_event_id=like.teste-vivo-*");
  await api("DELETE", `addresses?${filtroCliente}`);
  await api("DELETE", `customers?id=in.(${ids.join(",")})`);
  console.log(`Limpou ${ids.length} cliente(s) de teste e tudo que pendurava neles.`);
}

if (process.argv.includes("--limpar")) {
  await limpar();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Base compartilhada: a variante real do staging (pedido precisa de item)
// ---------------------------------------------------------------------------
const variantes = await api("GET", "product_variants?select=id,sku,price_cents,products(name)&limit=1");
if (!variantes.ok || !variantes.json?.length) {
  console.error("✗ Staging sem variante de produto — rode o seed antes.");
  process.exit(1);
}
const variante = variantes.json[0];
console.log(`Variante base: ${variante.sku}\n`);

const rodada = randomUUID().slice(0, 6);
function numeroPedido(sufixo) {
  return `REV-TV${sufixo}${rodada}`.toUpperCase().slice(0, 20);
}

// ---------------------------------------------------------------------------
// Cenários POSITIVOS — um por país/moeda
// payment/shipping variados para o Admin exibir todas as abas.
// ---------------------------------------------------------------------------
const CENARIOS = [
  {
    pais: "BR", moeda: "BRL", nome: "TESTE VIVO — Brasil", sufixo: "BR",
    cliente: { cpf: "52998224725", phone: "+55 12 98888-0001" },
    endereco: { country: "BR", cep: "01310-100", street: "Avenida Paulista", number: "1000", neighborhood: "Bela Vista", city: "São Paulo", state: "SP", recipient_name: "TESTE VIVO — Brasil" },
    pagamento: "pending", envio: "not_ready", cambio: null,
  },
  {
    pais: "US", moeda: "USD", nome: "TESTE VIVO — Estados Unidos", sufixo: "US",
    cliente: { cpf: null, foreign_tax_id: null, phone: "+1 212 555 0100" },
    endereco: { country: "US", line1: "350 Fifth Avenue", line2: "Suite 6300", city: "New York", region: "NY", postal_code: "10118", recipient_name: "TESTE VIVO — Estados Unidos" },
    pagamento: "paid", envio: "awaiting_label", cambio: { exchange_rate: "5.432100", exchange_rate_source: "teste-vivo", exchange_rate_date: "2026-08-28" },
  },
  {
    pais: "PT", moeda: "EUR", nome: "TESTE VIVO — Portugal", sufixo: "PT",
    cliente: { cpf: null, phone: "+351 21 000 0000" },
    endereco: { country: "PT", line1: "Praça do Comércio 1", city: "Lisboa", region: "Lisboa", postal_code: "1100-148", recipient_name: "TESTE VIVO — Portugal" },
    pagamento: "paid", envio: "awaiting_label", cambio: null,
  },
  {
    pais: "GB", moeda: "GBP", nome: "TESTE VIVO — Reino Unido", sufixo: "GB",
    cliente: { cpf: null, phone: "+44 20 7946 0000" },
    endereco: { country: "GB", line1: "10 Downing Street", city: "London", postal_code: "SW1A 2AA", recipient_name: "TESTE VIVO — Reino Unido" },
    pagamento: "paid", envio: "label_created", cambio: null,
  },
  {
    pais: "AU", moeda: "AUD", nome: "TESTE VIVO — Austrália", sufixo: "AU",
    cliente: { cpf: null, phone: "+61 2 9374 4000" },
    endereco: { country: "AU", line1: "1 Macquarie Street", city: "Sydney", region: "NSW", postal_code: "2000", recipient_name: "TESTE VIVO — Austrália" },
    pagamento: "paid", envio: "shipped", cambio: null,
  },
  {
    pais: "CA", moeda: "CAD", nome: "TESTE VIVO — Canadá", sufixo: "CA",
    cliente: { cpf: null, phone: "+1 613 555 0199" },
    endereco: { country: "CA", line1: "80 Wellington Street", city: "Ottawa", region: "ON", postal_code: "K1A 0A2", recipient_name: "TESTE VIVO — Canadá" },
    pagamento: "paid", envio: "delivered", cambio: null,
  },
];

const criados = { clientes: [], pedidos: [] };

for (const c of CENARIOS) {
  console.log(`${c.pais} / ${c.moeda}`);

  const cliente = await api(
    "POST",
    "customers",
    { full_name: c.nome, email: `teste-vivo-${c.sufixo.toLowerCase()}-${rodada}@example.com`, country: c.pais, ...c.cliente },
    "return=representation"
  );
  verificar(`INSERT customer ${c.pais}`, cliente.ok, JSON.stringify(cliente.json));
  if (!cliente.ok) continue;
  const clienteId = cliente.json[0].id;
  criados.clientes.push(clienteId);

  const endereco = await api("POST", "addresses", { customer_id: clienteId, ...c.endereco }, "return=representation");
  verificar(`INSERT address ${c.pais} (endereco_completo_por_pais aceita)`, endereco.ok, JSON.stringify(endereco.json));
  if (!endereco.ok) continue;

  const numero = numeroPedido(c.sufixo);
  const pedido = await api(
    "POST",
    "orders",
    {
      order_number: numero,
      customer_id: clienteId,
      address_id: endereco.json[0].id,
      subtotal_cents: 65000,
      shipping_cents: 12000,
      tax_cents: 0,
      total_cents: 77000,
      currency: c.moeda,
      ...(c.cambio ?? {}),
      ...(c.pagamento === "paid" ? { payment_status: "paid", shipping_status: c.envio } : {}),
      ...(c.envio === "delivered" ? {} : {}),
      export_status: c.pais === "BR" ? "not_required" : "pending_data",
    },
    "return=representation"
  );
  verificar(`INSERT order ${c.moeda} (${c.pagamento}/${c.envio})`, pedido.ok, JSON.stringify(pedido.json));
  if (!pedido.ok) continue;
  const pedidoId = pedido.json[0].id;
  criados.pedidos.push(pedidoId);

  const item = await api("POST", "order_items", {
    order_id: pedidoId,
    variant_id: variante.id,
    quantity: 1,
    unit_price_cents: 65000,
    subtotal_cents: 65000,
    product_name_snapshot: variante.products?.name ?? "Produto de teste",
    variant_label_snapshot: variante.sku,
  });
  verificar(`INSERT order_item ${c.pais}`, item.ok, JSON.stringify(item.json));

  // SELECT com join — o mesmo shape que o Admin usa
  const leitura = await api(
    "GET",
    `orders?id=eq.${pedidoId}&select=order_number,currency,status,payment_status,shipping_status,export_status,exchange_rate,customers(full_name,country),addresses(country,city,postal_code,cep),order_items(quantity)`
  );
  const lido = leitura.json?.[0];
  verificar(`SELECT join ${c.pais}`, !!lido && lido.currency === c.moeda && lido.customers?.country === c.pais, JSON.stringify(lido));

  // A coluna gerada derivou certo?
  const esperado =
    c.envio === "delivered" ? "delivered"
    : c.envio === "shipped" ? "shipped"
    : c.envio === "label_created" ? "label_ready"
    : c.pagamento === "paid" ? "paid"
    : "new";
  verificar(`status gerado = ${esperado}`, lido?.status === esperado, `veio ${lido?.status}`);

  // Serialização de moeda preservada (nunca convertida na leitura)
  if (c.cambio) {
    verificar(
      `câmbio preservado ${c.moeda}`,
      Number(lido?.exchange_rate) === 5.4321,
      `veio ${lido?.exchange_rate}`
    );
  }
}

// UPDATE legítimo: o pedido BR pendente é pago (o mesmo update de confirmar.ts)
console.log("\nUPDATE (transição legítima e corrida)");
const pedidoBR = criados.pedidos[0];
if (pedidoBR) {
  const upd = await api(
    "PATCH",
    `orders?id=eq.${pedidoBR}&payment_status=eq.pending`,
    { payment_status: "paid", shipping_status: "awaiting_label" },
    "return=representation"
  );
  verificar("UPDATE pending→paid transiciona", upd.ok && upd.json?.length === 1, JSON.stringify(upd.json));
  const denovo = await api(
    "PATCH",
    `orders?id=eq.${pedidoBR}&payment_status=eq.pending`,
    { payment_status: "paid" },
    "return=representation"
  );
  verificar("segunda porta perde a corrida (0 linhas)", denovo.ok && denovo.json?.length === 0, JSON.stringify(denovo.json));
}

// ---------------------------------------------------------------------------
// Cenários NEGATIVOS — cada um DEVE falhar, com o erro certo
// ---------------------------------------------------------------------------
console.log("\nCONSTRAINTS (cada linha abaixo é uma tentativa que o banco deve recusar)");
const clienteRef = criados.clientes[0];

const negativos = [
  {
    nome: "address BR sem CEP → endereco_completo_por_pais",
    faz: () => api("POST", "addresses", { customer_id: clienteRef, country: "BR", street: "Rua X", number: "1", neighborhood: "Centro", city: "SP", state: "SP", recipient_name: "x" }),
    codigo: "23514",
  },
  {
    nome: "address US sem line1 → endereco_completo_por_pais",
    faz: () => api("POST", "addresses", { customer_id: clienteRef, country: "US", city: "NYC", postal_code: "10001", recipient_name: "x" }),
    codigo: "23514",
  },
  {
    nome: "order moeda XXX → orders_currency_suportada",
    faz: () => api("POST", "orders", { order_number: numeroPedido("XX"), customer_id: clienteRef, subtotal_cents: 1, shipping_cents: 0, total_cents: 1, currency: "XXX" }),
    codigo: "23514",
  },
  {
    nome: "order BRL com exchange_rate → cambio_coerente_com_moeda",
    faz: () => api("POST", "orders", { order_number: numeroPedido("XR"), customer_id: clienteRef, subtotal_cents: 1, shipping_cents: 0, total_cents: 1, currency: "BRL", exchange_rate: "5.0" }),
    codigo: "23514",
  },
  {
    nome: "escrever na coluna gerada status → recusado pelo Postgres",
    faz: () => api("PATCH", `orders?id=eq.${pedidoBR}`, { status: "shipped" }),
    codigo: "428C9",
  },
  {
    nome: "enviar sem pagar → envio_exige_pagamento",
    faz: () => api("POST", "orders", { order_number: numeroPedido("XE"), customer_id: clienteRef, subtotal_cents: 1, shipping_cents: 0, total_cents: 1, currency: "BRL", shipping_status: "shipped" }),
    codigo: "23514",
  },
];

for (const n of negativos) {
  const r = await n.faz();
  const codigo = r.json?.code;
  verificar(n.nome, !r.ok && codigo === n.codigo, `esperava ${n.codigo}, veio ${codigo ?? r.status}`);
}

// Idempotência de webhook: o unique decide, não um if
console.log("\nIDEMPOTÊNCIA (payment_events unique provider+provider_event_id)");
const evento = { provider: "teste", provider_event_id: `teste-vivo-${rodada}`, event_type: "webhook", payload: {} };
const ev1 = await api("POST", "payment_events", evento);
const ev2 = await api("POST", "payment_events", evento);
verificar("1º evento entra", ev1.ok, JSON.stringify(ev1.json));
verificar("2º evento idêntico → 23505", !ev2.ok && ev2.json?.code === "23505", `veio ${ev2.json?.code ?? ev2.status}`);

// ---------------------------------------------------------------------------
// Veredito e limpeza
// ---------------------------------------------------------------------------
console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);

if (process.argv.includes("--manter")) {
  console.log("Dataset MANTIDO para inspeção do Admin (rode --limpar depois).");
} else {
  await limpar();
}

if (falhou > 0) {
  console.error("\nTESTE VIVO: FALHOU");
  for (const p of problemas) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log("\nTESTE VIVO: PASSOU — constraints reais provadas contra o staging.\n");
