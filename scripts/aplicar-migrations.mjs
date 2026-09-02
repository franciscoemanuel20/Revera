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

/**
 * QUAL ARQUIVO APLICAR (31/08/2026)
 *
 * Passou a aceitar o caminho como argumento. O arquivo NÃO é segredo — a
 * string de conexão é, e essa continua vindo só por variável de ambiente,
 * nunca por argumento (argumento aparece no `ps` e no histórico do shell).
 *
 * Sem argumento, o comportamento antigo: PENDENTES.sql.
 */
const alvo = process.argv[2] ?? "supabase/aplicar/PENDENTES.sql";
const caminhoSql = alvo.startsWith("/")
  ? new URL(`file://${alvo}`)
  : new URL(`../${alvo}`, import.meta.url);

let sql;
try {
  sql = readFileSync(caminhoSql, "utf8");
} catch {
  console.error(`Não consegui ler o arquivo: ${alvo}`);
  process.exit(2);
}
console.log(`Aplicando: ${alvo}`);

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
 *
 * ===========================================================================
 * A CONFERÊNCIA SAI DO ARQUIVO APLICADO (02/09/2026)
 * ===========================================================================
 * Em 31/08 o script passou a aceitar QUAL arquivo aplicar como argumento —
 * mas esta conferência continuou perguntando pelas coisas do PENDENTES.sql:
 * o índice de etiqueta, o balde `color-help`, as 12 colunas de atribuição,
 * a tabela `conversion_logs`.
 *
 * O efeito, descoberto ao aplicar CONTEUDO-EDITAVEL.sql: o SQL entra, o
 * COMMIT acontece, e AÍ o script imprime "Algo não bateu" e sai com erro —
 * porque procurou coisas que aquele arquivo nunca prometeu criar. Quem lê
 * conclui que falhou, quando na verdade deu certo. Um script de conferência
 * que mente é pior que nenhum: ele gasta a confiança justamente na hora em
 * que ela é necessária.
 *
 * Agora as expectativas são LIDAS DO PRÓPRIO SQL — policies, tabelas e
 * baldes que aquele arquivo declara. Arquivo novo passa a ser conferido
 * sozinho, sem ninguém lembrar de vir aqui.
 */
const esperadas = [...sql.matchAll(/create policy\s+"([^"]+)"/g)].map((m) => m[1]);
const { rows: encontradas } = await cliente.query(
  "select policyname from pg_policies where policyname = any($1::text[])",
  [esperadas]
);
const nomesEncontrados = new Set(encontradas.map((r) => r.policyname));
const policiesFaltando = esperadas.filter((n) => !nomesEncontrados.has(n));

// Tabelas que o arquivo diz criar. `create table if not exists x (` — o
// nome pode vir com o schema colado ("public.x"), então o prefixo sai fora
// antes de comparar com information_schema, que guarda os dois separados.
const tabelasEsperadas = [
  ...sql.matchAll(/create table\s+if not exists\s+([A-Za-z0-9_."]+)/gi),
].map((m) => m[1].replace(/"/g, "").split(".").pop());
const { rows: tabelasEncontradas } = await cliente.query(
  "select table_name from information_schema.tables where table_name = any($1::text[])",
  [tabelasEsperadas]
);
const nomesTabelas = new Set(tabelasEncontradas.map((r) => r.table_name));
const tabelasFaltando = tabelasEsperadas.filter((n) => !nomesTabelas.has(n));

// Baldes de storage que o arquivo insere.
const baldesEsperados = [
  ...sql.matchAll(/insert into storage\.buckets[\s\S]{0,400}?values\s*\(\s*'([^']+)'/gi),
].map((m) => m[1]);
let baldesFaltando = [];
if (baldesEsperados.length > 0) {
  const { rows: baldesEncontrados } = await cliente.query(
    "select id from storage.buckets where id = any($1::text[])",
    [baldesEsperados]
  );
  const ids = new Set(baldesEncontrados.map((r) => r.id));
  baldesFaltando = baldesEsperados.filter((b) => !ids.has(b));
}

function linha(rotulo, esperado, faltando) {
  if (esperado.length === 0) return;
  console.log(
    `  ${rotulo.padEnd(30)} ${esperado.length - faltando.length}/${esperado.length}`
  );
  if (faltando.length > 0) console.log(`      faltando: ${faltando.join(", ")}`);
}

linha("tabelas:", tabelasEsperadas, tabelasFaltando);
linha("policies:", esperadas, policiesFaltando);
linha("baldes de storage:", baldesEsperados, baldesFaltando);

if (esperadas.length + tabelasEsperadas.length + baldesEsperados.length === 0) {
  console.log(
    "  (este arquivo não cria tabela, policy nem balde — nada a conferir\n" +
      "   além do COMMIT, que já aconteceu)"
  );
}

const ok =
  policiesFaltando.length === 0 &&
  tabelasFaltando.length === 0 &&
  baldesFaltando.length === 0;
console.log(ok ? "\nTudo no lugar.\n" : "\nAlgo não bateu — confira acima.\n");

await cliente.end();
process.exit(ok ? 0 : 1);
