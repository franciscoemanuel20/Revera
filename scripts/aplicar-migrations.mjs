#!/usr/bin/env node
/**
 * Aplica supabase/aplicar/PENDENTES.sql direto no banco.
 *
 * Existe porque o SQL Editor do Supabase não é confiável para colar arquivo
 * grande — a tradução automática do Chrome já corrompeu editor deles antes
 * (registrado no projeto irmão, 12/08/2026), e colar 200 linhas à mão é um
 * convite a aplicar metade.
 *
 * ===========================================================================
 * SOBRE A SENHA
 * ===========================================================================
 * A string de conexão do Postgres contém a senha do banco. Este script:
 *   - lê de DATABASE_URL, nunca de argumento (argumento aparece em `ps` e
 *     no histórico do shell);
 *   - NUNCA imprime a string, nem em erro — só o host, que não é segredo;
 *   - não grava a string em lugar nenhum.
 *
 * Uso:
 *   DATABASE_URL="$(pbpaste)" node scripts/aplicar-migrations.mjs
 *
 * TUDO OU NADA: os comandos vão numa transação só. Se qualquer um falhar,
 * nada é aplicado — melhor repetir do zero que descobrir depois que metade
 * das policies existe e metade não.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'DATABASE_URL vazia. Rode assim:\n  DATABASE_URL="$(pbpaste)" node scripts/aplicar-migrations.mjs'
  );
  process.exit(2);
}
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error(
    "O que veio não parece uma string de conexão do Postgres (deveria começar com postgresql://)."
  );
  process.exit(2);
}

let host = "(desconhecido)";
try {
  host = new URL(url).host;
} catch {
  console.error("String de conexão malformada.");
  process.exit(2);
}

const sql = readFileSync(
  new URL("../supabase/aplicar/PENDENTES.sql", import.meta.url),
  "utf8"
);

const cliente = new pg.Client({
  connectionString: url,
  // O Supabase serve TLS com certificado que a cadeia padrão do Node nem
  // sempre valida (depende do pooler). A conexão continua criptografada;
  // o que se abre mão é da verificação do certificado, aceitável aqui
  // porque o host vem da área de transferência do próprio dono da conta,
  // não de uma rede hostil.
  ssl: { rejectUnauthorized: false },
});

console.log(`Conectando em ${host}…`);

try {
  await cliente.connect();
} catch (e) {
  console.error(`Não consegui conectar: ${e.message}`);
  console.error(
    "\nSe disser 'password authentication failed', a string copiada tem\n" +
      "[YOUR-PASSWORD] no lugar da senha — o Supabase mostra assim até você\n" +
      "clicar para revelar. Copie de novo com a senha real."
  );
  process.exit(1);
}

try {
  // Transação explícita: pg envia isto pelo protocolo simples, e o Postgres
  // executa em sequência. BEGIN/COMMIT garante o tudo-ou-nada.
  await cliente.query("begin");
  await cliente.query(sql);
  await cliente.query("commit");
  console.log("Aplicado.\n");
} catch (e) {
  await cliente.query("rollback").catch(() => {});
  console.error(`FALHOU — nada foi aplicado.\n\n  ${e.message}\n`);
  if (e.position) console.error(`  (posição ${e.position} no arquivo)`);
  await cliente.end();
  process.exit(1);
}

/**
 * Confere o que passou a existir, em vez de confiar no "não deu erro".
 *
 * Por NOME, não por contagem. A primeira versão disto contava policies com
 * `like 'admin manage%'` e comparava com 20 — e acusou 27, porque a
 * migration 2 (produtos, cores, tamanhos) já tinha criado sete com nomes
 * parecidos. A contagem estava certa; a expectativa é que era errada.
 * Conferir por nome não tem esse problema: pergunta exatamente pelas que
 * ESTE arquivo cria.
 */
const esperadas = [...sql.matchAll(/create policy\s+"([^"]+)"/g)].map((m) => m[1]);
const { rows: encontradas } = await cliente.query(
  "select policyname from pg_policies where policyname = any($1::text[])",
  [esperadas]
);
const nomesEncontrados = new Set(encontradas.map((r) => r.policyname));
const faltando = esperadas.filter((n) => !nomesEncontrados.has(n));
const policies = [{ n: esperadas.length - faltando.length }];
const { rows: indices } = await cliente.query(
  `select count(*)::int as n from pg_indexes where indexname = 'shipments_order_id_unico'`
);
const { rows: baldes } = await cliente.query(
  `select count(*)::int as n from storage.buckets where id = 'color-help'`
);
const { rows: colunas } = await cliente.query(
  `select count(*)::int as n from information_schema.columns
   where table_name = 'orders'
     and column_name in ('fbp','fbc','ga_client_id','client_ip','user_agent',
                         'utm_source','utm_medium','utm_campaign','utm_content',
                         'utm_term','fbclid','gclid')`
);
const { rows: tabelas } = await cliente.query(
  `select count(*)::int as n from information_schema.tables where table_name = 'conversion_logs'`
);

console.log(
  `  policies deste arquivo:        ${policies[0].n}/${esperadas.length}`
);
console.log(`  trava de etiqueta duplicada:   ${indices[0].n}/1`);
console.log(`  balde privado das fotos:       ${baldes[0].n}/1`);
console.log(`  colunas de atribuição:         ${colunas[0].n}/12`);
console.log(`  tabela conversion_logs:        ${tabelas[0].n}/1`);
if (faltando.length > 0) {
  console.log(`\n  não encontradas: ${faltando.join(", ")}`);
}

const ok =
  faltando.length === 0 &&
  indices[0].n === 1 &&
  baldes[0].n === 1 &&
  colunas[0].n === 12 &&
  tabelas[0].n === 1;
console.log(ok ? "\nTudo no lugar.\n" : "\nAlgo não bateu — confira acima.\n");

await cliente.end();
process.exit(ok ? 0 : 1);
