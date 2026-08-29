/**
 * Diagnóstico da criação de link da InfinitePay.
 *
 * Reproduz EXATAMENTE o corpo que src/lib/payments/infinitepay-provider.ts
 * envia, para separar "o código está errado" de "a conta não aceita".
 *
 * Só cria link de R$ 1,00 identificado como TESTE. Não cobra ninguém: link
 * criado e não pago não movimenta dinheiro.
 *
 *   node scripts/diagnostico-infinitepay.mjs
 */
import { readFileSync } from "node:fs";

function envLocal(chave) {
  if (process.env[chave]) return process.env[chave];
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const linha = txt.split("\n").find((l) => l.startsWith(`${chave}=`));
    return linha ? linha.slice(chave.length + 1).trim().replace(/^["']|["']$/g, "") : undefined;
  } catch {
    return undefined;
  }
}

const handle = (envLocal("INFINITEPAY_HANDLE") ?? "").replace(/^\$/, "");
if (!handle) {
  console.error("INFINITEPAY_HANDLE ausente");
  process.exit(1);
}

const corpo = {
  handle,
  order_nsu: "DIAGNOSTICO-TESTE-" + process.argv[2] ?? "1",
  redirect_url: "https://www.reveraprotesecapilar.com/pedido/teste",
  webhook_url: "https://www.reveraprotesecapilar.com/api/webhooks/pagamento/teste",
  customer: { name: "Teste Diagnostico", email: "teste@exemplo.com", phone_number: "48999999999" },
  items: [{ quantity: 1, price: 100, description: "TESTE DE DIAGNOSTICO - NAO PAGAR" }],
};

console.log("handle usado:", JSON.stringify(handle));
const res = await fetch("https://api.checkout.infinitepay.io/links", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corpo),
});
console.log("HTTP", res.status, res.statusText);
console.log("resposta:", await res.text());
