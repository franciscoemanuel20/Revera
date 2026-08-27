# Auditoria completa — Reverá

**Data:** 26/08/2026
**Escopo:** tudo que existe no repositório `/Users/oliveira/Claude/revera`, o banco Supabase real apontado por `.env.local`, e o site rodando em `localhost:3001`.
**Regra desta auditoria:** nada foi corrigido, alterado ou implementado. Só leitura, teste e medição.

### Níveis de evidência usados

| Nível | Significa |
|---|---|
| **N0** | Planejada — existe só como intenção/documento |
| **N1** | Código encontrado e lido |
| **N2** | Coberta por teste automatizado que roda e passa |
| **N3** | Integração real exercitada contra o serviço externo |
| **N4** | Comprovada por mim pela interface do site |
| **N5** | Comprovada em produção |

### Vocabulário

**BUG CONFIRMADO** (reproduzi) · **RISCO** (o código permite, não reproduzi) · **LACUNA** (não existe) · **DEPENDÊNCIA EXTERNA** (falta credencial/conta/decisão) · **MELHORIA**

---

## 1. Resumo executivo

A Reverá **não é um protótipo**. É um e-commerce com arquitetura de qualidade acima da média: preço recalculado no servidor em todo ponto, confirmação de pagamento por duas portas independentes, idempotência garantida por constraint de banco e não por `if`, Purchase que nasce só depois de reconfirmação com o gateway. Testei as três perguntas de segurança que o Francisco fez nominalmente — **as três passaram**.

E ainda assim a loja **não pode vender hoje**, por um motivo que não é técnico:

> **Não existe produto vendável.** O único produto do banco está em `draft`, com `price_cents = 0`, variante inativa, zero fotos cadastradas e zero regras de desconto. A página do produto responde **404**, e os três botões "Comprar agora" da home apontam exatamente para essa URL morta.

Ou seja: o motor está construído e é bom; o combustível nunca foi colocado. A distância entre "não vende" e "vende" é de cadastro e configuração — não de programação.

**Os três achados que mais pesam:**

1. **P0 — A home inteira leva a um 404.** Nenhum visitante consegue chegar a um produto. Isto sozinho impede até "apresentar o site".
2. **P0 (risco de configuração) — `PAYMENT_PROVIDER` tem `mock` como padrão silencioso.** Um deploy sem essa variável entrega produto de graça *e* dispara Purchase real na Meta. Hoje o `.env.local` está em `mock` com Pixel e token de CAPI **reais** preenchidos.
3. **P1 — Ninguém é avisado de nada.** Não existe envio de e-mail em lugar nenhum do código: o comprador não recebe confirmação e a dona não recebe notificação de venda.

**Percentual real concluído: 62%.** Detalhado na seção 23.

---

## 2. Escopo original recuperado

Reconstruí o pedido a partir do `README.md`, de `docs/fundacao-25-08-2026.md`, dos 24 commits, dos comentários de decisão no código (que são densos e datados) e do schema.

| # | O que foi pedido | Construído? | Funciona? |
|---|---|---|---|
| 1 | Vitrine pública de próteses | Sim | **Parcial — produto em draft, 404** |
| 2 | Página de produto com galeria e variações | Sim (código) | **Não — 404 e sem fotos no banco** |
| 3 | Seletor de quantidade | Sim | Não comprovado (sem produto) |
| 4 | Desconto por quantidade | Sim | **Não — zero regras cadastradas** |
| 5 | Carrinho persistente | Sim | Não comprovado pela interface |
| 6 | Checkout com dados + endereço | Sim | Parcial (form abre, sem itens) |
| 7 | Cálculo de frete | Sim | **Sim — API real respondeu** |
| 8 | Pagamento | Sim (interface + adapter) | **Mock. InfinitePay nunca exercitada** |
| 9 | Webhook de confirmação | Sim | Sim (guarda testada) |
| 10 | Pedido criado e rastreável | Sim | Não comprovado |
| 11 | Pixel Purchase só com pagamento real | Sim | Sim, por desenho |
| 12 | Painel para a dona | Sim, 7 módulos | Parcial — ver seção 14 |
| 13 | Etiqueta / despacho | Sim | Não comprovado (custa dinheiro) |
| 14 | WhatsApp só pós-compra | Sim | **Variável vazia — nunca aparece** |
| 15 | Ferramenta "ajude-me a achar minha cor" | Sim | Não comprovado |
| 16 | Página para profissionais | Sim | Sim |
| 17 | FAQ, garantia, cuidados | Sim | Sim (7 de 15 perguntas visíveis) |
| 18 | E-mail de confirmação | **Não** | **Não existe** |
| 19 | SEO | Parcial | **Títulos duplicados, sem sitemap/OG** |
| 20 | Analytics de funil completo | Parcial | **ViewContent e AddToCart são código morto** |

**Divergência importante entre documento e realidade:** o `README.md` ainda descreve a fase 1 ("Não há vitrine real, checkout funcionando nem conta em serviço nenhum criada ainda"). Isso deixou de ser verdade há 20 commits. Quem ler o README hoje é enganado sobre o próprio projeto. → **LACUNA de documentação, P2.**

---

## 3. E2E humano — o que consegui e o que não consegui

Servidor local no ar (`localhost:3001`, Next 15.5.24), banco Supabase real conectado, desktop e mobile (375×812).

### O que aconteceu

| Passo | Resultado | Evidência |
|---|---|---|
| Abrir a home | **PASS** — carrega, conteúdo correto | N4 |
| Navegar pelo menu | **PASS** — 11 páginas respondem 200 | N4 |
| Clicar "Comprar agora" | **FAIL — 404** | N4 |
| Escolher produto | **BLOQUEADO** | — |
| Quantidade / desconto | **BLOQUEADO** | — |
| Adicionar ao carrinho | **BLOQUEADO** | — |
| Editar/remover no carrinho | **NÃO TESTADO** (sem itens) | — |
| Carrinho vazio | **PASS** — estado vazio correto, CTA presente | N4 |
| Abrir checkout | **PASS** — formulário renderiza | N4 |
| Botão finalizar com sacola vazia | **PASS** — desabilitado corretamente | N4 |
| Frete | **PASS na API real**, não pela interface | N3 |
| Pagamento | **NÃO EXECUTADO — decisão minha, ver abaixo** | — |
| Página de obrigado | **NÃO TESTADO** | — |
| Purchase | **NÃO DISPARADO — deliberadamente** | — |

### As três compras pedidas: NÃO EXECUTADAS

Compra 1 (1 unidade), Compra 2 (com desconto) e Compra 3 (multi-item) **não puderam ser feitas**. Não é limitação de ambiente: **não há produto ativo para comprar**. Executá-las exigiria eu ativar o produto e cadastrar preço — alteração de dados, proibida nesta auditoria.

### Por que parei antes do pagamento

`.env.local` tem `NEXT_PUBLIC_META_PIXEL_ID` e `META_CAPI_TOKEN` **preenchidos com credenciais reais**. Com `PAYMENT_PROVIDER=mock`, clicar em "Simular pagamento aprovado" marcaria o pedido como pago e **enviaria um Purchase verdadeiro para a conta de anúncios da Meta**, poluindo a otimização das campanhas com uma venda que não existiu.

