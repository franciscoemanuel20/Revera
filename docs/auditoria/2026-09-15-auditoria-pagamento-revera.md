# Auditoria de pagamento Revera - 2026-09-15

Responsavel: Codex  
Escopo: checkout nacional/internacional, frete, criacao de cobranca, webhooks, confirmacao, Purchase e recuperacao de falhas.

## Conclusao executiva

A Revera deve ser tratada como checkout proprio de produto fisico. Ela nao deve receber uma "rota paralela" de pagamento como gambiarra; o caminho certo e manter `/checkout` e fortalecer as regras especificas de Revera: carrinho com variante/cor, frete obrigatorio, pedido interno antes da cobranca, webhook reconfirmado no provedor e bloqueio contra cobranca duplicada.

O desenho central esta correto:

- pedido nasce antes da cobranca;
- preco e frete sao recalculados no servidor;
- retorno do navegador nao confirma dinheiro;
- webhook apenas da pista;
- `confirmarPagamento()` consulta o provedor e confere moeda/valor;
- Purchase Meta/GA so nasce depois de pagamento confirmado;
- existe trava contra duplo clique e concorrencia em `payments`;
- reserva ambigua nao e apagada automaticamente, para evitar segundo link de pagamento.

## Achado P0 corrigido nesta auditoria

### Apple Pay nacional/Stripe podia falhar quando o pedido tinha desconto

Risco: pedido BRL escolhendo "Apple Pay ou cartao pela Stripe" podia chegar na Stripe com linhas somando produto cheio + frete, enquanto `orders.total_cents` ja tinha desconto. O adapter da Stripe recusa quando as linhas nao somam exatamente o total. Em compra com desconto por quantidade, isso poderia impedir o pagamento de abrir.

Correcao aplicada:

- criada regra central em `src/lib/payments/itens.ts`;
- `src/app/checkout/pagamento/page.tsx` agora monta linhas de pagamento ja rateando desconto;
- o frete continua como linha separada;
- nenhum item pode ficar com preco zero;
- se o desconto for maior que os produtos, o pagamento falha fechado antes de falar com gateway.

Teste criado:

- `tests/unit/pagamento-itens-desconto.test.ts`

## Achado P0 ja corrigido antes desta auditoria e confirmado

### Checkout travava no calculo de frete

Sintoma observado: comprador com produto no carrinho e CEP preenchido ficava preso em "Calculando frete...", entao o botao nunca liberava.

Correcao aplicada:

- timeout no cliente para `/api/frete`;
- timeout no provider SuperFrete;
- botao mostra "Sua sacola esta vazia" quando o cliente entra direto em `/checkout` sem produto.

Impacto: reduz abandono por tela travada e deixa claro quando o problema e sacola/frete, nao gateway.

## Matriz de risco atual

| Area | Nota | Estado |
| --- | ---: | --- |
| Pedido antes da cobranca | 10 | Correto |
| Recalculo de preco no servidor | 10 | Correto |
| Frete obrigatorio antes de vender | 9 | Correto, com timeout; falta monitor real |
| Asaas nacional | 8 | Adapter e webhook existem; precisa prova real por metodo |
| Stripe internacional | 9 | Forte; precisa prova live por mercado |
| Apple Pay nacional pela Stripe | 8 | Fluxo existe e desconto corrigido; precisa validacao em dispositivo compativel |
| Webhook nacional | 9 | Roteia Asaas/InfinitePay e reconfirma |
| Webhook Stripe | 10 | Assinatura, replay e reconfirmacao cobertos |
| Idempotencia/cobranca duplicada | 9 | Reserva unica por pedido; depende de migration aplicada |
| Purchase/rastreamento | 9 | So depois de pagamento confirmado |
| Diagnostico operacional | 6 | Ainda falta painel/checklist vivo por provedor |

Nota geral tecnica do pagamento Revera apos esta auditoria: 8,7/10.

## O que precisa para chegar em 10/10

1. Criar um painel de diagnostico de checkout da Revera:
   - provider ativo;
   - chaves configuradas sem expor segredo;
   - webhook configurado;
   - ultimo teste Pix/cartao/boleto/Apple Pay/Stripe;
   - ultima falha de frete;
   - pedidos pendentes sem URL de pagamento.

2. Rodar teste real controlado por metodo:
   - Pix Asaas;
   - cartao Asaas;
   - boleto Asaas somente se endpoint provar suporte real;
   - Apple Pay via Stripe em dispositivo compativel;
   - cartao internacional Stripe.

3. Conferir no banco de producao se as migrations criticas estao aplicadas:
   - `payments_uma_pendente_por_pedido`;
   - `liberar_reserva_travada`;
   - `gravar_recuperacao_link`;
   - `orders.payment_preference`.

4. Criar smoke operacional de checkout:
   - adiciona produto;
   - escolhe cor;
   - calcula frete;
   - cria pedido;
   - abre checkout hospedado;
   - valida se a URL e do provedor esperado.

5. Separar deploy controlado:
   - o workspace esta com muitas mudancas locais acumuladas;
   - publicar tudo junto pode levar alteracoes nao relacionadas;
   - o patch de pagamento/frete deve ser isolado ou publicado dentro de um pacote aprovado da Revera.

## Validacoes executadas

- `npm test -- --run tests/unit/pagamento-itens-desconto.test.ts`: 3 testes passaram.
- `npm test -- --run`: 44 arquivos, 609 testes passaram.
- `npm run typecheck`: passou.
- `npm run build`: passou.

## Decisao

Nao criar uma rota unica paralela apenas para Revera como atalho. Criar sim uma camada operacional especifica da Revera: diagnostico, smoke, matriz de meios de pagamento e regras de produto fisico. A rota principal continua `/checkout`; o pagamento precisa ficar impossivel de duplicar, impossivel de aprovar sem dinheiro e impossivel de travar sem mensagem clara.

## Blindagem aplicada - isolamento temporario da Revera

Foi criada uma camada propria em `src/lib/payments/revera.ts`.

Regra:

- `REVERA_PAYMENT_PROVIDER` ganha de `PAYMENT_PROVIDER` no checkout da Revera;
- valores nacionais aceitos: `asaas`, `infinitepay`, `mock`;
- `mock` continua bloqueado fora de desenvolvimento/staging;
- Stripe continua sendo usada para internacional e para Apple Pay nacional quando o pedido escolher essa preferencia;
- `REVERA_APPLE_PAY_ENABLED=0` desliga Apple Pay nacional sem mexer no resto do checkout.

Pontos agora isolados pela camada Revera:

- renderizacao da opcao Apple Pay no checkout;
- gravacao da preferencia de pagamento do pedido;
- criacao da cobranca em `/checkout/pagamento`;
- confirmacao de pagamento;
- webhook nacional;
- prontidao do checkout internacional;
- painel admin internacional.

Decisao operacional: enquanto a Revera estiver instavel, configurar `REVERA_PAYMENT_PROVIDER=asaas` ou `REVERA_PAYMENT_PROVIDER=infinitepay` explicitamente em producao. Nao depender de `PAYMENT_PROVIDER` compartilhado para decidir a venda da Revera.
