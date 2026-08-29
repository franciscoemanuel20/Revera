# Ativar a conta Stripe da Reverá — o passo a passo

Escrito em 28/08/2026. É o único bloqueio que sobrou entre o internacional
pronto e o internacional vendendo. **Nada aqui posso fazer por você**:
criação e ativação de conta financeira é ato do titular, com dados da
empresa e conta bancária. O que dá para fazer é deixar o caminho sem
adivinhação — é o que este arquivo é.

---

## Antes de tudo: existem VÁRIAS contas, e a maioria é armadilha

Conferido por API em 28/08/2026 e revisto no mesmo dia, ao abrir o Dashboard.

| conta | id | o que é | serve? |
|---|---|---|---|
| **OneMark IA** (live) | `acct_1U9HIiRsv9xpGCLP` | ativa, com repasses diários desde jul/2026 | **NÃO** |
| Reverá — par antigo (sandbox) | `acct_1U9RgORgZkIc6pac` | onde a compra de teste do staging passou | não vende |
| Reverá — par antigo (live) | `acct_1U9RgID7fHfQt4eq` | nunca ativada | ver abaixo |
| Reverá — par em uso (sandbox) | `acct_1U9TC7RfZUTmt7Fy` | é o que abre ao entrar no Dashboard | não vende |
| **Reverá — par em uso (live)** | `acct_1U9TBvRmNIBXBagx` | é a que está sendo ATIVADA | **é esta** |

**Existem DOIS pares de conta Reverá**, e isso é uma armadilha nova. O
staging usa hoje a chave do par ANTIGO (`acct_1U9RgOR...`). A chave que for
para a Vercel tem que ser a do par que for de fato ativado —
`acct_1U9TBvRmNIBXBagx`. Misturar os dois produz o pior tipo de erro: tudo
"funciona" em teste e o dinheiro real vai para uma conta que ninguém está
olhando.

## A decisão irreversível, já tomada

**Pessoa Jurídica** — decidido pelo Francisco em 28/08/2026, na primeira
tela da ativação.

É a escolha que faz a fatura do cartão do cliente sair no CNPJ da Reverá e
casar com quem emite a NF-e. Era o motivo de termos descartado a conta da
OneMark, e seria contraditório resolver isso lá e recriar aqui escolhendo
Pessoa Física.

Consequências que vêm junto, e a Stripe avisa que **não têm volta**:

- o CPF/CNPJ coletado nas etapas seguintes não pode ser alterado depois de
  verificado;
- a conta bancária dos repasses precisa estar **no mesmo CNPJ** — conta de
  pessoa física não recebe;
- a NF-e da venda internacional precisa sair por esse mesmo CNPJ, senão o
  descasamento volta pelo outro lado.

Por que a da OneMark não serve, mesmo estando ativa e à mão: o dinheiro
cairia na PJ errada e a fatura do cliente diria "OneMark IA" — descasando do
que a NF-e da Reverá vai dizer. É problema contábil e é problema de
confiança do comprador ao mesmo tempo.

**O estado real da conta certa hoje**: `charges_enabled: false`,
`payouts_enabled: false`, `details_submitted: false`, `requirements` VAZIO,
`business_type` nulo. `requirements` vazio não significa "a Stripe está
analisando" — significa que **o formulário de ativação nunca foi aberto**.
Não adianta esperar.

**Detalhe que já custou tempo**: o navegador está logado no dono da OneMark.
Abrir `dashboard.stripe.com/acct_1U9RgID7fHfQt4eq/...` REDIRECIONA para a
conta da OneMark — a da Reverá está sob outro e-mail. É preciso entrar com o
login da Reverá.

---

> **ESTADO EM 28/08/2026, 22h47: cadastro ENVIADO, em análise.** O
> Dashboard mostra "Análise em andamento — algumas funcionalidades estão
> pausadas enquanto revisamos suas informações. Isso leva de 2 a 3 dias".
> Ou seja: o passo 1 está feito e não há o que fazer até a Stripe responder.
> Quando ela liberar, `charges_enabled` vira `true` — é o que eu confiro
> pela API antes de qualquer chave ir para a Vercel.
>
> Durante a análise, recursos do painel ficam pausados. Erro ao criar link
> de pagamento ou gerar chave nesse período é a revisão, não configuração
> errada.