Isso é exatamente o que a seção 10 da missão manda impedir. Não fiz. **Não simulei sucesso.**

**Veredito do E2E: NÃO COMPROVADO do produto ao Purchase.** O caminho do dinheiro tem evidência N1 (código lido, e é bom código) e N2 (44 testes passando), mas **nunca N4**.

---

## 4. P0 encontrados

### P0-1 — A home inteira aponta para uma página 404
- **Tipo:** BUG CONFIRMADO
- **Evidência:** `src/app/page.tsx:78`, `:83`, `:148` fixam `/produtos/micropele-008`. `curl` retorna **404**. O produto tem `status: 'draft'`, então a rota nem existe.
- **Reproduzir:** abrir `localhost:3001`, clicar em qualquer CTA.
- **Impacto:** zero vendas possíveis. Impede até uma demonstração.
- **Dificuldade:** trivial (ativar produto) — mas exige **preço definido pelo Francisco**.
- **Risco da correção:** baixo. Atenção: o slug está **fixo no código**, não vem do banco. Se a dona criar outro produto, os CTAs continuam apontando para este.

### P0-2 — `PAYMENT_PROVIDER` cai em `mock` silenciosamente
- **Tipo:** RISCO (não reproduzido em produção — não há produção)
- **Evidência:** `src/lib/payments/index.ts:15` → `process.env.PAYMENT_PROVIDER ?? "mock"`. `MockPaymentProvider.confirmPayment()` devolve `paid: true` **sempre** (`mock-provider.ts:55-66`).
- **Consequência em cadeia:** pedido criado → visitar `/pedido/[token]` chama `confirmarPagamento` (porta 2) → mock diz "pago" → status vira `paid` → `despacharPurchase` envia **Purchase real para Meta e GA4**.
- **Reproduzir:** subir na Vercel sem definir `PAYMENT_PROVIDER`. Toda compra sai de graça e vira conversão registrada.
- **Impacto:** produto entregue sem pagamento + envenenamento da conta de anúncios. É o pior desfecho possível dos dois lados.
- **Dificuldade:** trivial (definir a variável). **A dificuldade real é lembrar.**
- **Observação honesta:** o comentário no código defende o padrão `mock` ("um deploy sem a variável NÃO pode cair silenciosamente em cobrança real"). O raciocínio protege contra cobrar errado, mas **abre a porta oposta**: entregar de graça e mentir para a Meta. Para um e-commerce, falhar fechado (erro) é mais seguro que falhar em mock.

### P0-3 — Estado atual permite Purchase falso no ambiente de desenvolvimento
- **Tipo:** RISCO ATIVO HOJE
- **Evidência:** `.env.local` combina `PAYMENT_PROVIDER=mock` com Pixel e CAPI token reais.
- **Impacto:** qualquer pessoa (ou qualquer agente) que rodar o site local e clicar "Simular pagamento aprovado" injeta conversão falsa na conta real da Meta.
- **Resposta direta à pergunta da seção 10 — "Posso fazer o Meta registrar uma compra sem pagar?":** **SIM, na configuração de hoje.** Não porque o código esteja errado — ele está certo e recusa Purchase sem confirmação — mas porque o *confirmador* configurado é um mock que sempre diz sim.
- **Nota:** com `PAYMENT_PROVIDER=infinitepay`, a resposta vira **NÃO**. A arquitetura é sólida; a configuração é que não é.

### P0-4 — `SUPERFRETE_SANDBOX` está com um token no lugar de `"1"`
- **Tipo:** BUG CONFIRMADO
- **Evidência:** `.env.local` tem `SUPERFRETE_SANDBOX` com **155 caracteres** (mesmo tamanho do token). `superfrete-provider.ts:44` faz `=== "1"` → falso → `BASE = https://api.superfrete.com` (**produção**).
- **Confirmado por teste:** cotei de verdade contra a API de produção e recebi preços reais (PAC R$ 35,87 / SEDEX R$ 29,53 / Loggi R$ 26,06).
- **Impacto:** o ambiente de desenvolvimento fala com a **carteira real**. Cotar é grátis, mas `payLabel()` (`etiqueta.ts:318`) **debita dinheiro de verdade**. Um teste de etiqueta em dev gasta saldo real.
- **Dificuldade:** trivial. **Risco de não corrigir:** alto.

---

## 5. P1 encontrados

### P1-1 — Nenhum e-mail é enviado, para ninguém
- **Tipo:** LACUNA
- **Evidência:** busca por `resend|nodemailer|smtp|sendEmail|mailer` em `src/`, `scripts/` e `package.json` → **zero ocorrências**.
- **Impacto:** o comprador paga R$ 1.600 e não recebe nada por e-mail. A dona não é avisada de que vendeu — precisa abrir o painel por conta própria. Numa loja de baixo volume e ticket alto, é assim que se perde o prazo de envio.
- **Dificuldade:** média (escolher provedor, escrever os templates, tratar falha).

### P1-2 — Sem política de privacidade, termos ou consentimento de cookies
- **Tipo:** LACUNA (LGPD)
- **Evidência:** não existem rotas `/privacidade`, `/termos` ou banner de cookies. Enquanto isso o site coleta **nome, e-mail, telefone, CPF, endereço completo, IP e user-agent**, e envia versões com hash de e-mail, telefone, nome, **CPF** e CEP para a Meta (`meta-capi.ts:113-130`).
- **Impacto:** CPF é dado sensível; enviá-lo (mesmo com hash) a terceiro sem base legal declarada e sem aviso é exposição jurídica concreta. O Pixel carrega antes de qualquer consentimento.
- **Dificuldade:** baixa para as páginas, média para o consentimento.

### P1-3 — A cobertura de seguro é decidida por tabela fixa, e a transportadora discorda
- **Tipo:** RISCO
- **Evidência:** `superfrete-provider.ts:70-77` fixa teto de R$ 3.000 para PAC/SEDEX. Mas na cotação real que executei, a resposta da API trouxe `insurance_value: 15.74` para PAC e SEDEX, e `1600` só para a Loggi.
- **Impacto:** o código pode escolher PAC/SEDEX acreditando cobrir R$ 1.600 quando a transportadora aplicou R$ 15,74. Numa peça extraviada, a diferença sai da operação. Neste teste a Loggi era a mais barata e o desfecho foi correto **por sorte**, não por regra.
- **Dificuldade:** baixa (ler `insurance_value` da resposta em vez da tabela). **Precisa confirmação com a SuperFrete sobre a semântica do campo** antes de mexer.

### P1-4 — ViewContent e AddToCart existem, mas ninguém os chama
- **Tipo:** ILUSÃO DE PRONTIDÃO
- **Evidência:** `medirVerProduto` (`browser.ts:43`) e `medirAdicionarAoCarrinho` (`browser.ts:70`) estão escritos, completos e corretos. Busca em todo o `src/`: **nenhuma chamada**. Só `medirIniciarCheckout` e `medirCompra` são usados.
- **Impacto:** o funil tem buraco no meio. Sem AddToCart não há público de remarketing de carrinho — que costuma ser o público que mais converte.
- **Dificuldade:** baixa. **Não corrigido nesta auditoria.**

