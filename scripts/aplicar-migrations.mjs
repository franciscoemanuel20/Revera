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

// Confere o que passou a existir, em vez de confiar no "deu certo".
const { rows: policies } = await cliente.query(
  `select count(*)::int as n from pg_policies
   where policyname like 'admin manage%' or policyname like 'anon insert color-help%'`
);
const { rows: indices } = await cliente.query(
  `select count(*)::int as n from pg_indexes where indexname = 'shipments_order_id_unico'`
);
const { rows: baldes } = await cliente.query(
  `select count(*)::int as n from storage.buckets where id = 'color-help'`
);

console.log(`  policies de admin/upload:      ${policies[0].n}  (esperado 20)`);
console.log(`  trava de etiqueta duplicada:   ${indices[0].n}   (esperado 1)`);
console.log(`  balde privado das fotos:       ${baldes[0].n}   (esperado 1)`);

const ok =
  policies[0].n === 20 && indices[0].n === 1 && baldes[0].n === 1;
console.log(ok ? "\nTudo no lugar.\n" : "\nAlgo não bateu — confira acima.\n");

await cliente.end();
process.exit(ok ? 0 : 1);
