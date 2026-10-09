#!/usr/bin/env node
/**
 * Proveniência de um deploy — de qual commit ele saiu, provado por conteúdo.
 *
 * ===========================================================================
 * POR QUE EXISTE (30/09/2026)
 * ===========================================================================
 * O domínio passou a servir um deploy feito por `vercel deploy` de uma pasta
 * de trabalho. O metadado dele dizia um SHA, mas esse campo só registra o
 * HEAD do checkout: não prova que a árvore estava limpa. Para afirmar o
 * commit foi preciso comparar arquivo por arquivo — e a comparação mostrou
 * que tudo batia com o commit, mais dois arquivos ignorados pelo Git que
 * subiram junto (`.env.staging` e `tsconfig.tsbuildinfo`).
 *
 * Este script repete aquela conferência. SOMENTE LEITURA: não publica, não
 * promove, não altera variável nem alias.
 *
 *   - deploy por Git (push na main): a Vercel clona o commit; a origem já é
 *     o próprio commit, e o script só informa qual.
 *   - deploy por CLI: compara o sha1 de cada arquivo enviado com o commit.
 *     Arquivo diferente ou arquivo a mais = não rastreável, saída 1.
 *
 * Uso:
 *   npm run verify:proveniencia                       # domínio de produção
 *   npm run verify:proveniencia -- --deployment dpl_x --commit <sha>
 *
 * Precisa da CLI da Vercel logada (`npx vercel whoami`) e do time em
 * `--team`, `VERCEL_ORG_ID` ou `.vercel/project.json`.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DOMINIO_PRODUCAO = "www.reveraprotesecapilar.com";

/**
 * Arquivos rastreados que a Vercel nunca recebe: os dois arquivos de regra
 * de ignorar. A ausência deles no deploy é esperada, não é divergência.
 */
export const AUSENCIAS_ESPERADAS = new Set([".gitignore", ".vercelignore"]);

/**
 * Compara o que foi enviado com o que o commit contém.
 * Os dois mapas são caminho → sha1 do conteúdo.
 */
export function compararDeployComCommit(arquivosDeploy, arquivosCommit) {
  const diferentes = [];
  const soNoDeploy = [];
  const soNoCommit = [];
  let iguais = 0;

  for (const [caminho, sha] of arquivosDeploy) {
    if (!arquivosCommit.has(caminho)) soNoDeploy.push(caminho);
    else if (arquivosCommit.get(caminho) !== sha) diferentes.push(caminho);
    else iguais += 1;
  }
  for (const caminho of arquivosCommit.keys()) {
    if (!arquivosDeploy.has(caminho) && !AUSENCIAS_ESPERADAS.has(caminho)) soNoCommit.push(caminho);
  }

  diferentes.sort();
  soNoDeploy.sort();
  soNoCommit.sort();
  const rastreavel =
    iguais > 0 && diferentes.length === 0 && soNoDeploy.length === 0 && soNoCommit.length === 0;
  return { iguais, diferentes, soNoDeploy, soNoCommit, rastreavel };
}

/** Achata a árvore de `/v6/deployments/:id/files` em caminho → uid (sha1). */
export function achatarArvore(nos, prefixo = "") {
  const saida = new Map();
  for (const no of nos ?? []) {
    const caminho = prefixo + no.name;
    if (no.type === "directory") {
      for (const [c, uid] of achatarArvore(no.children, `${caminho}/`)) saida.set(c, uid);
    } else if (no.type === "file") {
      saida.set(caminho, no.uid);
    }
  }
  return saida;
}