### P1-5 — SEO: títulos duplicados, sem sitemap, sem Open Graph
- **Tipo:** LACUNA
- **Evidência medida:** nove páginas públicas compartilham o **mesmo** `<title>` "Reverá" e a **mesma** description. `/sitemap.xml`, `/robots.txt`, `/favicon.ico` → **404**. Zero tags `og:` em qualquer página. Nenhum Product structured data.
- **Impacto:** o Google não distingue as páginas. Link compartilhado no WhatsApp aparece sem imagem e sem título.

### P1-6 — O número de WhatsApp pós-compra não aparece nunca
- **Tipo:** LACUNA (configuração)
- **Evidência:** `WHATSAPP_POST_PURCHASE_NUMBER` está **vazia** em `.env.local`. `SuportePosCompra.tsx:37` faz `if (!numero) return null`.
- **Nuance:** a regra da missão foi cumprida **exemplarmente**. Verifiquei: Server Component, variável sem `NEXT_PUBLIC_`, renderizada só com `pago === true`, e `npm run verify:secrets` confirma que o número não está no bundle. O código está certo — só não tem o número.

---

## 6. Auditoria comercial / CRO

Avaliei a home e as páginas institucionais. O design é **genuinamente bom**: preto e dourado, tipografia serifada (Fraunces) com corpo em Manrope, logo real da marca, sem cara de template.

**O que funciona:** identidade coerente e premium; proposta de valor clara na primeira dobra ("Prótese capilar com acabamento natural"); linguagem honesta, sem promessa exagerada; hierarquia limpa; a página `/cores` com fotos reais é um ativo forte.

**Onde o visitante trava:**

| Pensamento | Causa |
|---|---|
| **"não entendi"** | Não há preço em lugar nenhum do site |
| **"não confio"** | Zero reviews cadastradas (`reviews: 0 linhas`); `SocialProof` não renderiza |
| **"está caro"** | Sem preço, não há ancoragem nem parcelamento visível |
| **"depois eu vejo"** | Nenhuma urgência legítima, nenhuma captura de e-mail |
| **"não sei o que acontece depois"** | 8 das 15 perguntas da FAQ estão ocultas — incluindo **prazo de envio**, **durabilidade** e **envio para todo o Brasil**, que são as três maiores objeções |
| **e então** | clica em "Comprar agora" e cai num **404** |

O primeiro contato do visitante interessado com a loja é uma página de erro.

**Nota de conversão: 3/10.** Não é o design — é que o funil termina em 404, sem preço e sem prova social.

---

## 7. Produtos e descontos

### Estado real do catálogo (consultado no banco)

| Campo | Valor |
|---|---|
| Produtos | 1 |
| Status | **`draft`** |
| Variantes | 1, **`is_active: false`** |
| `price_cents` | **0** |
| `stock_qty` | 10 |
| SKU | `MICROPELE-008-PADRAO` |
| `product_media` | **0 registros** |
| `quantity_discount_rules` | **0 registros** |
| Reviews | **0** |
| Content blocks | **0** |
| FAQ visíveis | 7 de 15 |

**`price_cents = 0` é o achado mais delicado.** O seed foi desenhado para nascer `null` (o banco proíbe nulo, então a variante nasceria inativa). Algo gravou **zero**. Zero é um preço válido para o banco. A trava que impede vender de graça hoje é `is_active: false` — não o preço. Se alguém ativar a variante sem corrigir o preço, **a loja vende por R$ 0,00 e o sistema inteiro considera a transação legítima.** → **P0 latente.**

### Peso, dimensões, SKU

Peso e dimensões **não moram no produto** — são globais (`regras.ts:33`, 300 g / 30×20×5, ajustáveis por env). Funciona com um produto; com dois produtos de pesos diferentes, o frete fica errado para um deles. → **LACUNA, P2.**

### Divergência entre preço exibido e preço cobrado

**Não há divergência.** Verifiquei o caminho inteiro: `store.ts:254` recalcula do banco a cada leitura; `checkout/actions.ts:86` recalcula de novo no envio; o formulário **não tem campo de preço**; `/api/frete` aceita **só o CEP** e lê quantidade e valor do carrinho no servidor. **PASS (N1+N2).**

### Desconto por quantidade

| Teste | Resultado |
|---|---|
| 1, 2, 3, quantidades maiores | **NÃO TESTADO** — zero regras no banco |
| Alterar quantidade no carrinho | **NÃO TESTADO** |
| Voltar/avançar/refresh | **NÃO TESTADO** |
| Mobile | **NÃO TESTADO** |
| Quantidade 0 | **PASS** — `discount.ts:40` lança; `store.ts:85` rejeita |
| Negativa | **PASS** — mesma guarda |
| Decimal | **PASS** — `Number.isInteger` rejeita |
| Absurda | **PASS** — barrada pelo estoque (`store.ts:112`) |
| **Manipulação pelo navegador/API** | **PASS — testado de verdade** |

A regra pura tem **6 testes unitários passando** (N2): maior `min_qty` vence, regra inativa é ignorada, arredondamento sempre para baixo, regra malformada não derruba o checkout.

**Veredito:** a regra está **certa e provada em código**. A afirmação "quanto mais compra, mais desconto" é **NÃO COMPROVADA na loja**, porque nenhuma regra foi cadastrada.

---

## 8. Carrinho

**Lido integralmente (N1). Não exercitado com itens (sem produto).**

O desenho é sólido: token opaco UUID em cookie **httpOnly**, `secure` em produção, 90 dias; posse verificada na aplicação a cada operação (`cart_items` só é tocado com `.eq("cart_id", cartId)` do cookie de quem chama); preço **nunca** persistido no carrinho; variante removida do catálogo é descartada da leitura sem quebrar a página.

O uso de `createAdminClient()` (service role, ignora RLS) está **justificado e documentado**: RLS não enxerga cookie, e a alternativa (Anonymous Auth) seria mudança de arquitetura. A verificação de posse foi movida para a aplicação de forma consistente.

- **RISCO (P2):** carrinhos órfãos nunca são limpos. Sem TTL, `carts` cresce para sempre.
- **LACUNA (P2):** o carrinho não é reavaliado contra mudança de preço. Ver Cenário G.

---

## 9. Checkout

| Item | Estado | Evidência |
|---|---|---|
| Produto/quantidade/desconto corretos | Recalculado do banco | N1 |
| Subtotal / frete / total | `total = subtotal − desconto + frete` | N1 |
| Dados do comprador | zod: nome, e-mail, telefone, **CPF com dígito verificador** | N1+N2 |
| Endereço | CEP validado + autopreenchimento ViaCEP | N1 |
| Erros de formulário | Por campo, mensagem em português | N4 (parcial) |
| **Double click** | **RISCO — sem trava** | N1 |
| Refresh / voltar | Estado do form perde-se (só React state) | N1 |
| Sessão expirada | Não se aplica (checkout anônimo) | — |
| Pagamento recusado/aprovado | **NÃO TESTADO** | — |
| Celular | Formulário renderiza bem | N4 |

**BUG CONFIRMADO (P1) — duplo clique cria dois pedidos.** `CheckoutForm` tem `enviando` no estado, mas `criarPedidoAction` não tem chave de idempotência. Dois envios rápidos criam **dois `orders`, dois `customers`, dois `addresses`** e duas cotações de frete. Não cobra duas vezes (cada pedido tem sua cobrança), mas suja o painel e pode gerar duas etiquetas. O resto do sistema usa idempotência de banco exemplarmente — aqui ela falta.

