# Go-live do internacional — o roteiro inteiro numa página

Escrito em 28/08/2026, quando o test mode ficou provado de ponta a ponta
(compra real na Stripe em sandbox, webhook assinado, reembolso, Admin).
Este é o caminho entre "está pronto no staging" e "vendendo de verdade" —
na ORDEM em que as coisas precisam acontecer, com quem resolve cada uma.

**Regra de ouro: a ordem importa.** Migration antes de deploy; chaves antes
de abrir país; preço e frete antes de CHECKOUT_PAISES. Cada passo abaixo é
seguro sozinho — pular a ordem é o único jeito de quebrar algo.

---

## Passo 0 — Decisões que só o Francisco pode tomar (sem pressa)

| decisão | onde ela entra |
|---|---|
| **Conta Stripe de produção da Reverá** — a usada no teste é o sandbox da OneMark IA; para vender de verdade é preciso ativar uma conta live (da Reverá ou decisão de usar a existente) e concluir a verificação da Stripe | passo 3 |
| **Preços reais por mercado** (USD/EUR/GBP/AUD/CAD) — os do staging são fixtures de teste | passo 4 |
| **Cotação DHL real** com validade (a de R$ 333,23 está vencida e não serve) | passo 4 |
| **Texto jurídico do aceite** — o atual é `2026-08-28.v1.pre-juridico`; quando o jurídico aprovar, entra com versão nova em `src/lib/internacional/aceite.ts` | antes de abrir o primeiro país |
| **Prazo de preparação da Reverá** (dias úteis) — hoje a tela só mostra o prazo da transportadora | opcional para o go-live |

## Passo 1 — Migrations 8+9+10 na PRODUÇÃO (5 min)

1. Abrir o SQL Editor do projeto de produção — conferir no topo da tela que
   é **REVERA** (`ngnaemfiytutyplolgxb`), NÃO o staging.
2. Colar `supabase/aplicar/PRODUCAO-8-9-10.sql` inteiro e rodar. O aviso de
   "destructive operations" é dos drop-e-recria de policy; não apaga dado.
3. Conferir: `orders` deve responder com as colunas `payment_status`,
   `currency`, `terms_version`; a tabela `intl_shipping_quotes` deve existir.

**Nada muda para o cliente neste passo** — o site no ar continua igual.

## Passo 2 — Publicar o código (1 comando, DEPOIS do passo 1)

```bash
cd ~/Claude/revera && git checkout main && git merge fundacao-internacional-27-08 && git push origin main
```

A Vercel builda sozinha. Com as envs de hoje, o site continua 100% nacional
(CHECKOUT_PAISES não existe → só Brasil; sem chave Stripe → internacional
indisponível). O que muda de imediato: as correções já entram valendo —
filtros/busca do admin, admin no celular, frete que não cai mais em mock,
página do pedido multi-moeda.

## Passo 3 — Chaves Stripe LIVE na Vercel (quando a conta existir)

No painel da Vercel (Production), adicionar:

| variável | valor | tipo |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` da conta de produção | Sensitive |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` do endpoint criado no Dashboard | Sensitive |

O endpoint de webhook no Dashboard da Stripe (modo live) aponta para:
`https://www.reveraprotesecapilar.com/api/webhooks/stripe/<hash>` — o hash é
o SHA-256 de `PAYMENT_WEBHOOK_SECRET`; imprime com:

```bash
cd ~/Claude/revera && node -e "const c=require('crypto');const fs=require('fs');const m=fs.readFileSync('.env.local','utf8').match(/^PAYMENT_WEBHOOK_SECRET=(.+)$/m);console.log('/api/webhooks/stripe/'+c.createHash('sha256').update(m[1].trim()).digest('hex'))"
```

Eventos a assinar no endpoint: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, `charge.refunded`.

A trava de deploy recusa sozinha: chave test em produção, chave live fora
dela, e `STRIPE_API_BASE` onde há comprador real.

## Passo 4 — Preço e frete reais (no próprio site, sem deploy)

Em `www.reveraprotesecapilar.com/admin` → **Internacional**:

1. Preço por mercado de cada variante (vazio = mercado fechado para a peça).
2. Cotação de frete DHL do país, com validade — vencida, o país fecha sozinho.

## Passo 5 — Abrir o(s) país(es) (1 variável)

Na Vercel (Production): `CHECKOUT_PAISES=BR,US` (e os demais quando quiser).
Redeploy. Um país sem preço ou sem cotação vigente continua se mostrando
indisponível mesmo listado — a variável sozinha não vende nada.

## Passo 6 — Prova de fogo em produção (test antes de live, se quiser)

Opcional e recomendado: antes das chaves live, dá para repetir a compra de
teste EM PRODUÇÃO com chaves test? **Não** — a trava recusa test key em
produção de propósito (aprovaria compra sem dinheiro). A prova de produção é
uma compra live pequena real, estornada em seguida pelo Dashboard — o
caminho de estorno já está provado (paid→refunded sem tocar envio).

---

## O que NÃO entra neste go-live (fechado por decisão)

DHL API, NF-e de exportação, Commercial Invoice, DRE/DU-E, Incoterm
definitivo, cálculo de imposto. O pedido internacional nasce, é pago e
aparece no Admin com o checklist dizendo exatamente o que falta — e o
despacho segue o fluxo operacional (preparar e levar à DHL) enquanto a
papelada dessas fases não existir.