/** A CLI embrulha tudo num diretório `src`; tira esse embrulho. */
export function semEmbrulho(mapa) {
  const todosSobSrc = mapa.size > 0 && [...mapa.keys()].every((c) => c.startsWith("src/"));
  if (!todosSobSrc) return mapa;
  return new Map([...mapa].map(([c, uid]) => [c.slice("src/".length), uid]));
}

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function time() {
  const explicito = argumento("--team") ?? process.env.VERCEL_ORG_ID;
  if (explicito) return explicito;
  if (existsSync(".vercel/project.json")) {
    return JSON.parse(readFileSync(".vercel/project.json", "utf8")).orgId;
  }
  throw new Error("Time da Vercel desconhecido: passe --team ou defina VERCEL_ORG_ID.");
}

function api(caminho) {
  const bruto = execFileSync("npx", ["vercel", "api", caminho], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  const inicio = bruto.search(/[[{]/);
  if (inicio < 0) throw new Error(`Resposta inesperada da Vercel para ${caminho}`);
  return JSON.parse(bruto.slice(inicio));
}

function git(...args) {
  return execFileSync("git", args, { maxBuffer: 256 * 1024 * 1024 });
}

function arquivosDoCommit(sha) {
  const nomes = git("ls-tree", "-r", "--name-only", "-z", sha).toString("utf8").split("\0").filter(Boolean);
  return new Map(
    nomes.map((nome) => [nome, createHash("sha1").update(git("show", `${sha}:${nome}`)).digest("hex")])
  );
}

function principal() {
  const alvo = argumento("--deployment") ?? DOMINIO_PRODUCAO;
  const equipe = time();
  const deploy = api(`/v13/deployments/${encodeURIComponent(alvo)}?teamId=${equipe}`);
  const shaDeclarado = deploy.gitSource?.sha ?? deploy.meta?.githubCommitSha ?? null;
  const commitSolicitado = argumento("--commit");

  console.log(`\nDeploy ${deploy.id} — origem: ${deploy.source}, alvo: ${deploy.target}, estado: ${deploy.readyState}`);
  console.log(`  commit declarado: ${shaDeclarado ?? "nenhum"}`);

  if (deploy.source === "git" && deploy.gitSource?.sha) {
    if (commitSolicitado) {
      const shaEsperado = git("rev-parse", "--verify", `${commitSolicitado}^{commit}`)
        .toString("utf8")
        .trim();
      if (shaEsperado !== deploy.gitSource.sha) {
        console.error(
          `\nNÃO RASTREÁVEL — o deploy Git publicou ${deploy.gitSource.sha}, ` +
            `mas o commit solicitado é ${shaEsperado}.\n`
        );
        return 1;
      }
    }
    console.log("\nOK — deploy por Git: a Vercel clonou este commit; a origem é o próprio commit.\n");
    return 0;
  }

  const commit = commitSolicitado ?? shaDeclarado;
  if (!commit) {
    console.error("\nNÃO RASTREÁVEL — deploy sem commit declarado. Informe --commit para comparar.\n");
    return 1;
  }

  const enviados = semEmbrulho(achatarArvore(api(`/v6/deployments/${deploy.id}/files?teamId=${equipe}`)));
  const r = compararDeployComCommit(enviados, arquivosDoCommit(commit));

  console.log(`  comparado com ${commit}: ${r.iguais} iguais, ${r.diferentes.length} diferentes,`);
  console.log(`  ${r.soNoDeploy.length} só no deploy, ${r.soNoCommit.length} só no commit`);
  for (const [rotulo, lista] of [
    ["diferente", r.diferentes],
    ["só no deploy", r.soNoDeploy],
    ["só no commit", r.soNoCommit],
  ]) {
    for (const caminho of lista) console.log(`    ${rotulo}: ${caminho}`);
  }

  if (r.rastreavel) {
    console.log(`\nOK — o conteúdo enviado é exatamente o commit ${commit}.\n`);
    return 0;
  }
  console.error(`\nNÃO RASTREÁVEL — o deploy não é o conteúdo exato do commit ${commit}.\n`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(principal());
  } catch (erro) {
    console.error(`\nFalha ao conferir a proveniência: ${erro.message}\n`);
    process.exit(2);
  }
}
