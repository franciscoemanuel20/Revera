# Auditoria recuperacao de pagamento Revera - 2026-09-24

Responsavel: Codex  
Escopo: falha de pagamento, tentativa alternativa, checkout nacional/internacional, Stripe/Apple Pay/carteiras, gateway nacional, webhooks, Purchase/Pixel e risco de cobranca duplicada.

## Conclusao executiva

A Revera ja tem uma base forte de seguranca financeira: existe no maximo uma cobranca pendente por pedido, o pagamento so vira `paid` depois de reconfirmacao ativa no gateway, e o `Purchase` so nasce depois dessa confirmacao.

Nota atual da recuperacao de pagamento: **8,4/10**.

O que falta para 10/10 nao e "colocar muitos botoes de pagamento" no inicio. O que falta e uma esteira clara quando o pagamento falha, expira ou fica travado:

1. separar motivo da falha;
2. manter o pedido reservado;
3. oferecer o proximo caminho certo;
4. permitir nova tentativa sem duplicar link;
5. medir e recuperar abandono sem disparar `Purchase` indevido.

## Estado atual

### O que ja esta bom

1. **Um pedido nao pode ter duas cobrancas pendentes**
   - Arquivo: `supabase/migrations/00000000000013_pagamento_sem_corrida.sql`
   - Indice parcial `payments_uma_pendente_por_pedido`.
   - Isso impede dois links vivos para o mesmo pedido quando duas abas ou dois cliques concorrem.

2. **A pagina de pagamento reaproveita link existente**
   - Arquivo: `src/app/checkout/pagamento/page.tsx`
   - Se existe `payments.pending` com `checkout_url`, redireciona para o mesmo link.
   - Se existe recuperacao em `payment_events`, restaura antes de criar qualquer cobranca nova.

3. **Falha ambigua preserva a reserva**
   - Arquivos:
     - `src/lib/payments/provider.ts`
     - `src/app/checkout/pagamento/page.tsx`
   - `AmbiguousChargeError` impede a criacao de um segundo link quando nao sabemos se o gateway criou o primeiro.

4. **Checkout expirado pode liberar a reserva**
   - Arquivo: `src/app/api/webhooks/pagamento/[segredo]/route.ts`
   - Quando o gateway confirma `checkout_expirado`, a reserva pendente vira `failed`.
   - Isso permite nova tentativa sem apagar uma cobranca ainda aberta.

5. **Purchase esta protegido**
   - Arquivo: `src/lib/payments/confirmar.ts`
   - `Purchase` so acontece depois de:
     - webhook/retorno chamar `confirmarPagamento()`;
     - provider confirmar pagamento;
     - moeda e valor baterem;
     - pedido transicionar de `pending` para `paid`.

6. **Pedido aguardando pagamento ja tem suporte**
   - Arquivo: `src/app/pedido/[token]/SuportePosCompra.tsx`
   - A pagina do pedido ja mostra WhatsApp tambem no estado `aguardando`, atras do `access_token`.
   - Isso e bom para cliente que saiu do gateway e caiu no acompanhamento.

## Achados

### P1 - A tela de falha ainda e generica demais

Arquivo:

- `src/app/checkout/pagamento/page.tsx`

Hoje `telaDePagamentoIndisponivel()` cobre varios casos diferentes com a mesma estrutura:

- provider nao configurado;
- gateway indisponivel;
- reserva pendente sem URL;
- criacao ambigua;
- link nao permitido;
- internacional fechado;
- pagamento ainda preparando.

Impacto:

- cliente nao sabe se deve tentar de novo, trocar cartao, aguardar ou falar com suporte;
- suporte nao sabe rapidamente se e falha tecnica, cartao recusado ou checkout expirado;
- o caminho de recuperacao fica menos forte do que poderia.

Recomendacao:

- criar uma taxonomia de estado:
  - `erro_tecnico`;
  - `em_preparacao`;
  - `cartao_recusado`;
  - `checkout_expirado`;
  - `metodo_indisponivel`;
  - `internacional_indisponivel`;
  - `reserva_travada`.

### P1 - Trocar metodo ainda nao esta desenhado

Arquivos:

