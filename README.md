# Reverá

E-commerce da Reverá — marca de próteses capilares premium.

**Estado em 27/08/2026.** O sistema está construído e roda: vitrine, carrinho,
checkout, criação de pedido, cotação de frete real, painel administrativo com
sete módulos e rastreamento de conversão. O que falta para vender **não é
código** — é preço, fotos, faixas de desconto e a conexão do gateway.

Duas leituras obrigatórias antes de mexer em qualquer coisa:

- `docs/auditoria-completa-26-08-2026.md` — o diagnóstico completo, com o que
  está provado, o que não está, e por quê.
- `docs/p0-4-superfrete-seguro.md` — a investigação do `insurance_value`, que
  descartou uma suspeita da própria auditoria.

**Não fazer deploy nem criar contas externas sem autorização explícita do
Francisco.** Nenhum projeto Vercel foi criado, nenhum `git push` foi feito.

## O que trava a loja hoje

O único produto está em `status='draft'`, com `price_cents = 0`, variante
inativa e nenhuma foto cadastrada. Enquanto isso não mudar, não há o que
vender — e o código impede vender por engano:

- a home só oferece "Comprar agora" quando existe produto vendável
  (`src/lib/catalog/vitrine.ts`);
- o carrinho recusa variante com preço zero (`src/lib/cart/store.ts`).

Depende de decisão do Francisco: **preço**, faixas de desconto, fotos,
confirmação de estoque, peso/dimensões reais e as 8 perguntas ocultas da FAQ.

## Stack

- Next.js `14.2.15` (App Router, `src/app`), React `18.3.1`, TypeScript
- Tailwind CSS, com tokens de marca em `src/styles/tokens.css`
- `@supabase/ssr` + `@supabase/supabase-js` — projeto Supabase real
  conectado, com as 7 migrations aplicadas
- `zod` para validação de schema de input, na fronteira de toda escrita
  (checkout, admin, formulários públicos)
- `vitest` para teste unitário
- npm (não pnpm/yarn) — mesma convenção do projeto irmão
  `saas-metodo-francisco`

## Como rodar localmente

```bash
npm install
cp .env.example .env.local   # preencher com valores reais quando existirem
npm run dev
```

Sem `.env.local` preenchido, `src/lib/supabase/client.ts` e
`src/lib/supabase/server.ts` lançam erro em runtime de propósito (falha
alta, não silenciosa) — não há projeto Supabase real para apontar ainda.

### Testes

```bash
npm run test
```

**127 testes**, em 11 arquivos, rodando em menos de um segundo. Cobrem as
regras que decidem dinheiro: desconto por quantidade, seguro do frete,
máquina de estados do pedido, CPF, atribuição de campanha, e as travas
introduzidas na correção dos P0 (falha fechada do pagamento, isolamento do
Purchase, ambiente da SuperFrete, preço zero, duplo clique).

`tests/integration` e `tests/e2e` continuam vazios — não há teste de
integração nem E2E automatizado.

## Variáveis de ambiente

