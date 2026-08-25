# Reverá

E-commerce da Reverá — marca de próteses capilares premium. Este repositório
é a **fundação** do projeto: schema de banco, sistema de design, esqueleto
de componentes e as duas integrações externas (pagamento e frete) desenhadas
como interface + implementação MOCK. Não há vitrine real, checkout
funcionando nem conta em serviço nenhum criada ainda — isso é greenfield,
scaffold de fase 1.

**Não fazer deploy nem criar contas externas sem autorização explícita do
Francisco.** Nenhum projeto Vercel, nenhum projeto Supabase na nuvem,
nenhum `git push` para remoto — nada disso foi feito por este scaffold e
nada disso deve ser feito sem o Francisco decidir primeiro.

## Stack

- Next.js `14.2.15` (App Router, `src/app`), React `18.3.1`, TypeScript
- Tailwind CSS, com tokens de marca em `src/styles/tokens.css`
- `@supabase/ssr` + `@supabase/supabase-js` — sem projeto real conectado
  ainda (ver "decisões pendentes")
- `zod` para validação de schema de input (ainda não usado em rota nenhuma,
  porque não há rota de escrita real ainda)
- `vitest` para teste unitário
- npm (não pnpm/yarn) — mesma convenção do projeto irmão
  `saas-metodo-francisco`

## Como rodar localmente

```bash
npm install     # AINDA NÃO RODADO NESTE AMBIENTE — ver nota abaixo
cp .env.example .env.local   # preencher com valores reais quando existirem
npm run dev
```

> **`npm install` não foi executado neste scaffold.** O ambiente em que ele
> foi criado não tem acesso à rede que o `npm install` precisa. O
> `package.json` está correto e completo — rodar `npm install` num ambiente
> com rede deve funcionar sem ajuste. `package-lock.json` também não existe
> ainda por causa disso; ele nasce no primeiro `npm install` bem-sucedido.

Sem `.env.local` preenchido, `src/lib/supabase/client.ts` e
`src/lib/supabase/server.ts` lançam erro em runtime de propósito (falha
alta, não silenciosa) — não há projeto Supabase real para apontar ainda.

### Testes

```bash
npm run test
```

Só existe `tests/unit/discount.test.ts` por enquanto (cálculo de desconto
por quantidade, `src/lib/pricing/discount.ts`). `tests/integration` e
`tests/e2e` existem como pasta vazia — a estrutura está pronta, o conteúdo
vem em fase seguinte.

## Banco de dados

Schema completo em `supabase/migrations/00000000000001_init.sql` — uma
migration única, decisão de arquitetura já tomada antes deste scaffold.
**Não foi aplicada em servidor nenhum.** É só o arquivo SQL local. Quando
existir um projeto Supabase real, aplica-se com `supabase db push` (ou pela
UI do Supabase) — nunca rodado por este scaffold.

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

`scripts/seed.mjs` lê esses JSONs e faz upsert via client admin do
Supabase. **Não foi executado** — não existe projeto Supabase real para
rodar contra. Está pronto para quando existir.

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

## Pagamento e frete — desacoplados, só MOCK

`src/lib/payments/` e `src/lib/shipping/` definem a interface
(`PaymentProvider`, `ShippingProvider`) e uma implementação `Mock*` que
retorna dado fake determinístico, sem chamar rede nenhuma. Isto é
deliberado e não é escopo em aberto: **implementação real de pagamento
(InfinitePay) e frete (SuperFrete) não faz parte deste scaffold** — é
linha que só se cruza na conversa principal com o Francisco, por ser
regra comercial crítica (preço cobrado do cliente, aprovação/recusa de
pagamento).

- `getPaymentProvider()` decide pela env `PAYMENT_PROVIDER` (`mock` hoje;
  `infinitepay` lança erro "não implementado — aguardando decisão do
  Francisco").
- `getShippingProvider()` decide pela presença de `SUPERFRETE_TOKEN`
  (ausente = mock; presente = lança "não implementado — Fase 3").

## Decisões pendentes (não inventadas aqui)

- **Gateway de pagamento**: InfinitePay é o nome citado no projeto, mas a
  integração real não foi decidida nem implementada.
- **Plano de hospedagem**: Vercel é a convenção do projeto irmão, mas
  nenhum projeto Vercel foi criado para a Reverá.
- **Domínio**: não definido.
- **Aprovação de wordmark/identidade visual final**: os tokens de cor e
  tipografia neste scaffold seguem a direção descrita na missão, mas não
  houve aprovação formal de peça de marca (logo, wordmark) ainda.
- **Preços reais**: nenhum preço foi inventado. `seeds/products.json` tem
  `price_cents: null` de propósito.
- **Número de WhatsApp pós-compra**: existe como comentário em
  `.env.example` (`WHATSAPP_POST_PURCHASE_NUMBER`), mas não está
  implementado em componente nenhum ainda — quando for, só em fluxo
  pós-compra, nunca em página pré-compra ou metadata.

## O que este scaffold NÃO fez (por desenho, não por esquecimento)

- Nenhum `npm install` — sem rede no ambiente em que foi criado.
- Nenhuma migration aplicada em Supabase real.
- Nenhuma conta externa criada (Supabase, Vercel, InfinitePay,
  SuperFrete, Meta, GTM/GA4).
- Nenhum `git push` — só `git init` local.
- Nenhuma integração real de pagamento, frete, ou rastreamento de
  conversão.
- Nenhum teste E2E — só a estrutura de pastas (`tests/e2e`) e um teste
  unitário de exemplo.
