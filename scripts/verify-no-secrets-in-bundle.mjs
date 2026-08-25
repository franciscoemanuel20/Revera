#!/usr/bin/env node
/**
 * Verifica que nenhum nome de variável sensível aparece no bundle CLIENTE
 * do Next (.next/static) — a parte que realmente vai pro navegador. Mesmo
 * princípio de segurança do projeto irmão (saas-metodo-francisco): rodar
 * DEPOIS de `next build`, antes de qualquer deploy.
 *
 * Uso: npm run build && npm run verify:secrets
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const BUNDLE_DIR = join(process.cwd(), ".next/static");

if (!existsSync(BUNDLE_DIR)) {
  console.error(`Bundle não encontrado em ${BUNDLE_DIR} — rode "npm run build" antes.`);
  process.exit(2);
}

// Nomes que nunca podem aparecer no bundle do cliente. Inclui o que este
// projeto tem hoje (.env.example) mesmo sem adapter real implementado —
// o dia que INFINITEPAY_API_KEY existir de verdade, este script já cobre.
const NOMES_SENSIVEIS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "INFINITEPAY_API_KEY",
  "SUPERFRETE_TOKEN",
  "META_CAPI_TOKEN",
  "WHATSAPP_POST_PURCHASE_NUMBER",
];

function* arquivosJs(dir) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) yield* arquivosJs(caminho);
    else if (nome.endsWith(".js") || nome.endsWith(".css")) yield caminho;
  }
}

let achados = [];
for (const arquivo of arquivosJs(BUNDLE_DIR)) {
  const conteudo = readFileSync(arquivo, "utf8");
  for (const nome of NOMES_SENSIVEIS) {
    if (conteudo.includes(nome)) {
      achados.push({ arquivo, achado: nome });
    }
  }
}

if (achados.length > 0) {
  console.error("FALHA — encontrado no bundle do cliente:");
  for (const a of achados) console.error(`  "${a.achado}" em ${a.arquivo}`);
  process.exit(1);
}

console.log("OK — nenhum nome sensível encontrado em .next/static.");