Lista das variáveis que o código realmente lê (`process.env`), por área. Ver
`.env.example` para instruções de preenchimento e o histórico de cada uma.

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL` — URL do projeto Supabase, usada no cliente e no servidor.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — chave anônima do Supabase, usada no cliente e no servidor.
- `SUPABASE_SERVICE_ROLE_KEY` — chave de service role, só no servidor (contorna RLS).
- `DATABASE_URL` — conexão direta usada por `scripts/aplicar-migrations.mjs` (`npm run db:aplicar`).

### Pagamento

- `PAYMENT_PROVIDER` — escolhe o gateway ativo (`mock` ou `infinitepay`); sem ela o pagamento fica indisponível de propósito.
- `INFINITEPAY_HANDLE` — identifica a conta InfinitePay que recebe o pagamento; obrigatória quando `PAYMENT_PROVIDER=infinitepay`.
- `PAYMENT_WEBHOOK_SECRET` — segredo que forma o caminho do webhook de pagamento; sem ela o pagamento não abre.
- `STRIPE_SECRET_KEY` — chave secreta do gateway internacional (Stripe).
- `STRIPE_WEBHOOK_SECRET` — segredo para validar o webhook da Stripe.
- `STRIPE_API_BASE` — aponta o adapter da Stripe para um dublê local; só fora de produção.

### Frete (SuperFrete)

- `SUPERFRETE_TOKEN` — token da conta SuperFrete; a presença dele troca o mock pela API real.
- `SUPERFRETE_SANDBOX` — `"1"` para sandbox, `"0"` para produção; obrigatória quando o token existe.
- `SUPERFRETE_USER_AGENT` — identificação exigida pela SuperFrete em toda requisição.
- `SUPERFRETE_CEP_ORIGEM` — CEP de onde a peça sai (tem padrão embutido no código).
- `SUPERFRETE_REMETENTE_NOME` — nome do remetente na etiqueta.
- `SUPERFRETE_REMETENTE_RUA` — rua do endereço de origem.
- `SUPERFRETE_REMETENTE_NUMERO` — número do endereço de origem.
- `SUPERFRETE_REMETENTE_COMPLEMENTO` — complemento do endereço de origem.
- `SUPERFRETE_REMETENTE_BAIRRO` — bairro do endereço de origem.
- `SUPERFRETE_REMETENTE_CIDADE` — cidade do endereço de origem.
- `SUPERFRETE_REMETENTE_UF` — UF do endereço de origem.
- `SUPERFRETE_CAIXA_PESO_GRAMAS` — peso da caixa por peça, em gramas.
- `SUPERFRETE_CAIXA_COMPRIMENTO_CM` — comprimento da caixa, em cm.
- `SUPERFRETE_CAIXA_LARGURA_CM` — largura da caixa, em cm.
- `SUPERFRETE_CAIXA_ALTURA_CM` — altura da caixa, em cm.

### Rastreamento de conversão

- `NEXT_PUBLIC_META_PIXEL_ID` — ID do pixel da Meta, exposto ao navegador.
- `NEXT_PUBLIC_GOOGLE_TAG_ID` — tag do Google (`GT-` carrega GA4+Ads, `G-` só GA4).
- `NEXT_PUBLIC_GA4_MEASUREMENT_ID` — measurement ID do GA4 usado no envio de servidor.
- `META_CAPI_TOKEN` — token da Conversions API da Meta (segredo, só servidor).
- `GA4_API_SECRET` — secret do Measurement Protocol do GA4 (segredo, só servidor).
- `TRACKING_ALLOW_DEV_SEND` — libera envio de rastreamento fora de produção, só junto com `META_TEST_EVENT_CODE`.
- `META_TEST_EVENT_CODE` — código do Gerenciador de Eventos da Meta para marcar envios como teste.

### WhatsApp / notificações

- `WHATSAPP_PROVIDER` — escolhe o provedor de envio (`meta` ou `clint`); ausente ou outro valor desliga o envio.
- `WHATSAPP_PHONE_NUMBER_ID` — ID do número de telefone na API oficial da Meta (modo `meta`).
- `WHATSAPP_TOKEN` — token de acesso da API oficial da Meta (modo `meta`).
- `WHATSAPP_TEMPLATE_NOME` — nome do template aprovado usado no envio via Meta.
- `WHATSAPP_TEMPLATE_IDIOMA` — idioma do template da Meta (padrão `pt_BR`).
- `CLINT_API_TOKEN` — token de acesso da API da Clint (modo `clint`).
- `CLINT_CANAL_ID` — ID do canal usado para enviar pela Clint.
- `CLINT_TEMPLATE_ID` — template padrão da Clint quando quem chama não passa um específico.
- `CLINT_TEMPLATE_CONTATO_ID` — template da Clint usado no aviso de novo contato/formulário.
- `WHATSAPP_DESTINO` — número que recebe o aviso de venda paga e o aviso de novo contato.

### Internacional

- `CHECKOUT_PAISES` — países abertos no checkout além do Brasil (ISO-2, separados por vírgula).
- `NFE_PROVIDER_ATIVO` — liga o provedor de emissão de NF-e para exportação (`"1"`).
- `INVOICE_ATIVA` — liga a emissão de invoice de exportação (`"1"`).
- `DHL_ATIVA` — liga a integração com a DHL para exportação (`"1"`).

### Site e ambiente

- `NEXT_PUBLIC_SITE_URL` — URL pública do site, usada para montar webhook, redirect do gateway e links de admin.
- `APP_ENV` — força o ambiente lógico da aplicação (ex.: `staging`) quando a Vercel não distingue sozinha.

### Fornecidas automaticamente pela plataforma (não precisa definir)

- `VERCEL_ENV` — ambiente da Vercel (`production`, `preview`, `development`); usada para decidir o ambiente lógico.
- `VERCEL_URL` — domínio do deploy atual; fallback de `NEXT_PUBLIC_SITE_URL`.
- `VERCEL_PROJECT_PRODUCTION_URL` — domínio de produção do projeto; fallback de `NEXT_PUBLIC_SITE_URL`.
- `NODE_ENV` — ambiente do Node/Next (`development`, `test`, `production`); afeta o cookie do carrinho e a detecção de ambiente.
- `PORT` — porta usada para montar a URL local em desenvolvimento (padrão `3001`).

### Scripts locais (fora do runtime da aplicação)

- `FAKE_STRIPE_PORT` — porta do dublê local da Stripe (`scripts/stripe-fake.mjs`).
- `APP_BASE` — URL base usada pelo dublê local da Stripe para montar o webhook.

## Banco de dados

Schema completo em `supabase/migrations/00000000000001_init.sql` — uma
migration única, decisão de arquitetura já tomada antes deste scaffold.
**As 7 migrations estão aplicadas** no Supabase do projeto (conferido em
26/08/2026 — inclusive `conversion_logs`, da migration 7). Quando
Migration nova se aplica com `npm run db:aplicar` (conexão direta) ou pela
UI do Supabase.

RLS está habilitado em toda tabela, com policy pública só de leitura no que
é seguro mostrar na vitrine (produtos ativos, variantes ativas, mídia,
cores, FAQ visível, review publicada etc.). Tudo mais só é acessível pela
service role (backend) — CRUD de admin com policy própria checando
`admin_users` fica para fase futura.

### Seeds

`seeds/*.json` tem conteúdo real (não fictício):

- `colors.json` — 8 códigos de cor reais (`1b`, `2`, `3`, `3.10`, `4`, `5`,
  `6`, `7`), `photo_url` vazio até alguém importar as fotos do Drive.
- `gray-levels.json` — 7 níveis (`10` a `80`), todos com
  `uses_synthetic_fiber: true`.
- `products.json` — um produto seed, Micropele 0,08mm, com
  `price_cents: null` porque o Francisco ainda não definiu o preço. A
  variante nasce `is_active: false` e o produto `status: 'draft'` por
  causa disso — não é possível ativar um produto sem preço real.
- `faq.json` — as 15 perguntas da missão. Onde a resposta não é um fato
  confirmado (durabilidade, prazo de envio, política de venda para
  profissional etc.), o campo é o texto literal `"TODO: aguardando
  definição"` e o item nasce `is_visible: false`, para que o texto "TODO"
  nunca apareça sem querer numa FAQ pública.

`scripts/seed.mjs` lê esses JSONs e faz upsert via client admin do Supabase.
**Já rodou**: cores, níveis de grisalho e FAQ estão no banco. O produto entrou
com `price_cents = 0` — e é por isso que a loja não vende ainda.

## Sistema de design

Direção: premium + tecnologia + naturalidade — deliberadamente não é o
visual padrão de produto "gerado por IA" (sem gradiente roxo-azul, sem
Inter como única fonte). Paleta e fontes em `src/styles/tokens.css` /
`tailwind.config.ts`:

- `--paper` (papel quente) como fundo, `--ink` (quase preto quente) como
  texto — nunca branco/preto puros.
- `--copper` / `--copper-deep` como acento primário, usado com moderação.
- `--moss` reservado só para selo de confiança/garantia (ver
  `TrustBar.tsx`) — nunca cor de botão ou link.
- Fraunces (display, serifada) para headline e nome de produto; Manrope
  (corpo) para o resto. Carregadas via `next/font/google` em
  `src/app/layout.tsx`.

**Dark mode não foi implementado — decisão deliberada.** É loja com
identidade visual única e fixa, não um app de uso prolongado onde dark
mode é esperado.

## Componentes

`src/components/ui/` tem o esqueleto funcional dos 18 componentes do
escopo (Button, ProductCard, Price, QuantitySelector, VariantSelector,
ColorSelector, VideoSection, ReviewCard, FAQ, TrustBar,
ShippingCalculator, CartDrawer, CheckoutSummary, OrderStatus, AdminTable,
Modal, Toast, FormField). Tipados, com props mínimas e sensatas, sem
Storybook nem teste visual ainda — não são pixel-perfect, são a fundação.

## Pagamento e frete

`src/lib/payments/` e `src/lib/shipping/` definem a interface
(`PaymentProvider`, `ShippingProvider`). Os dois adapters reais **existem**:
InfinitePay e SuperFrete, escritos contra a documentação oficial.

**Pagamento — falha fechada (corrigido em 27/08/2026).** `getPaymentProvider()`
exige `PAYMENT_PROVIDER` explícita. Ausente → lança, e o pagamento fica
indisponível. `mock` só roda em desenvolvimento — ele aprova qualquer
pagamento sem cobrar, e um deploy que caísse nele entregaria as peças de
graça. `npm run verify:deploy` recusa uma configuração insegura antes de
subir.

**Frete — ambiente explícito.** `SUPERFRETE_SANDBOX` aceita `"1"` (sandbox) ou
`"0"` (produção) e mais nada; ausente ou irreconhecível lança. Criar e pagar
etiqueta é bloqueado fora de produção, sem variável de escape — `payLabel()`
debita a carteira de verdade. A **cotação** é real e foi exercitada
(PAC/SEDEX/Loggi respondendo). A **compra de etiqueta nunca foi feita**.

## Decisões pendentes (não inventadas aqui)

- **Gateway de pagamento**: o adapter da InfinitePay está escrito e **nunca
  processou um centavo**. Falta conta confirmada e um pagamento real de valor
  baixo, ponta a ponta.
- **Plano de hospedagem**: Vercel é a convenção do projeto irmão, mas
  nenhum projeto Vercel foi criado para a Reverá.
- **Domínio**: não definido.
- **Aprovação de wordmark/identidade visual final**: os tokens de cor e
  tipografia neste scaffold seguem a direção descrita na missão, mas não
  houve aprovação formal de peça de marca (logo, wordmark) ainda.
- **Preços reais**: nenhum preço foi inventado. É a decisão que destrava
  metade da lista.
- **Número de WhatsApp da loja**: é **(12) 98149-9901**, e mora em
  `src/lib/config/whatsapp.ts` — constante, não variável de ambiente (o
  porquê está escrito lá). Trocado em 03/09/2026: o número anterior está na
  conta oficial da Meta, e quem escrevia para lá caía na API em vez de numa
  pessoa. Os dígitos antigos aparecem em UM lugar só, o comentário de
  `whatsapp.ts` que conta essa história — de propósito, para que nenhum
  documento os ofereça de volta como valor a configurar. `WHATSAPP_POST_PURCHASE_NUMBER` foi
  aposentada e **pode ser apagada da Vercel**; ninguém mais a lê.
  Aparece em dois lugares: a página do pedido (`SuportePosCompra.tsx`, nos
  dois estados — pago e *Aguardando pagamento*, revisão de 31/08/2026) e o
  botão de `/para-profissionais`. A regra de 26/08 que o escondia fora da
  página do pedido caiu junto com a troca: o número é publicado de propósito.
  `WHATSAPP_DESTINO` é outra coisa — é para ONDE chega o aviso de venda paga,
  não o que o cliente vê, e continua vindo do ambiente.

## O que ainda NÃO existe

Verificado na auditoria de 26/08/2026 e não alterado desde então:

- **Nenhum e-mail é enviado.** O comprador não recebe confirmação; a dona não
  recebe aviso de venda. Não há biblioteca de envio no projeto.
- **Nenhum pagamento real jamais foi processado.** O adapter da InfinitePay
  está escrito conforme a documentação oficial e nunca rodou.
  `PAYMENT_PROVIDER` precisa ser `infinitepay` em produção — sem a variável, o
  pagamento fica indisponível de propósito (falha fechada).
- **Nenhuma etiqueta foi comprada.** A cotação da SuperFrete é real e foi
  exercitada; a compra de etiqueta não.
- **Sem política de privacidade, termos ou consentimento de cookies** — apesar
  de o checkout coletar CPF.
- **Sem gestão de fotos no painel.** `product_media` existe no banco e não é
  lida nem escrita por nenhum código.
- **Sem deploy.** Não existe projeto Vercel nem domínio.