**MELHORIA (P3):** `/checkout` renderiza o formulário inteiro com sacola vazia. O botão fica corretamente desabilitado, mas não há mensagem explicando por quê.

**O total cobrado corresponde ao total do servidor?** Sim, por construção — o valor mandado ao gateway (`checkout/pagamento/page.tsx:73`) vem de `orders.total_cents`, gravado pelo servidor.

**Nota:** `pagamento/page.tsx:88` registra que, quando existir desconto, as linhas somarão menos que o total na tela do gateway. Como hoje não há desconto cadastrado, o problema está latente. → **P2 latente.**

---

## 10. Pagamento

### Classificação: **MOCK**

| Item | Estado |
|---|---|
| Gateway realmente conectado | **Nenhum.** `PAYMENT_PROVIDER=mock` |
| Adapter InfinitePay | Escrito, endpoints da doc oficial, **nunca executado** |
| `INFINITEPAY_HANDLE` | Preenchida, **nunca validada** |
| Criação da cobrança | N1 |
| Confirmação | N1 — arquitetura de duas portas |
| Assinatura do webhook | **Não existe — e a decisão está certa** |
| Idempotência | **N1 forte** — unique `(provider, provider_event_id)` |
| Webhook duplicado | Tratado: 23505 → 200 |
| Timeout do gateway | Tratado: `indisponivel` → 400 → gateway reenvia |
| Valor divergente | Tratado: `confirmar.ts:101` recusa pagamento menor |
| Pagamento recusado | Tratado: grava `failed`, não muda status |

**O que mais me impressionou:** a documentação da InfinitePay foi lida de verdade (26/08) e descobriu-se que **o webhook deles não é assinado**. Em vez de fingir uma verificação, a confiança foi invertida: o webhook virou só um aviso ("olhe o pedido X") e quem responde é uma chamada de **saída** nossa (`payment_check`). Isso é mais seguro que HMAC e resolve o problema certo.

A trava contra corrida (`confirmar.ts:119-125`) — `update ... where status = 'new'` com verificação de linhas afetadas — é a forma correta. Duas portas simultâneas: só uma transiciona, só uma dispara Purchase.

**O que falta é inteiramente externo:** conta InfinitePay confirmada, `PAYMENT_PROVIDER=infinitepay`, e um pagamento de valor baixo de ponta a ponta.

→ **NÃO COMPROVADO — DEPENDÊNCIA EXTERNA.**

---

## 11. Pixel e analytics

### A regra crítica: Purchase não dispara por clique

**CUMPRIDA, por três camadas independentes** (N1):

1. Só `confirmarPagamento` chama `despacharPurchase`, e só **depois** da reconfirmação com o gateway.
2. `pixel_event_log` tem unique `(event_name, event_id)` com `event_id = orders.id` → o **banco** garante um Purchase por pedido, para sempre.
3. `consumirPurchaseParaNavegador` marca `sent_web` condicionalmente (`.eq("sent_web", false)`) → duas abas, um evento só.

| Cenário | Comportamento |
|---|---|
| Refresh da página de obrigado 10× | **1 Purchase.** A 2ª leitura não acha linha para marcar |
| Acesso direto à URL de obrigado | **Nenhum Purchase** se não estiver pago |
| Pagamento recusado | Status fica `new`, `despachar.ts:88` recusa |
| Deduplicação browser × CAPI | **Correta** — mesmo `event_id` nos dois caminhos |
| Valor e moeda | `total_cents` do banco, BRL, `item_price` convertido para reais |

### O funil, evento a evento

| Evento | Estado |
|---|---|
| **PageView** | **OK** — inclusive em troca de rota, com guarda anti-duplicação |
| **ViewContent** | **CÓDIGO MORTO — nunca chamado** |
| **AddToCart** | **CÓDIGO MORTO — nunca chamado** |
| **InitiateCheckout** | **OK** — trava `useRef`, só com itens |
| **Purchase** | **OK por desenho** — não comprovado na prática |

### Google: cego

`NEXT_PUBLIC_GOOGLE_TAG_ID`, `NEXT_PUBLIC_GA4_MEASUREMENT_ID` e `GA4_API_SECRET` estão **vazias**. Todo Purchase será registrado em `conversion_logs` com `motivo_pulado`, mas o Google **não mede nada**. É o mesmo padrão já documentado no site irmão.

### UTMs

**Bem resolvido** (N2, 9 testes): primeira origem da sessão vence a URL atual; `client_ip` e `user_agent` vêm dos **cabeçalhos**, nunca do corpo; `_ga` parseado corretamente sem confundir com `_ga_XXXX`; navegação privada não derruba nada.

**Podemos responder hoje?** Entraram: sim (parcial, só Meta). Viram produto: **não**. Adicionaram: **não**. Começaram checkout: sim. Compraram: sim (Meta). Receita/campanha/dispositivo: sim, na Meta. **No Google: nada.**

---

## 12. SuperFrete

### Classificação: **REAL, PARCIALMENTE VALIDADA (N3)**

Executei uma cotação verdadeira (São José dos Campos → São Paulo, 300 g, R$ 1.600 declarados):

```
PAC    R$ 35,87   5 dias
SEDEX  R$ 29,53   1 dia
LOGGI  R$ 26,06   1 dia
```

Token válido, User-Agent aceito, resposta correta. **A integração de cotação funciona.**

| Item | Estado |
|---|---|
| CEP válido / inválido | PASS (`400 CEP inválido` testado) |
| Peso / dimensões | Global, empilha por quantidade (N2, 4 testes) |
| Múltiplos produtos | Trata só quantidade, não produtos diferentes → **LACUNA** |
| Cálculo, prazo, transportadora | **PASS (N3)** |
| Erro / timeout | Não lança — venda acontece com frete 0, motivo gravado |
| Retry | **Não existe** → LACUNA |
| Etiqueta | **NÃO TESTADA — gasta dinheiro real** |

**A regra do seguro é o melhor pedaço deste módulo** (N2, 6 testes): escolhe a Loggi mais cara em vez da Jadlog mais barata porque a Jadlog deixaria R$ 100 da peça descobertos. Isso é decisão comercial correta gravada em teste.

**Ressalva séria:** ver P1-3 — a cobertura é decidida por tabela fixa, e a API respondeu `insurance_value: 15.74` para PAC/SEDEX.

**Também bem resolvido:** no despacho a escolha **não é livre** — compra-se o mesmo serviço que o cliente pagou (`escolherServico`), e diferença acima de R$ 5 **para e pede gente**. A ordem cria → grava → paga → completa impede a etiqueta paga que o banco não conhece.

### "A dona consegue imprimir a etiqueta e despachar sem ajuda técnica?"

**Provavelmente sim, e o caminho está construído** — mas **NÃO COMPROVADO**, e três coisas precisam ser verdade antes:

1. `SUPERFRETE_SANDBOX` corrigida (hoje aponta para produção — P0-4);
2. saldo na carteira SuperFrete (sem saldo, a etiqueta trava em `pending` — o código trata e avisa);
3. o botão nunca foi exercitado ponta a ponta.

