#!/usr/bin/env node
/**
 * Prova que o staging é um projeto Supabase DIFERENTE do de produção.
 *
 * ===========================================================================
 * POR QUE ISTO É UM SCRIPT, E NÃO UMA CONFERIDA NO OLHO (27/08/2026)
 * ===========================================================================
 * A pergunta "é outro projeto?" parece respondível olhando duas URLs. Não é.
 * O erro que realmente acontece é sutil: alguém cria o projeto novo, copia o
 * bloco de variáveis do antigo para não errar, troca só a URL — e a
 * service_role continua sendo a de produção. A URL fica diferente, o banco
 * que responde continua sendo o mesmo, e a migration cai em cima dos
 * clientes reais.
 *
 * Por isso a verificação não confia na URL: ela lê o `ref` do projeto de
 * DENTRO de cada chave JWT e compara. Uma chave carrega o projeto a que
 * pertence; a URL é só texto.
 *
 * ===========================================================================
 * O QUE ESTE SCRIPT NUNCA IMPRIME
 * ===========================================================================
 * Nenhuma chave, inteira ou em pedaço grande. O project ref e o host saem
 * abertos porque são públicos (estão na URL que o navegador já vê). Das
 * chaves sai só um fingerprint SHA-256 de 12 caracteres — suficiente para
 * comparar duas, inútil para usar qualquer uma.
 *
 *   node scripts/provar-isolamento-staging.mjs
 *
 * Lê produção de .env.local e staging de .env.staging. Sai com código 1 se
 * houver qualquer dúvida — e "qualquer dúvida" inclui variável faltando.
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const ARQ_PRODUCAO = ".env.local";
const ARQ_STAGING = ".env.staging";

function lerEnv(caminho) {
  if (!existsSync(caminho)) return null;
  const mapa = {};
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const t = linha.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    mapa[t.slice(0, i).trim()] = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return mapa;
}

/** 12 hex do SHA-256. Compara, não reconstrói. */
function impressao(valor) {
  if (!valor) return "(ausente)";
  return createHash("sha256").update(valor).digest("hex").slice(0, 12);
}