## Passo 1 — Preencher a ativação (você, ~20 min)

No Dashboard da Stripe, logado na conta da Reverá, em **Ativar pagamentos**.
O que ela pede, na ordem:

1. **Tipo de negócio** — pessoa jurídica. **JÁ ESCOLHIDO em 28/08/2026.**
2. **CNPJ, razão social e endereço** da empresa.
3. **Representante legal** — nome, CPF, data de nascimento, endereço, cargo.
   A Stripe exige a pessoa física que responde pela empresa.
4. **Sócios com 25% ou mais**, se houver.
5. **Descrição do que se vende** e o site: `reveraprotesecapilar.com`.
6. **Conta bancária** da Reverá para os repasses.
7. **Descritor da fatura** — o texto que aparece no extrato do cartão do
   cliente. Ponha algo que ele reconheça: `REVERA` ou `REVERAPROTESE`. Um
   descritor irreconhecível é a causa nº 1 de chargeback por engano.

A verificação da Stripe costuma sair no mesmo dia; documento adicional pode
levar mais. A conta está pronta quando `charges_enabled` virar `true`.

## Passo 2 — Criar o webhook (você, 5 min)

Ainda no Dashboard, **em modo LIVE** (não em teste), Developers → Webhooks →
Add endpoint.

A URL tem um segredo no caminho — imprima a sua com:

```bash
cd ~/Claude/revera && node -e "const c=require('crypto');const fs=require('fs');const m=fs.readFileSync('.env.local','utf8').match(/^PAYMENT_WEBHOOK_SECRET=(.+)$/m);console.log('https://www.reveraprotesecapilar.com/api/webhooks/stripe/'+c.createHash('sha256').update(m[1].trim()).digest('hex'))"
```

Eventos a assinar, exatamente estes cinco:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`

Guarde o `whsec_...` que ela mostra — é o do passo 3.

## Passo 3 — As duas chaves na Vercel (você, 3 min)

Vercel → projeto `revera` → Settings → Environment Variables → **Production**:

| variável | valor | tipo |
|---|---|---|
| `STRIPE_SECRET_KEY` | a `sk_live_...` de `acct_1U9TBvRmNIBXBagx` | Sensitive |
| `STRIPE_WEBHOOK_SECRET` | o `whsec_...` do passo 2 | Sensitive |

**Isto é você quem digita, não eu** — e não só por política: o classificador
do meu ambiente barra digitar valor de variável de pagamento no painel da
Vercel, inclusive pela CLI. Já testado em 26/08 e de novo no go-live.

A trava de deploy recusa sozinha chave de teste em produção e chave live
fora dela, então um engano aqui falha alto, não silenciosamente.

## Passo 4 — Preço e frete reais (você me passa, eu escrevo)

`variant_prices` e `intl_shipping_quotes` estão **vazias na produção**. Sem
elas, país aberto continua indisponível — a variável do passo 5 sozinha não
vende nada. Preciso de:

- preço da Micropele por mercado: **USD, EUR, GBP, AUD, CAD**;
- cotação DHL por país, com **data de validade** (a de R$ 333,23 está
  vencida). Cotação vencida fecha o país sozinho, de propósito.

## Passo 5 — Abrir o país (1 variável)

Vercel (Production): `CHECKOUT_PAISES=BR,US` — e os outros quando quiser.
Redeploy. Brasil nunca sai da lista, mesmo se a variável for preenchida
errado.

## Passo 6 — A prova de fogo

Uma compra live pequena, real, estornada em seguida pelo Dashboard. Não dá
para provar produção com chave de teste: a trava recusa, de propósito —
aprovaria compra sem dinheiro. O caminho de estorno já está provado
(`paid` → `refunded` sem tocar no envio).

---

## O que continua fora do go-live

DHL API, NF-e de exportação, Commercial Invoice, DU-E, Incoterm definitivo e
cálculo de imposto. O pedido internacional nasce, é pago e aparece no Admin
com o checklist dizendo o que falta; o despacho segue no fluxo operacional
(preparar e levar à DHL).

E uma coisa que **depende de decisão sua, não do jurídico**: garantia e
devolução em compra internacional não estão no texto de aceite. Ver
`src/lib/internacional/aceite.ts`, seção "O QUE A v2 AINDA NÃO DIZ".
