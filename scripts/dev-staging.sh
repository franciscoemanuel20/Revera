#!/bin/sh
# Dev server apontando para o banco de STAGING — nunca produção.
#
# Como o Next.js lê .env.local do disco por conta própria, não basta
# "sourcear" .env.staging: variável de PRODUÇÃO que não fosse sobrescrita
# continuaria valendo. Por isso este script faz as duas coisas:
#   1. exporta tudo de .env.staging (variável de SO vence .env.local);
#   2. NEUTRALIZA explicitamente cada credencial de produção que existe em
#      .env.local e não tem par no staging — exportada vazia, ela vence o
#      arquivo e o código a trata como "não configurado" (fail-closed).
#
# Se .env.local ganhar variável sensível nova, adicione-a à lista abaixo.
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env.staging ]; then
  echo "sem .env.staging — nada de servidor de staging" >&2
  exit 1
fi

# 0) prova de isolamento antes de subir qualquer coisa
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
node scripts/provar-isolamento-staging.mjs >/dev/null

# 1) staging entra como env de SO
set -a
. ./.env.staging
set +a

# 2) credenciais de produção neutralizadas (vazia = não configurada)
export SUPERFRETE_TOKEN=""
export INFINITEPAY_HANDLE=""
export META_CAPI_TOKEN=""
export NEXT_PUBLIC_META_PIXEL_ID=""
export NEXT_PUBLIC_GOOGLE_TAG_ID=""
export NEXT_PUBLIC_GA4_MEASUREMENT_ID=""
export GA4_API_SECRET=""
export WHATSAPP_PROVIDER=""
export WHATSAPP_TOKEN=""
export WHATSAPP_PHONE_NUMBER_ID=""
export WHATSAPP_DESTINO=""
export NEXT_PUBLIC_SITE_URL="http://localhost:3002"

# 3) Stripe em modo DUBLÊ (scripts/stripe-fake.mjs, porta 4242):
#    - a chave é um marcador de teste (o dublê não autentica; o adapter só
#      exige que NÃO seja live fora de produção);
#    - o STRIPE_WEBHOOK_SECRET é compartilhado com o dublê, que assina os
#      webhooks no formato real — a verificação exercitada é a de verdade;
#    - STRIPE_API_BASE aponta o adapter para o dublê. Em produção o adapter
#      RECUSA esta variável; aqui é exatamente o uso para o qual ela existe.
export STRIPE_SECRET_KEY="sk_test_duble_local_staging"
export STRIPE_WEBHOOK_SECRET="whsec_duble_local_staging"
export STRIPE_API_BASE="http://localhost:4242"

# 4) países abertos para TESTE no staging — em produção quem decide é a
#    variável na Vercel, que hoje não existe (só Brasil).
export CHECKOUT_PAISES="BR,US,PT,GB,AU,CA"

exec npm run dev -- --port 3002