---

## 13. Pedidos

Ciclo: `new → paid → preparing → label_ready → shipped → delivered`, com `canceled` e `warranty`.

**A máquina de estados é a parte mais bem defendida do sistema** (N2, 7 testes):

- **`paid` nunca é destino manual.** `validarTransicaoPedido` recusa antes de qualquer outra checagem, com mensagem explicando que só o webhook faz essa transição.
- Não se pula etapa. Não se cancela depois de enviado. `canceled` e `warranty` são terminais.
- Toda transição usa `.eq("status", statusAtual)` — duas abas não resolvem a mesma transição duas vezes.

**Existem estados impossíveis?** **Não, pelo caminho do admin.** "Pago sem pagamento confirmado" é impossível pela interface e recusado pelo banco para um visitante (testei — HTTP 401).

**A ressalva única, e ela é grande:** com `PAYMENT_PROVIDER=mock`, a confirmação "de verdade" é um mock que sempre diz sim. O estado é internamente consistente; ele só não corresponde a dinheiro. → ver P0-2.

---

## 14. Painel administrativo

Sete módulos: Painel, Pedidos, Produtos, Preços, Solicitações, Conteúdo, Configurações.

| Função | Classificação | Observação |
|---|---|---|
| Entrar | **REAL** | Supabase Auth, erro genérico (não vaza e-mail cadastrado) |
| Sair | **REAL** | Server Action, limpa cookie httpOnly |
| **Recuperar acesso** | **AUSENTE** | **Sem "esqueci minha senha". Senha perdida = desenvolvedor** |
| Criar produto | **REAL** | Formulário completo com variantes |
| Editar produto | **REAL** | |
| **Trocar foto** | **AUSENTE** | **Nenhum upload. `product_media` não é lida nem escrita em lugar nenhum do app** |
| Alterar preço | **REAL** | Por variante, em reais, convertido para centavos |
| Alterar desconto | **REAL** | Editor de faixas, % ou preço fixo |
| Regra de quantidade | **REAL** | Tela dedicada `/admin/precos` |
| Ver pedidos | **REAL** | Lista + detalhe + impressão |
| Ver cliente | **REAL** | |
| Ver pagamento | **REAL** | |
| Ver frete | **REAL** | |
| Acompanhar status | **REAL** | Com máquina de estados |
| Gerar etiqueta | **REAL, não comprovado** | Gasta dinheiro |
| **Configurações** | **PARCIAL** | **Editor de JSON cru — ver abaixo** |

### Duas ausências que doem

**Não há como trocar a foto de um produto.** A tabela `product_media` existe no schema, mas **nenhuma linha de código a lê ou escreve**. As imagens de hoje são arquivos estáticos em `public/media/`, commitados no Git. Trocar a foto de um produto = mexer no repositório e publicar. Numa loja de moda/estética, isso é rotina semanal.

**Configurações pede JSON escrito à mão.** A tela mostra "Chave" e "Valor (JSON)" com a dica *'texto simples vai entre aspas, ex.: "Reverá"'*. A dona precisa saber que `institutional_texts` recebe `{"sobre": "..."}`. Uma vírgula fora do lugar quebra o valor. Isso é ferramenta de desenvolvedor.

### Segurança do painel

**Boa, e verificada.** `getUser()` (revalida no servidor) em vez de `getSession()` (só lê cookie). Autenticar não basta — precisa de linha em `admin_users`. **Toda** Server Action usa `createClient()` (sessão, sob RLS), **nunca** service role — então mesmo que alguém descubra o endereço de uma action, o banco recusa. Confirmei com o teste da seção 15.

**LACUNA (P2):** não há `middleware.ts` de refresh de sessão. Sessão longa pode expirar e o admin cair no login sem aviso claro.

---

## 15. Segurança e LGPD

### As três perguntas do Francisco — testadas de verdade contra o banco real, com a chave anônima pública

Controle positivo primeiro: com a mesma chave, a leitura pública legítima (`faq_items`) **funcionou** — provando que a chave é válida e o teste é honesto.

| # | Pergunta | Resultado |
|---|---|---|
| 1 | **Um comprador consegue virar administrador?** | **NÃO.** `HTTP 401` — `new row violates row-level security policy for table "admin_users"`. E `admin_users` tem 1 registro que a chave anônima **não enxerga** |
| 2 | **Consegue mudar R$ 500 para R$ 5 pelo navegador?** | **NÃO.** `PATCH` em `product_variants` afetou **0 linhas**. E não há campo de preço no checkout: o preço é recalculado do banco duas vezes |
| 3 | **Consegue marcar pedido como pago sem pagar?** | **NÃO pelo banco.** `HTTP 401` ao tentar inserir `orders` com `status: paid`. **NÃO pelo admin** — `paid` não é transição manual. **SIM pelo mock**, que é P0-2 |

**Leitura de dados alheios:** `orders`, `customers`, `addresses`, `payments`, `cart_items`, `audit_logs`, `conversion_logs`, `pixel_event_log` — **todas devolveram vazio** para a chave anônima.

### Outros pontos verificados

| Item | Estado |
|---|---|
| RLS | **Ligada nas 26 tabelas.** Migrations aplicadas — confirmei `conversion_logs` (migration 7) existindo |
| Service role | Só em código servidor, com `import "server-only"` |
| Segredos no bundle | **PASS** — `npm run verify:secrets` roda e passa |
| `.env.local` | Corretamente no `.gitignore` |
| Webhook falso | **PASS testado** — segredo errado → `404` (não 403: quem varre não descobre que a rota existe) |
| Comparação do segredo | Tempo constante |
| SQL injection | Não se aplica — PostgREST parametrizado, zero SQL concatenado |
| XSS | Sem `dangerouslySetInnerHTML` |
| Exposição de erros | Boa — erro do gateway vai para log, mensagem genérica para o cliente |
| Enumeração de pedidos | **PASS** — acesso por `access_token` UUID aleatório |
| `order_number` | Não sequencial — não revela volume de vendas |

**RISCO (P2):** `/api/frete` é público e sem rate limit. Com um carrinho válido, é possível disparar chamadas à SuperFrete em volume e queimar a cota da conta.

**RISCO (P3):** o e-mail pessoal `franciscoemanuel20@gmail.com` está fixo no User-Agent (`superfrete-provider.ts:54`) e vai em toda requisição.

### LGPD

| Item | Estado |
|---|---|
| Dados coletados | nome, e-mail, telefone, **CPF**, endereço, IP, user-agent |
| **Política de privacidade** | **AUSENTE** |
| **Termos de uso** | **AUSENTE** |
| **Consentimento de cookies** | **AUSENTE** — o Pixel carrega antes de qualquer escolha |
| Retenção | **Nenhuma política.** Nada é apagado |
| Direito de exclusão | Não existe |
| **Dados de cartão** | **PASS — nenhum dado de cartão toca a aplicação.** Checkout hospedado no gateway. Isto está certo |
| Foto de cabelo (`/cores`) | **Bem tratado** — bucket privado, sem policy de leitura pública, URL assinada só para admin. O comentário da migration reconhece o dado como sensível |

---

## 16. Mobile (375×812, testado)

