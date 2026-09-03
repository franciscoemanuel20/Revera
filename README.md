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