- `src/app/checkout/schema.ts`
- `src/app/checkout/actions.ts`
- `src/app/checkout/pagamento/page.tsx`
- `supabase/migrations/00000000000026_apple_pay_nacional.sql`

Hoje o pedido aceita:

- `default`;
- `apple_pay`.

O provider e decidido quando a pagina de pagamento abre. Para outro metodo entrar com seguranca, a escolha precisa estar no pedido ou numa transicao controlada de pagamento.

Risco se fizer direto:

- criar dois links vivos;
- mudar provider depois de ja existir uma reserva;
- perder conciliacao;
- o webhook confirmar um provider enquanto a tela mostra outro.

Recomendacao:

- fase 1: nao trocar metodo depois que existe `payments.pending` com URL;
- fase 2: permitir troca so quando a reserva antiga estiver `failed`, `expired` ou liberada de forma segura.

### P1 - Internacional precisa de Stripe como recuperador principal

Arquivos:

- `src/lib/payments/revera.ts`
- `src/lib/payments/stripe-provider.ts`
- `src/app/checkout/pagamento/page.tsx`

Pix nao serve para cliente internacional. Para fora do Brasil, a recuperacao forte e:

- outro cartao;
- Apple Pay;
- Google Pay;
- carteiras exibidas pela Stripe Checkout;
- Link/Checkout quando disponivel na conta Stripe.

Recomendacao:

- manter Stripe como caminho principal internacional;
- tratar Apple Pay/Google Pay como carteira digital da Stripe, nao como metodo isolado garantido;
- copy honesta: "cartao e carteiras digitais disponiveis no seu dispositivo".

### P1 - O melhor proximo passo nao e gateway reserva automatico

Gateway reserva ajuda quando o gateway principal esta instavel. Mas se o banco emissor recusou o cartao, trocar gateway pode nao resolver e ainda aumenta risco operacional.

Para a Revera, o maior ganho com menor risco e:

1. tela de recuperacao;
2. expirar/liberar com seguranca;
3. oferecer novo cartao/carteira;
4. recuperar por e-mail/WhatsApp no mesmo pedido.

Gateway reserva fica para depois, quando a esteira acima estiver medida.

### P2 - Faltam dados operacionais para decidir prioridade

Hoje a operacao nao tem uma tela simples dizendo:

- quantos pagamentos falharam por provider;
- quantos expiraram;
- quantos ficaram pendentes sem URL;
- quantos viraram pagos depois de uma nova tentativa;
- quantos foram recuperados por WhatsApp/e-mail.

Recomendacao:

- criar painel admin de diagnostico de pagamento;
- usar `payments`, `payment_events`, `orders` e `conversion_logs`.

## Plano para chegar em 10/10

### Fase 1 - Recuperacao na tela de pagamento

Objetivo: quando nao abrir pagamento, a tela orientar corretamente.

Implementar:

- titulo por motivo;
- texto por motivo;
- botao principal `Tentar novamente`;
- botao secundario `Ver meu pedido`;
- quando aplicavel, `Falar com a equipe`;
- preservar a regra de nao criar segunda cobranca se existe reserva pendente.

Exemplos:

- erro tecnico: "Nao conseguimos abrir o pagamento agora. Tente novamente."
- em preparacao: "Estamos preparando seu pagamento. Para sua seguranca, nao criamos outra cobranca."
- estagnado: "Isto demorou mais que o esperado. Fale com a equipe com o numero do pedido."
- checkout expirado: "Este link expirou. Voce pode gerar uma nova tentativa."

Nota esperada: **9,0/10**.

### Fase 2 - Recuperacao do mesmo pedido por WhatsApp/e-mail

Objetivo: cliente que saiu do checkout volta para o mesmo pedido.

Implementar:

- mensagem de recuperacao com `access_token`, nao com pedido novo;
- texto diferente para Brasil e internacional;
- nunca disparar `Purchase`;
- nao mandar recuperacao se pedido ja esta pago, cancelado ou estornado;
- respeitar janela de envio e deduplicacao por telefone/e-mail.

Nota esperada: **9,3/10**.

### Fase 3 - Metodo alternativo seguro

Objetivo: permitir alternativa sem dois links vivos.

Implementar:

- adicionar nova preferencia somente se provider escolhido estiver claro;
- criar estado/acao de troca controlada;
- permitir troca quando:
  - nao existe `payments.pending`; ou
  - a reserva esta `failed`; ou
  - o gateway confirmou expirada; ou
  - admin liberou a reserva travada;
- bloquear troca quando existe URL pendente ativa.

Para Brasil:

- manter `default` nacional;
- manter `apple_pay`/Stripe como opcao de carteira/cartao quando ativa;
- Pix segue pelo gateway nacional.

Para internacional:

- Stripe como principal;
- carteiras digitais pelo Stripe Checkout;
- sem Pix.

Nota esperada: **9,6/10**.

### Fase 4 - Diagnostico admin de pagamento

Objetivo: operacao saber o que falhou sem abrir banco/logs.

Tela sugerida: `/admin/diagnostico-checkout`.

Blocos:

- provider nacional ativo;
- Stripe/Apple Pay disponivel;
- webhook configurado;
- ultimos pagamentos `failed`;
- reservas `pending` sem URL;
- checkouts expirados;
- ultimos `AmbiguousChargeError`;
- pedidos aguardando pagamento ha mais de X minutos;
- botoes seguros:
  - ver pedido;
  - liberar reserva travada quando permitido;
  - copiar link do pedido;
  - chamar cliente.

Nota esperada: **9,8/10**.

### Fase 5 - Smoke test real por metodo

Objetivo: provar producao sem contaminar campanha.

Checklist:

- nacional Pix;
- nacional cartao;
- Apple Pay/carteira quando dispositivo permitir;
- internacional cartao Stripe;
- checkout expirado;
- erro tecnico controlado;
- webhook;
- retorno do cliente;
- `Purchase` apenas depois de pago;
- reembolso.

Nota esperada: **10/10**.

## O que eu implementaria primeiro

Primeiro bloco recomendado:

1. transformar `telaDePagamentoIndisponivel()` em uma tela de recuperacao por motivo;
2. adicionar link `Ver meu pedido`;
3. manter `Tentar novamente`;
4. mostrar WhatsApp somente quando a tentativa estiver estagnada ou o pedido ja estiver no link de pedido/aguardando;
5. nao criar metodo novo ainda.

Por que:

- melhora conversao agora;
- nao mexe em webhook;
- nao cria provider novo;
- nao aumenta risco de cobranca duplicada;
- prepara a base para metodo alternativo depois.

## Criterios de aceite

1. Nenhum fluxo cria duas linhas `payments.pending` para o mesmo pedido.
2. Se existe `checkout_url` pendente, a tela reaproveita o mesmo link.
3. Se o gateway confirmar checkout expirado, a reserva vira `failed`.
4. Uma nova tentativa so nasce depois da reserva antiga estar encerrada ou liberada.
5. Cliente internacional nunca ve Pix como solucao principal.
6. Cliente nacional pode ter Pix/cartao no provider nacional e carteira digital via Stripe se ativa.
7. `Purchase` continua nascendo somente em `confirmarPagamento()`.
8. Retorno do cliente e webhook continuam sendo as duas portas de confirmacao.
9. Pedido estornado nunca reabre cobranca.
10. Admin consegue diagnosticar pedido travado sem olhar banco.

## Decisoes pendentes

1. Qual sera o terceiro metodo/provedor, se houver:
   - Stripe como alternativa nacional de cartao/carteiras;
   - Asaas;
   - InfinitePay;
   - outro provedor.

2. Qual regra comercial de reserva:
   - por quanto tempo o pedido fica reservado;
   - quando abordar por WhatsApp;
   - quando cancelar por falta de pagamento.

3. Internacional:
   - quais paises ficam abertos;
   - quais moedas;
   - quando permitir cotacao manual de frete antes do pagamento.

## Veredito

A arquitetura atual aguenta uma recuperacao profissional, mas a proxima entrega deve ser a tela de recuperacao de pagamento, nao um gateway reserva automatico.

Veredito: **aprovar implementacao da Fase 1**.

Nao implementar ainda:

- troca automatica de gateway;
- cobranca estimada;
- dois links simultaneos;
- Pix para internacional;
- `Purchase` fora de `confirmarPagamento()`.