| Página | Resultado |
|---|---|
| Home | **PASS** — hero legível, menu hambúrguer |
| Carrinho | **PASS** — estado vazio limpo, CTA com bom alvo de toque |
| Checkout | **PASS** — campos largos, rótulos claros, `min-h-toque` aplicado |
| Institucionais | **PASS** |
| Produto | **404** |
| Admin | **NÃO TESTADO** (sem credenciais) |

Não encontrei texto cortado, overflow horizontal, CTA fora da tela nem botão escondido. O `min-h-toque` no design system garante alvo mínimo.

**Não pude testar:** teclado cobrindo o botão de envio, seletor de quantidade no toque, drawer do carrinho com itens, tela de Pix.

**Nota mobile: 7/10** — o que existe está bem feito; o caminho que mais importa não pôde ser testado.

---

## 17. Performance (MEDIDO)

Build de produção real:

| Métrica | Valor | Leitura |
|---|---|---|
| JS compartilhado | **103 kB** | Muito bom |
| Home | 112 kB | Bom |
| Carrinho | 116 kB | Bom |
| Checkout | 109 kB | Bom |
| `/admin/login` | 175 kB | Aceitável (só admin) |
| Build | Passa sem erro | |
| HTML de `/cores` | 6,8 kB | Enxuto |

**MEDIDO — peso das mídias no repositório:**

| Item | Peso |
|---|---|
| `public/media/cores` (8 fotos) | **9,9 MB** |
| Maior foto (`3.10.jpg`) | **1,6 MB** |
| `implantacao.mp4` | 1,4 MB |
| `logo-revera-original.jpeg` | **1,2 MB — aparentemente não usado, mas público** |

**Atenuante importante:** `/cores` usa `next/image`, que redimensiona e converte na entrega. Só dois `<img>` crus em todo o projeto. O peso é de origem, não de entrega.

**ESTIMADO (não medi Core Web Vitals):** LCP provavelmente bom em desktop; em 4G o hero com vídeo é o ponto de atenção. **CLS** merece verificação por causa do componente `Reveal` (animação de entrada por scroll). **Não medi Lighthouse** — sem produção para medir.

**Nota: 7/10.**

---

## 18. Testes automatizados — que risco financeiro cada um protege

**44 testes, 5 arquivos, todos passando** (`npm run test`, 309 ms).

| Arquivo | Testes | Risco financeiro que protege |
|---|---|---|
| `discount.test.ts` | 6 | **Cobrar o preço errado.** Garante que a regra de maior `min_qty` vence, que regra inativa não conta e que o arredondamento é sempre a favor do cliente |
| `frete.test.ts` | 16 | **R$ 1.600 extraviados sem cobertura.** O caso literal: escolher Loggi a R$ 22,80 em vez de Jadlog a R$ 19,43. Também: não comprar no despacho um serviço diferente do que o cliente pagou |
| `order-status.test.ts` | 7 | **Liberar produto sem pagamento.** O primeiro teste é "nunca autoriza mover para `paid`" |
| `cpf.test.ts` | 6 | **Etiqueta recusada por CPF inválido** — a transportadora exige CPF; um dígito errado trava o despacho depois de a venda estar feita |
| `rastreamento.test.ts` | 9 | **Venda invisível para a Meta.** `client_id` mal extraído quebra a jornada no GA4 |

### O que NÃO tem teste — e o risco de cada buraco

| Sem cobertura | Risco |
|---|---|
| **Webhook de pagamento** | O caminho mais crítico do sistema. Webhook repetido, corrida entre as duas portas, valor divergente — tudo verificado só por leitura de código |
| **Criação de pedido** | O duplo clique (P1) provavelmente teria aparecido |
| **Carrinho** | Posse, estoque, recálculo |
| **RLS** | Nenhum teste garante que uma policy não seja afrouxada por engano no futuro |
| **Purchase de ponta a ponta** | Nada impede uma regressão que dispare Purchase sem pagamento |
| **E2E** | `tests/e2e/` e `tests/integration/` contêm apenas `.gitkeep` |

Os testes que existem são **bem escolhidos** — cobrem exatamente as regras que decidem dinheiro, e vários têm no título o prejuízo que evitam. O buraco é que **as integrações não têm nenhum**.

---

## 19. Dependências externas (DEPENDE DE MIM)

| # | O que falta | Bloqueia |
|---|---|---|
| 1 | **Definir o preço da Micropele 0,08mm** | Tudo. Sem preço não há loja |
| 2 | Ativar o produto (`draft` → `active`) e a variante | A loja inteira |
| 3 | Cadastrar as faixas de desconto | A regra comercial principal |
| 4 | Confirmar conta InfinitePay e `PAYMENT_PROVIDER=infinitepay` | Receber dinheiro |
| 5 | Corrigir `SUPERFRETE_SANDBOX` | Não gastar saldo por engano |
| 6 | Saldo na carteira SuperFrete | Despachar |
| 7 | Preencher `WHATSAPP_POST_PURCHASE_NUMBER` | Suporte pós-compra |
| 8 | GA4/Google Tag | Medir no Google |
| 9 | Responder as 8 perguntas ocultas da FAQ | Objeções de compra |
| 10 | Fotos dos produtos + depoimentos reais | Confiança |
| 11 | Domínio e projeto Vercel | Existir na internet |
| 12 | Provedor de e-mail | Confirmação de compra |
| 13 | Endereço de origem e peso reais | Frete correto |

---

## 20. Matriz de produção

Nenhum deploy existe. Há repositório no GitHub (`franciscoemanuel20/revera`), local igual a `origin/main`, **sem `.vercel`**.

| Recurso | Código existe | Testado | Staging | Produção real |
|---|---|---|---|---|
| Site | Sim | Sim (local) | Não | **Não** |
| Banco | Sim | **Sim — migrations aplicadas** | **É o único que existe** | **Sim (de fato)** |
| Admin | Sim | Parcial | Não | Não |
| Produtos | Sim | **Sem produto vendável** | — | Não |
| Carrinho | Sim | Só código | Não | Não |
| Checkout | Sim | Parcial | Não | Não |
| Pagamento | Sim | **Mock** | Não | **Não** |
| Webhook | Sim | Guarda testada | Não | Não |
| SuperFrete | Sim | **Cotação real OK** | **Não — aponta para produção** | Parcial |
| Pedidos | Sim | Regras testadas | Não | Não |
| Etiqueta | Sim | **Não** | Não | Não |
| Pixel | Sim | Não | Não | **Credenciais reais em dev** |
| Analytics | Parcial | Não | Não | Não |
| E-mail | **Não** | — | — | — |
| Domínio | — | — | — | **Não existe** |

**Atenção:** só existe **um** banco Supabase, e ele é ao mesmo tempo desenvolvimento e produção. Não há staging. Todo teste local escreve no banco definitivo.

---

## 21. O que eu tenho — sem linguagem técnica

### JÁ TENHO

