# Publicação rastreável e Preview da Reverá

Registrado em 30/09/2026.

## Como se publica

**Produção = push na `main`.** A Vercel está ligada ao repositório: cada push
na `main` gera um deploy de produção a partir de um clone limpo do commit, com
o SHA gravado (`gitSource.sha`). Esse é o caminho padrão e não exige nada além
do merge.

**Não publique com `vercel deploy` de uma pasta de trabalho.** Foi o que
aconteceu em `dpl_6JD2QNGCdyfkFZQphbXfVHPH4E76`: o conteúdo rastreado batia com
`89323b2`, mas `.env.staging` e `tsconfig.tsbuildinfo` — ignorados pelo Git —
subiram junto, e o deploy por Git do mesmo commit foi cancelado por ele. O
metadado de um deploy por CLI registra só o HEAD do checkout; não prova árvore
limpa.

Se um deploy por CLI for realmente necessário (a integração com o Git fora do
ar), faça de um clone limpo, e confira depois:

```bash
git worktree add --detach /tmp/revera-publicar origin/main
cd /tmp/revera-publicar && npx vercel link --yes --project revera && npx vercel deploy --prod
npm run verify:proveniencia
```

`.vercelignore` impede que `.env*` (menos `.env.example`) e `*.tsbuildinfo`
subam em qualquer deploy por CLI.

## Conferir de onde saiu o que está no ar

```bash
npm run verify:proveniencia                                  # domínio de produção
npm run verify:proveniencia -- --deployment dpl_x --commit <sha>
```

Somente leitura. Deploy por Git: informa o commit clonado. Deploy por CLI:
compara o sha1 de cada arquivo enviado com o commit; arquivo diferente ou a
mais faz o script sair com 1.

## Preview

A trava `scripts/verify-deploy-seguro.mjs` trata Preview como ambiente com
comprador real (a URL é pública) e exige dele a configuração de produção.
Como o ambiente Preview da Vercel não tem — nem deve ter — as credenciais de
produção, todo deploy de Preview era recusado.

Desde 30/09/2026 a trava vai além: **Preview sem `APP_ENV=staging` é sempre
recusado**, mesmo que alguém coloque nele a configuração de produção — Preview
não é lugar de gateway real.

O caminho suportado é o que a matriz de ambientes já testa: **staging
declarado sobre preview**. O ambiente Preview da Vercel recebe as variáveis do
staging (cofre `revera/stg`):

| variável | para quê |
|---|---|
| `APP_ENV=staging` | é o que autoriza mock e sandbox e bloqueia gasto real |
| `PAYMENT_PROVIDER=mock` | nenhum gateway real em Preview |
| `PAYMENT_WEBHOOK_SECRET` | segredo próprio do staging, nunca o de produção |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | projeto Supabase REVERA-STAGING, separado do de produção |
| `SUPERFRETE_SANDBOX=1` | frete em sandbox |

Ficam **fora** do Preview, de propósito: `REVERA_PAYMENT_PROVIDER`,
`INFINITEPAY_HANDLE`, chaves live de Stripe/PayPal/Asaas, `WHATSAPP_PROVIDER`,
tokens da Clint, pixel e CAPI da Meta, GA4. Sem eles o Preview não cobra, não
manda mensagem e não registra conversão. `NEXT_PUBLIC_SITE_URL` também fica
fora: o valor do cofre de staging é `localhost`.

**A trava confere o isolamento, não só o documento, e falha fechada.** Em
staging, `verify-deploy-seguro.mjs` só aceita `NEXT_PUBLIC_SUPABASE_URL` na
forma canônica `https://<ref>.supabase.co` e com o `ref` de um projeto de
staging conhecido (lista `SUPABASE_REFS_STAGING` no próprio script). Recusa
URL ausente, domínio próprio, projeto de produção ou projeto desconhecido;
recusa chaves JWT legadas que sejam de produção ou de outro projeto; nas
chaves modernas, exige `sb_publishable_` no navegador e `sb_secret_` somente
no servidor. Como as chaves modernas são opacas, o destino continua provado
pela URL canônica presa à lista de projetos de staging. Também recusa
`DATABASE_URL` do banco de produção. Sem isso, `mock` + banco real aprovaria
pedido de graça numa URL pública.

Mudar essas variáveis é mudança de configuração: vale a senha do `AGENTS.md`.
