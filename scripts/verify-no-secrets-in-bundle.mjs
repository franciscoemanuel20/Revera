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

/**
 * VALORES que não podem aparecer no bundle do cliente — não só nomes de
 * variável. Checar só o nome era insuficiente: o risco de verdade é o dado
 * em si vazar.
 *
 * O telefone da Reverá é regra comercial dura do projeto: só pode aparecer
 * DEPOIS do pagamento confirmado (ver SuportePosCompra.tsx). Como aquele é
 * um Server Component lendo de env sem prefixo NEXT_PUBLIC_, o número nunca
 * deveria chegar ao bundle — este teste é a rede que pega o dia em que
 * alguém, sem saber da regra, importar aquilo num componente cliente.
 *
 * Testa as grafias que apareceriam num bundle: só dígitos, com DDI, e as
 * formatações comuns.
 */
const numeroPosCompra = process.env.WHATSAPP_POST_PURCHASE_NUMBER ?? "12981409901";
const digitos = numeroPosCompra.replace(/\D/g, "");
const VALORES_PROIBIDOS = [
  digitos,
  `55${digitos}`,
  `${digitos.slice(0, 2)} ${digitos.slice(2, 7)}-${digitos.slice(7)}`,
  `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`,
].filter((v) => v.length >= 8);

let achados = [];
for (const arquivo of arquivosJs(BUNDLE_DIR)) {
  const conteudo = readFileSync(arquivo, "utf8");
  for (const nome of NOMES_SENSIVEIS) {
    if (conteudo.includes(nome)) {
      achados.push({ arquivo, achado: nome, tipo: "nome de variável" });
    }
  }
  for (const valor of VALORES_PROIBIDOS) {
    if (conteudo.includes(valor)) {
      achados.push({
        arquivo,
        achado: `telefone pós-compra ("${valor}")`,
        tipo: "VALOR — regra comercial violada",
      });
    }
  }
}

if (achados.length > 0) {
  console.error("FALHA — encontrado no bundle do cliente:");
  for (const a of achados) {
    console.error(`  [${a.tipo}] ${a.achado}`);
    console.error(`     em ${a.arquivo}`);
  }
  process.exit(1);
}

console.log(
  "OK — nem nome sensível nem o telefone pós-compra em .next/static."
);