- Um site bonito, coerente e rápido, com a identidade da marca aplicada de verdade.
- Onze páginas no ar: home, cores com fotos reais, cuidados, garantia, FAQ, naturalidade, por que Reverá, sobre as próteses, para profissionais, carrinho e checkout.
- Um banco de dados montado e protegido. **Testei: um visitante não consegue mudar preço, nem virar administrador, nem se dar um pedido pago.**
- Um painel administrativo com sete telas, onde dá para cadastrar produto, mexer em preço e desconto, ver pedidos e acompanhar status.
- Cálculo de frete **funcionando de verdade** — cotei e vieram preços reais.
- Uma regra de segurança do frete que escolhe a transportadora que cobre os R$ 1.600 inteiros, mesmo custando mais caro.
- 44 verificações automáticas que rodam em menos de um segundo e protegem as regras que decidem dinheiro.

### TENHO PELA METADE

- **A loja.** Está construída, mas vazia: o único produto está oculto, sem preço, sem foto e sem desconto. Quem clica em "Comprar agora" cai numa página de erro.
- **O pagamento.** Todo o mecanismo existe e é bem-feito, mas está ligado num "faz de conta". Nenhum pagamento real jamais passou por ele.
- **A medição.** A Meta mede a compra; o Google não mede nada. E dois passos do meio do caminho ("viu o produto", "colocou na sacola") foram escritos mas nunca ligados.
- **O painel.** Ela cadastra e edita quase tudo — menos **fotos**. E a tela de Configurações pede que ela escreva código.
- **A etiqueta.** O caminho está pronto até o fim, mas nunca foi percorrido, porque percorrer custa dinheiro.

### NÃO TENHO AINDA

- **E-mail nenhum.** O cliente compra e não recebe confirmação. Você vende e não é avisado.
- **Site no ar.** Não existe endereço na internet — só na sua máquina.
- **Política de privacidade, termos e aviso de cookies** — enquanto o site já pede CPF.
- **Recuperação de senha do painel.** Se a senha se perder, precisa de mim.
- **Gestão de fotos de produto.**
- **Prova social.** Zero depoimentos cadastrados.
- **Preço em lugar nenhum do site.**

### DEPENDE DE MIM (Francisco)

O item 1 destrava metade da lista: **definir o preço**. Depois: ativar o produto, cadastrar as faixas de desconto, confirmar a InfinitePay, corrigir a variável da SuperFrete, colocar o número do WhatsApp, responder as 8 perguntas ocultas da FAQ, e decidir domínio e hospedagem.

---

## 22. Notas

| Área | Nota | Justificativa (obrigatória abaixo de 8) |
|---|---|---|
| Design | **8** | — |
| Confiança | **4** | Sem preço, sem depoimentos, sem política de privacidade, sem prova social. O CTA principal dá erro |
| Conversão | **3** | O funil termina em 404. Sem preço não há decisão possível |
| Mobile | **7** | O que existe está bem feito; o caminho de compra não pôde ser testado |
| Produto | **2** | Um produto, em draft, preço 0, variante inativa, zero fotos, zero descontos |
| Carrinho | **7** | Desenho sólido e bem justificado; nunca exercitado com itens; carrinhos órfãos não são limpos |
| Checkout | **7** | Validação e recálculo exemplares; **duplo clique cria pedido duplicado**; sem aviso de sacola vazia |
| Pagamento | **5** | Arquitetura excelente (nota 9 se fosse só desenho), realidade em mock. Nenhum real jamais processado |
| SuperFrete | **7** | Cotação real funciona; cobertura decidida por tabela fixa que a API contradiz; sandbox mal configurada; etiqueta nunca testada |
| Pedidos | **8** | — |
| Admin | **6** | Sete módulos reais e seguros, mas sem foto, sem recuperar senha, e Configurações exige JSON |
| **Autonomia da lojista** | **5** | Ver seção 7 abaixo |
| Pixel | **6** | Purchase impecável no desenho; dois eventos do funil são código morto; hoje é possível gerar Purchase falso via mock |
| Analytics | **4** | Google cego; metade do funil não instrumentada |
| SEO | **3** | Nove páginas com o mesmo título; sem sitemap, robots, favicon, Open Graph ou structured data |
| Performance | **7** | Bundles enxutos e build limpo; 9,9 MB de imagens de origem; Core Web Vitals não medidos |
| Segurança | **8** | — (os três ataques críticos foram bloqueados; desconta o `/api/frete` sem limite) |
| LGPD | **3** | Coleta CPF e envia hash à Meta sem política, sem termos e sem consentimento |
| Estabilidade | **6** | Testes bons nas regras puras; **zero** cobertura nas integrações; sem retry no frete |
| Escalabilidade | **6** | Idempotência de banco bem usada; sem rate limit; sem limpeza de carrinho; sem fila para reenvio de conversão |

### Autonomia da lojista: **45/100**

**Dívidas operacionais** — toda atividade recorrente que ainda exige desenvolvedor:

| # | Atividade | Por quê |
|---|---|---|
| 1 | **Trocar/adicionar foto de produto** | Não existe upload. Arquivo no Git + deploy |
| 2 | **Recuperar senha do painel** | Não há "esqueci minha senha" |
| 3 | **Mudar textos institucionais** | Configurações exige JSON escrito à mão |
| 4 | **Mudar o produto destacado na home** | Slug fixo no código (`page.tsx:78`) |
| 5 | **Publicar depoimento com foto** | Sem upload de imagem |
| 6 | **Trocar o número do WhatsApp** | Variável de ambiente → deploy |
| 7 | **Mudar peso/dimensão da embalagem** | Variável de ambiente → deploy |
| 8 | **Ver por que uma venda não chegou na Meta** | `conversion_logs` existe, mas não tem tela |
| 9 | **Reenviar conversão que falhou** | Não há botão |
| 10 | **Cancelar/estornar** | Marca `canceled` no painel; o estorno é no gateway |

**O que ela já faz sozinha:** cadastrar e editar produto, mexer em preço e desconto, ver e avançar pedidos, gerar etiqueta, responder solicitações de cor, editar FAQ e depoimentos (sem foto).

---

## 23. Percentual real concluído

Calculado por funcionalidade **ponderada por importância comercial**, não por linhas.

| Área | Peso | Concluído | Contribuição |
|---|---|---|---|
| Vitrine e páginas | 10% | 85% | 8,5 |
| **Catálogo com produto vendável** | 12% | **10%** | 1,2 |
| Carrinho | 8% | 75% | 6,0 |
| Checkout | 10% | 80% | 8,0 |
| **Pagamento real** | 15% | **35%** | 5,3 |
| Frete | 10% | 70% | 7,0 |
| Pedidos | 8% | 85% | 6,8 |
| Admin | 10% | 65% | 6,5 |
| Pixel e analytics | 8% | 55% | 4,4 |
| E-mail pós-compra | 5% | **0%** | 0,0 |
| SEO | 2% | 25% | 0,5 |
| LGPD | 2% | 20% | 0,4 |
| **Total** | **100%** | | **≈ 62%** |

**62% real concluído.**

O número esconde uma assimetria que importa mais que ele: **a parte difícil está feita.** A arquitetura de pagamento, a máquina de estados, o RLS, a regra de seguro do frete e a idempotência — o que costuma dar errado e custar caro — está construído e, onde consegui testar, funciona. O que falta é majoritariamente **cadastro, configuração e credencial**, mais dois módulos ausentes (e-mail e gestão de fotos).

---

## 24. Plano recomendado de correção

**Não executei nada disto.** Ordem sugerida por dependência e risco.

