import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const raiz = join(__dirname, "..", "..");

/**
 * Roda a trava de deploy com um ambiente CONTROLADO: nada do ambiente de quem
 * executa o teste vaza para dentro (só PATH, para achar o `node`).
 */
function trava(env: Record<string, string>) {
  const r = spawnSync(process.execPath, ["scripts/verify-deploy-seguro.mjs"], {
    cwd: raiz,
    env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  return { codigo: r.status, saida: `${r.stdout}${r.stderr}` };
}

const REF_STAGING = "dpeluxmzuuijuveesgtu";

const STAGING_SOBRE_PREVIEW = {
  VERCEL_ENV: "preview",
  NODE_ENV: "production",
  APP_ENV: "staging",
  PAYMENT_PROVIDER: "mock",
  PAYMENT_WEBHOOK_SECRET: "segredo-so-do-teste",
  SUPERFRETE_SANDBOX: "1",
  NEXT_PUBLIC_SUPABASE_URL: `https://${REF_STAGING}.supabase.co`,
};

const REF_PRODUCAO = "ngnaemfiytutyplolgxb";
const URL_PRODUCAO = `https://${REF_PRODUCAO}.supabase.co`;

/** Chave no formato JWT do Supabase, com o `ref` do projeto no payload. */
function chaveDoProjeto(ref: string) {
  const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${parte({ alg: "HS256", typ: "JWT" })}.${parte({ iss: "supabase", ref, role: "anon" })}.assinatura`;
}

describe("Preview da Vercel: staging declarado, nunca produção copiada", () => {
  it("Preview sem configuração continua RECUSADO (a proteção não foi afrouxada)", () => {
    const r = trava({ VERCEL_ENV: "preview", NODE_ENV: "production" });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("ambiente detectado: preview");
    expect(r.saida).toContain("DEPLOY RECUSADO");
  });

  it("Preview com a configuração de PRODUÇÃO (gateway real) é recusado", () => {
    const r = trava({
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
      REVERA_PAYMENT_PROVIDER: "infinitepay",
      INFINITEPAY_HANDLE: "loja",
      NEXT_PUBLIC_SUPABASE_URL: "https://ngnaemfiytutyplolgxb.supabase.co",
    });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("Preview sem APP_ENV=staging");
  });

  it("Preview com o conjunto de staging (mock, segredo próprio) passa", () => {
    const r = trava(STAGING_SOBRE_PREVIEW);
    expect(r.saida).toContain("ambiente detectado: staging");
    expect(r.saida).toContain("OK — configuração segura para este ambiente.");
    expect(r.codigo).toBe(0);
  });

  it("gateway real em Preview/staging continua recusado", () => {
    const r = trava({ ...STAGING_SOBRE_PREVIEW, PAYMENT_PROVIDER: "infinitepay", INFINITEPAY_HANDLE: "x" });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("infinitepay em STAGING");
  });

  it("gateway de sandbox em Preview/staging é recusado: Preview usa só mock", () => {
    const r = trava({ ...STAGING_SOBRE_PREVIEW, PAYMENT_PROVIDER: "asaas", ASAAS_API_BASE: "https://sandbox.asaas.com/api/v3", ASAAS_CHECKOUT_BASE: "https://sandbox.asaas.com", ASAAS_API_KEY: "teste", ASAAS_WEBHOOK_AUTH_TOKEN: "teste" });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("Preview de STAGING exige PAYMENT_PROVIDER=mock");
  });

  it("provider Reverá mock não encobre PAYMENT_PROVIDER real usado no checkout genérico", () => {
    const r = trava({
      ...STAGING_SOBRE_PREVIEW,
      REVERA_PAYMENT_PROVIDER: "mock",
      PAYMENT_PROVIDER: "asaas",
      ASAAS_API_BASE: "https://sandbox.asaas.com/api/v3",
      ASAAS_CHECKOUT_BASE: "https://sandbox.asaas.com",
      ASAAS_API_KEY: "teste",
      ASAAS_WEBHOOK_AUTH_TOKEN: "teste",
    });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("Preview de STAGING exige PAYMENT_PROVIDER=mock");
  });

  it("chave live da Stripe em Preview/staging continua recusada", () => {
    const r = trava({
      ...STAGING_SOBRE_PREVIEW,
      STRIPE_SECRET_KEY: "sk_live_falsa_para_o_teste",
      STRIPE_WEBHOOK_SECRET: "whsec_teste",
    });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("STRIPE_SECRET_KEY LIVE");
  });

  it("produção com APP_ENV=staging continua recusada", () => {
    const r = trava({ ...STAGING_SOBRE_PREVIEW, VERCEL_ENV: "production" });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("APP_ENV=staging no domínio de PRODUÇÃO");
  });
});

describe("staging nunca no banco de produção (mock + dados reais = pedido de graça)", () => {
  it("sem NEXT_PUBLIC_SUPABASE_URL não há prova de isolamento: recusado", () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _fora, ...semUrl } = STAGING_SOBRE_PREVIEW;
    const r = trava(semUrl);
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("NEXT_PUBLIC_SUPABASE_URL ausente ou fora da forma https://<ref>.supabase.co");
  });

  it("URL do projeto de produção: recusado", () => {
    const r = trava({ ...STAGING_SOBRE_PREVIEW, NEXT_PUBLIC_SUPABASE_URL: URL_PRODUCAO });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("aponta para o projeto Supabase de PRODUÇÃO");
  });

  it.each(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"])(
    "%s do projeto de produção com URL de staging: recusado",
    (nome) => {
      const r = trava({ ...STAGING_SOBRE_PREVIEW, [nome]: chaveDoProjeto(REF_PRODUCAO) });
      expect(r.codigo).toBe(1);
      expect(r.saida).toContain(`${nome} de STAGING é uma chave do projeto Supabase de PRODUÇÃO`);
    }
  );

  it("chave de um terceiro projeto, diferente da URL: recusado", () => {
    const r = trava({ ...STAGING_SOBRE_PREVIEW, SUPABASE_SERVICE_ROLE_KEY: chaveDoProjeto("outroprojetoqualquer") });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("pertence a outro projeto Supabase");
  });

  it("domínio próprio na frente do Supabase (não prova o projeto): recusado", () => {
    const r = trava({ ...STAGING_SOBRE_PREVIEW, NEXT_PUBLIC_SUPABASE_URL: "https://db.reveraprotesecapilar.com" });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("fora da forma https://<ref>.supabase.co");
  });

  it("projeto Supabase desconhecido (nem produção, nem staging listado): recusado", () => {
    const r = trava({ ...STAGING_SOBRE_PREVIEW, NEXT_PUBLIC_SUPABASE_URL: "https://projetodesconhecido.supabase.co" });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("não está na lista de projetos de staging conhecidos");
  });

  it.each(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"])(
    "%s em formato não-JWT (origem não comprovável): recusado",
    (nome) => {
      const r = trava({ ...STAGING_SOBRE_PREVIEW, [nome]: "sb_secret_formato_novo_sem_ref" });
      expect(r.codigo).toBe(1);
      expect(r.saida).toContain(`${nome} de STAGING não permite provar a qual projeto Supabase pertence`);
    }
  );

  it("DATABASE_URL do banco de produção: recusado", () => {
    const r = trava({
      ...STAGING_SOBRE_PREVIEW,
      DATABASE_URL: `postgres://postgres.${REF_PRODUCAO}:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
    });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("DATABASE_URL em STAGING não é permitida");
  });

  it("DATABASE_URL com host opaco não pode provar isolamento: recusado", () => {
    const r = trava({
      ...STAGING_SOBRE_PREVIEW,
      DATABASE_URL: "postgres://user:senha@db.custom-domain.example:5432/postgres",
    });
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("DATABASE_URL em STAGING não é permitida");
  });

  it("URL e chaves do mesmo projeto de staging: passa", () => {
    const r = trava({
      ...STAGING_SOBRE_PREVIEW,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: chaveDoProjeto(REF_STAGING),
      SUPABASE_SERVICE_ROLE_KEY: chaveDoProjeto(REF_STAGING),
    });
    expect(r.saida).toContain("OK — configuração segura para este ambiente.");
    expect(r.codigo).toBe(0);
  });

  it("produção não foi tocada: infinitepay com o Supabase de produção segue passando", () => {
    const r = trava({
      VERCEL_ENV: "production",
      NODE_ENV: "production",
      REVERA_PAYMENT_PROVIDER: "infinitepay",
      NEXT_PUBLIC_SUPABASE_URL: URL_PRODUCAO,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: chaveDoProjeto(REF_PRODUCAO),
      SUPABASE_SERVICE_ROLE_KEY: chaveDoProjeto(REF_PRODUCAO),
    });
    expect(r.saida).toContain("ambiente detectado: producao");
    expect(r.codigo).toBe(0);
  });
});