/** O host da URL do Supabase é público — sai aberto para dar o que comparar. */
function hostDe(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** `https://abcdefgh.supabase.co` -> `abcdefgh` */
function refDaUrl(url) {
  const host = hostDe(url);
  if (!host) return null;
  const [primeiro] = host.split(".");
  return primeiro || null;
}

/**
 * O `ref` que a PRÓPRIA CHAVE declara. É esta a prova forte: uma chave de
 * produção colada num arquivo de staging continua dizendo que é de produção.
 * O payload do JWT não é segredo (a anon key é pública por natureza), e aqui
 * só se lê um campo.
 */
function refDaChave(jwt) {
  if (!jwt || jwt.split(".").length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
    return payload.ref ?? null;
  } catch {
    return null;
  }
}

function hostDoBanco(databaseUrl) {
  if (!databaseUrl) return null;
  try {
    return new URL(databaseUrl).host;
  } catch {
    // postgres://user:senha@host:5432/db — se a URL não parsear, extrai à mão
    // sem nunca tocar na parte antes do @, que contém a senha.
    const m = databaseUrl.match(/@([^/:\s]+)/);
    return m ? m[1] : null;
  }
}

const prod = lerEnv(ARQ_PRODUCAO);
const stg = lerEnv(ARQ_STAGING);

console.log("\n=== ISOLAMENTO DO STAGING ===\n");

if (!prod) {
  console.error(`✗ ${ARQ_PRODUCAO} não encontrado. Sem a referência de produção não há o que comparar.`);
  process.exit(1);
}
if (!stg) {
  console.error(
    `✗ ${ARQ_STAGING} não encontrado.\n\n` +
      "  Crie o arquivo com as credenciais do projeto REVERA-STAGING:\n\n" +
      "    NEXT_PUBLIC_SUPABASE_URL=https://<ref-do-staging>.supabase.co\n" +
      "    NEXT_PUBLIC_SUPABASE_ANON_KEY=...\n" +
      "    SUPABASE_SERVICE_ROLE_KEY=...\n" +
      "    DATABASE_URL=postgres://...\n\n" +
      `  Ele é ignorado pelo Git (a regra .env* do .gitignore cobre).\n`
  );
  process.exit(1);
}

const campos = [
  ["NEXT_PUBLIC_SUPABASE_URL", "URL do Supabase"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon key"],
  ["SUPABASE_SERVICE_ROLE_KEY", "service role"],
];

const problemas = [];

// ---------------------------------------------------------------------------
// 1. Project ref — pela URL e pelo conteúdo de cada chave
// ---------------------------------------------------------------------------
const refProdUrl = refDaUrl(prod.NEXT_PUBLIC_SUPABASE_URL);
const refStgUrl = refDaUrl(stg.NEXT_PUBLIC_SUPABASE_URL);

console.log("PROJECT REF (público, sai aberto)");
console.log(`  produção : ${refProdUrl ?? "(não identificado)"}`);
console.log(`  staging  : ${refStgUrl ?? "(não identificado)"}`);

if (!refProdUrl || !refStgUrl) {
  problemas.push("Não consegui identificar o project ref de um dos ambientes pela URL.");
} else if (refProdUrl === refStgUrl) {
  problemas.push(`Project ref IDÊNTICO (${refStgUrl}). É o mesmo projeto Supabase.`);
}

console.log("\nHOST DO BANCO");
const hostProd = hostDe(prod.NEXT_PUBLIC_SUPABASE_URL);
const hostStg = hostDe(stg.NEXT_PUBLIC_SUPABASE_URL);
console.log(`  produção : ${hostProd ?? "(inválido)"}`);
console.log(`  staging  : ${hostStg ?? "(inválido)"}`);
if (hostProd && hostStg && hostProd === hostStg) {
  problemas.push("Host do Supabase idêntico.");
}

const dbProd = hostDoBanco(prod.DATABASE_URL);
const dbStg = hostDoBanco(stg.DATABASE_URL);
if (dbProd || dbStg) {
  console.log("\nHOST DA CONEXÃO DIRETA (DATABASE_URL — só o host, nunca a senha)");
  console.log(`  produção : ${dbProd ?? "(ausente)"}`);
  console.log(`  staging  : ${dbStg ?? "(ausente)"}`);
  if (dbProd && dbStg && dbProd === dbStg) {
    problemas.push("DATABASE_URL do staging aponta para o MESMO host do banco de produção.");
  }
  if (dbStg && refProdUrl && dbStg.includes(refProdUrl)) {
    problemas.push(
      "DATABASE_URL do staging contém o project ref de PRODUÇÃO — a conexão iria para produção."
    );
  }
}

// ---------------------------------------------------------------------------
// 2. As chaves, por fingerprint — e pelo ref que elas declaram
// ---------------------------------------------------------------------------
console.log("\nCHAVES (fingerprint SHA-256, 12 hex — nunca a chave)");
for (const [nome, rotulo] of campos) {
  const vProd = prod[nome];
  const vStg = stg[nome];
  const fpProd = impressao(vProd);
  const fpStg = impressao(vStg);

  console.log(`  ${rotulo}`);
  console.log(`    produção : ${fpProd}`);
  console.log(`    staging  : ${fpStg}`);

  if (!vStg) {
    problemas.push(`${nome} ausente no staging.`);
    continue;
  }
  if (vProd && vProd === vStg) {
    problemas.push(`${rotulo} IDÊNTICA entre produção e staging (${nome}).`);
  }

  // A prova forte: o que a chave diz sobre si mesma.
  if (nome.includes("KEY")) {
    const refDentro = refDaChave(vStg);
    if (refDentro) {
      console.log(`    ref declarado dentro da chave de staging: ${refDentro}`);
      if (refProdUrl && refDentro === refProdUrl) {
        problemas.push(
          `${rotulo} do staging pertence ao projeto de PRODUÇÃO (ref ${refDentro} dentro da chave). ` +
            "Trocar a URL não troca o banco que a chave abre."
        );
      }
      if (refStgUrl && refDentro !== refStgUrl) {
        problemas.push(
          `${rotulo} do staging declara ref "${refDentro}", que não é o ref da URL de staging ("${refStgUrl}").`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Veredito
// ---------------------------------------------------------------------------
console.log("");
if (problemas.length > 0) {
  console.error("STAGING ISOLADO: NÃO\n");
  for (const p of problemas) console.error(`  ✗ ${p}`);
  console.error("\nNENHUMA MIGRATION DEVE SER APLICADA. Corrija e rode de novo.\n");
  process.exit(1);
}

console.log("STAGING ISOLADO: SIM");
console.log("  Projetos diferentes, hosts diferentes, e cada chave pertence ao seu projeto.\n");