### Bloco 1 — Antes de mostrar o site para alguém (~1 dia)
1. Definir o preço da Micropele (**decisão do Francisco**).
2. Cadastrar preço, ativar variante e produto, cadastrar as faixas de desconto.
3. Corrigir `SUPERFRETE_SANDBOX` (P0-4).
4. Fazer o E2E das três compras que esta auditoria não pôde fazer.
5. Cadastrar as fotos do produto (hoje exige código — decidir se entra o upload agora).

### Bloco 2 — Antes de receber uma compra real (~2 a 3 dias)
6. Ligar a InfinitePay e definir `PAYMENT_PROVIDER=infinitepay` explicitamente em todo ambiente.
7. **Trocar o padrão `mock` por falha explícita** quando a variável não existir (P0-2).
8. Corrigir o duplo clique do checkout (chave de idempotência).
9. Fazer um pagamento real de valor baixo, ponta a ponta, e conferir Purchase, webhook e status.
10. Confirmar `insurance_value` com a SuperFrete e ajustar `coversInsurance` (P1-3).
11. Testar uma etiqueta real, com saldo, uma vez.

### Bloco 3 — Antes de gastar dinheiro em anúncio (~2 dias)
12. Ligar ViewContent e AddToCart (P1-4).
13. Configurar GA4 e Google Tag.
14. Publicar política de privacidade, termos e consentimento de cookies (P1-2).
15. SEO: títulos e descriptions por página, sitemap, robots, favicon, Open Graph, Product structured data.
16. Responder as 8 perguntas ocultas da FAQ e cadastrar depoimentos reais.

### Bloco 4 — Antes de escalar (~3 a 4 dias)
17. E-mail de confirmação para o comprador e notificação para a dona (P1-1).
18. Recuperação de senha do painel.
19. Gestão de fotos no admin.
20. Substituir o editor de JSON por campos de verdade.
21. Rate limit em `/api/frete`.
22. Testes de integração para webhook, criação de pedido e RLS.
23. Atualizar o `README.md`, que está 20 commits desatualizado.

---

## 25. Veredito

### SITE PARA APRESENTAR — **NO-GO**
As páginas institucionais são bonitas e defensáveis, mas o botão principal da home leva a um **404**. Qualquer pessoa a quem você mostrar vai clicar em "Comprar agora". Vira **GO COM RESSALVAS** assim que o produto for ativado com preço — trabalho de horas, não de dias.

### SITE PARA RECEBER UMA COMPRA REAL — **NO-GO**
Não há produto vendável e não há gateway conectado. O mecanismo existe e é bom; nunca processou um centavo.

### SITE PARA RODAR ANÚNCIOS COM DINHEIRO REAL — **NO-GO**
Três impedimentos independentes: não há o que comprar; o Purchase de hoje pode ser gerado sem pagamento (mock com Pixel real); e metade do funil não é medida. Anunciar assim é ensinar a Meta a otimizar por conversões falsas.

### SITE PARA 100 PEDIDOS/DIA — **NO-GO**
Não pela arquitetura, que aguenta (ver cenários A e B abaixo), mas pela operação: sem e-mail, a dona descobre cada venda abrindo o painel; sem gestão de foto e sem recuperação de senha, o desenvolvedor entra na rotina. **A 100 pedidos/dia, um produto sem preço vira 100 problemas por dia.**

### AUTONOMIA DA DONA — **45%**

### PROJETO REVERÁ — **62% REAL CONCLUÍDO**

---

## Apêndice A — Simulação do pior cenário

Baseado no código e nos testes, não em suposição.

**A) 100 compradores simultâneos.** Aguenta. Páginas estáticas ou server-rendered leves; leitura de carrinho é por sessão. **Ponto de atenção:** cada checkout dispara uma cotação SuperFrete — 100 checkouts = 100 chamadas, sem cache e sem rate limit. A cota da SuperFrete estoura antes da aplicação.

**B) 10 pagamentos aprovados quase ao mesmo tempo.** Seguro. Cada confirmação é independente e a transição usa `where status = 'new'`. Purchase protegido por unique `(event_name, event_id)`. **Sem risco de duplicidade.**

**C) O gateway manda o mesmo webhook 5 vezes.** Tratado corretamente. O primeiro insere em `payment_events`; os outros quatro batem no unique, viram código 23505 e respondem **200** para o gateway parar de reenviar. **Um Purchase só.**

**D) SuperFrete fora do ar.** A venda **acontece mesmo assim**, com frete 0 e o motivo gravado em `shipping_quotes`. Decisão deliberada e correta (perder R$ 1.600 por causa de uma API que piscou seria pior). **Consequência a aceitar:** a operação absorve ~R$ 25 naquele pedido. Não há retry nem alerta — alguém precisa olhar `shipping_quotes`, e **não existe tela para isso**.

**E) Cliente atualiza a página de obrigado 10 vezes.** **Um Purchase.** A primeira leitura marca `sent_web = true`; as outras nove não acham linha para atualizar e recebem `null`. Testável por leitura, não reproduzido.

**F) Alguém tenta alterar o preço no navegador.** **Impossível, e testei.** Não há campo de preço no formulário; o carrinho recalcula do banco; o checkout recalcula de novo; e a chave anônima é recusada pelo RLS (0 linhas afetadas).

**G) A dona muda um preço com checkout em andamento.** **O cliente paga o preço NOVO, sem aviso.** `lerCarrinhoCompleto()` relê do banco no instante do envio. Não é falha de segurança — é falha de expectativa: a pessoa viu R$ 1.600 na tela e o pedido nasce com outro valor, sem nada explicando. **LACUNA (P2):** falta congelar o preço na entrada do checkout ou avisar quando ele mudar.

---

## Apêndice B — Ilusão de prontidão

Coisas que parecem prontas e não estão:

| Item | Realidade |
|---|---|
| `medirVerProduto` / `medirAdicionarAoCarrinho` | Escritas, corretas, **nunca chamadas** |
| Tabela `product_media` | Existe no banco; **nenhuma linha de código a usa** |
| `MockPaymentProvider` | Parece "modo de teste"; é o **padrão silencioso** |
| `SUPERFRETE_SANDBOX` | Sugere sandbox; **aponta para produção** |
| `README.md` | Descreve um projeto de 20 commits atrás |
| `tests/e2e/`, `tests/integration/` | Só `.gitkeep` |
| FAQ com 15 perguntas | **8 ocultas** — incluindo prazo de envio e durabilidade |
| `analytics_events` | Tabela criada, **sem nenhum uso** |
| `SocialProof`, `ReviewCard` | Componentes prontos, **zero dados** |
| Seed com `price_cents: null` | O banco tem **0** — que é preço válido |

**Do lado positivo, e vale registrar:** procurei `TODO`, `FIXME`, `HACK`, chave hardcoded, botão sem ação e `href="#"` no projeto inteiro. **Não há nenhum.** As únicas ocorrências de "TODO" são conteúdo de FAQ marcado deliberadamente como invisível. Para um projeto deste tamanho e velocidade, é incomum.

---

*Auditoria conduzida em 26/08/2026. Nenhum arquivo de código, configuração, banco ou ambiente foi alterado. Nenhum pagamento foi executado. Nenhum evento de conversão foi disparado.*
