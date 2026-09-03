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
  "GA4_API_SECRET",
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
// Carrega .env.local se existir: sem os valores em mãos, este script só
// conseguiria conferir NOMES — e nome é a metade fácil do problema.
const envLocal = join(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  for (const linha of readFileSync(envLocal, "utf8").split("\n")) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

/**
 * Os SEGREDOS em si.
 *
 * Conferir o nome da variável pega o caso comum (alguém trocou o prefixo
 * para NEXT_PUBLIC_ sem pensar). Não pega o caso pior: o valor entrar no
 * bundle SEM o nome junto — uma constante copiada à mão, um valor colado
 * direto num componente cliente, ou um bundler que substituiu a referência
 * pelo literal. É esse caso que as linhas abaixo pegam.
 *
 * Só entram valores com 16+ caracteres: um segredo curto demais produziria
 * coincidência com código minificado e o teste viraria alarme falso, que é
 * pior que teste nenhum — alarme falso ensina a ignorar.
 */
const SEGREDOS_REAIS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "META_CAPI_TOKEN",
  "GA4_API_SECRET",
  "SUPERFRETE_TOKEN",
  "PAYMENT_WEBHOOK_SECRET",
]
  .map((nome) => ({ nome, valor: process.env[nome] }))
  .filter((s) => s.valor && s.valor.length >= 16);

/**
 * O TELEFONE SAIU DESTA LISTA EM 03/09/2026.
 *
 * Até aqui este script varria o bundle atrás do telefone da Reverá, porque a
 * regra de 26/08 dizia que ele só podia aparecer na página do pedido. Nessa
 * data o Francisco trocou o número e mandou publicá-lo — ele sai no `href`
 * do botão de /para-profissionais, que é página aberta a qualquer visitante
 * (ver src/lib/config/whatsapp.ts).
 *
 * Continuar procurando por ele seria um teste que não protege nada e que
 * quebraria no primeiro uso legítimo. Guarda que não guarda é pior que
 * guarda nenhuma: ensina a ignorar o alarme. As linhas abaixo continuam
 * cuidando do que é segredo de verdade.
 */
const VALORES_PROIBIDOS = [];

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
  for (const s of SEGREDOS_REAIS) {
    if (conteudo.includes(s.valor)) {
      // O valor NUNCA é impresso, nem em falha. Um segredo vazado não pode
      // ser vazado de novo pelo log do CI.
      achados.push({
        arquivo,
        achado: `o VALOR de ${s.nome} está no bundle do navegador`,
        tipo: "SEGREDO VAZADO — rotacione esta credencial agora",
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

console.log("OK — nenhum nome nem valor sensível em .next/static.");
