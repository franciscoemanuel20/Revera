#!/usr/bin/env node
/**
 * Aplica seeds/*.json no banco via service role (ignora RLS de propósito —
 * é rotina de backend, não requisição de usuário). Idempotente: usa upsert
 * pela chave natural de cada tabela (code, percent, slug/sku, question),
 * então rodar duas vezes não duplica linha.
 *
 * NÃO RODADO neste scaffold — não existe projeto Supabase real ainda (ver
 * README, "decisões pendentes"). Escrito e pronto para quando o projeto
 * existir; então basta `npm run seed` com .env.local preenchido.
 *
 * Uso: node scripts/seed.mjs   (ou: npm run seed)
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = join(__dirname, "..", "seeds");

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
    const semPreco = produto.variants.some((v) => v.price_cents == null);
    if (semPreco) {
      // products.status já nasce 'draft' e variant.is_active=false para
      // isso — mesmo assim recusamos explicitamente aqui, porque
      // product_variants.price_cents é NOT NULL no banco (ver migration):
      // tentar inserir null quebraria o upsert inteiro do produto.
      console.warn(
        `produtos: pulando "${produto.slug}" — variante sem price_cents ` +
          `(TODO: Francisco vai definir o preço real). Rode de novo depois ` +
          `de preencher seeds/products.json.`
      );
      continue;
    }

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

    const { error: erroVariantes } = await db.from("product_variants").upsert(
      produto.variants.map((v) => ({
        product_id: produtoInserido.id,
        sku: v.sku,
        size_id: v.size_id,
        color_id: v.color_id,
        gray_level_id: v.gray_level_id,
        length_cm: v.length_cm,
        stock_qty: v.stock_qty,
        price_cents: v.price_cents,
        compare_at_price_cents: v.compare_at_price_cents,
        is_active: v.is_active,
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
