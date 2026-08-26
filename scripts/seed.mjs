#!/usr/bin/env node
/**
 * Aplica seeds/*.json no banco via service role (ignora RLS de propósito —
 * é rotina de backend, não requisição de usuário). Idempotente: usa upsert
 * pela chave natural de cada tabela (code, percent, slug/sku, question),
 * então rodar duas vezes não duplica linha.
 *
 * Rodado pela primeira vez de verdade em 25/08/2026, contra o projeto
 * Supabase real — e falhou na primeira tentativa: diferente de `next dev`/
 * `next build`, um script node puro não lê .env.local sozinho, então
 * process.env vinha vazio mesmo com o arquivo preenchido. Corrigido com a
 * flag nativa do Node (`--env-file`, disponível a partir do Node 20.6, sem
 * precisar da dependência `dotenv`) — ver package.json, script "seed".
 *
 * Uso: npm run seed   (ou, direto: node --env-file=.env.local scripts/seed.mjs)
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = join(__dirname, "..", "seeds");

// Node 20 (o que este projeto usa, ver docs/fundacao-25-08-2026.md) não tem
// WebSocket global — só o Node 22+ tem. @supabase/supabase-js sempre monta
// um RealtimeClient dentro de createClient(), mesmo quando o script nunca
// abre canal nenhum (aqui só se usa REST via upsert/insert): sem isso, a
// simples chamada de createClient() já lança "Node.js 20 detected without
// native WebSocket support". Sem `npm install` disponível neste ambiente
// para trazer o pacote "ws" (sugestão oficial do erro), este stub resolve
// sem dependência nova — nunca é de fato instanciado, porque nada aqui usa
// realtime.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class WebSocketStub {};
}

async function lerJson(nomeArquivo) {
  const caminho = join(SEEDS_DIR, nomeArquivo);
  const conteudo = await readFile(caminho, "utf8");
  return JSON.parse(conteudo);
}

function clientAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no " +
        "ambiente — preencha .env.local antes de rodar o seed."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function seedColors(db) {
  const { colors } = await lerJson("colors.json");
  const { error } = await db.from("colors").upsert(
    colors.map(({ code, name, hex_preview, photo_url, sort_order, is_active }) => ({
      code,
      name,
      hex_preview,
      photo_url,
      sort_order,
      is_active,
    })),
    { onConflict: "code" }
  );
  if (error) throw error;
  console.log(`colors: ${colors.length} upsertados`);
}

async function seedGrayLevels(db) {
  const { gray_levels } = await lerJson("gray-levels.json");
  const { error } = await db.from("gray_levels").upsert(
    gray_levels.map(({ percent, label, photo_url, uses_synthetic_fiber, sort_order }) => ({
      percent,
      label,
      photo_url,
      uses_synthetic_fiber,
      sort_order,
    })),
    { onConflict: "percent" }
  );
  if (error) throw error;
  console.log(`gray_levels: ${gray_levels.length} upsertados`);
}

async function seedFaq(db) {
  const { faq_items } = await lerJson("faq.json");
  // Sem chave natural única na tabela (nenhuma coluna unique em faq_items) —
  // upsert por "question" evita duplicar ao rodar de novo, mesmo sem
  // constraint no banco (Supabase exige onConflict apontar para uma coluna
  // única de verdade; se a migration não tiver isso, isto vira insert puro
  // e duplica em segunda execução — documentado aqui de propósito).
  const { error } = await db.from("faq_items").insert(
    faq_items.map(({ question, answer, sort_order, is_visible }) => ({
      question,
      answer,
      sort_order,
      is_visible,
    }))
  );
  if (error) throw error;
  console.log(`faq_items: ${faq_items.length} inseridos`);
}

async function seedProducts(db) {
  const { products } = await lerJson("products.json");

  for (const produto of products) {
    // Primeira rodada real deste script (25/08/2026) mostrou um bug: a
    // versão anterior pulava o produto INTEIRO (a linha de `products`
    // também, não só a variante) quando havia variante sem price_cents —
    // resultado prático: a Micropele não existia em lugar nenhum no banco,
    // nem para o Francisco editar no /admin/produtos e ativar depois que
    // definir o preço. product_variants.price_cents é NOT NULL, mas
    // `products` não tem coluna de preço — não havia motivo para o produto
    // em si não existir.
    //
    // Correção: o produto sempre é upsertado. Só a variante sem preço
    // ganha um price_cents=0 técnico (nunca um preço inventado de verdade)
    // só para satisfazer a constraint — is_active fica false independente
    // do que vier do JSON, então a policy pública ("public read variants",
    // is_active = true) nunca expõe esse 0 para um cliente. Quem vê o 0 é
    // só o Francisco, no formulário de admin, e o campo já é editável lá
    // para o preço real entrar antes de ativar o produto.
    const { data: produtoInserido, error: erroProduto } = await db
      .from("products")
      .upsert(
        {
          slug: produto.slug,
          name: produto.name,
          description: produto.description,
          base_type: produto.base_type,
          base_thickness_mm: produto.base_thickness_mm,
          is_featured: produto.is_featured,
          status: produto.status,
          seo_title: produto.seo_title,
          seo_description: produto.seo_description,
          sort_order: produto.sort_order,
        },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (erroProduto) throw erroProduto;

    const variantesComPrecoPendente = produto.variants.filter((v) => v.price_cents == null);
    if (variantesComPrecoPendente.length > 0) {
      console.warn(
        `produtos: "${produto.slug}" tem ${variantesComPrecoPendente.length} ` +
          `variante(s) sem preço definido (TODO: Francisco vai definir o preço ` +
          `real) — nasce(m) com price_cents=0 técnico e is_active=false, ` +
          `invisível na vitrine. Editar e ativar pelo /admin/produtos quando ` +
          `o preço existir.`
      );
    }

    const { error: erroVariantes } = await db.from("product_variants").upsert(
      produto.variants.map((v) => ({
        product_id: produtoInserido.id,
        sku: v.sku,
        size_id: v.size_id,
        color_id: v.color_id,
        gray_level_id: v.gray_level_id,
        length_cm: v.length_cm,
        stock_qty: v.stock_qty,
        price_cents: v.price_cents ?? 0,
        compare_at_price_cents: v.compare_at_price_cents,
        is_active: v.price_cents == null ? false : v.is_active,
      })),
      { onConflict: "sku" }
    );
    if (erroVariantes) throw erroVariantes;

    console.log(`products: "${produto.slug}" upsertado com ${produto.variants.length} variante(s)`);
  }
}

async function main() {
  const db = clientAdmin();
  await seedColors(db);
  await seedGrayLevels(db);
  await seedFaq(db);
  await seedProducts(db);
  console.log("seed concluído.");
}

main().catch((erro) => {
  console.error("seed falhou:", erro);
  process.exit(1);
});
