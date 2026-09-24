# Auditoria checkout, pagamento e frete Revera - 2026-09-24

Responsavel: Codex  
Escopo: checkout nacional, Apple Pay, terceiro metodo de pagamento, frete nacional/internacional, Purchase/Pixel e plano para melhorar sem quebrar vendas.

## Conclusao executiva

O checkout da Revera esta desenhado de forma segura para venda real: preco, desconto e frete sao recalculados no servidor; o pedido nasce antes da cobranca; o pagamento fica protegido contra duplo link; e o evento `Purchase` so nasce depois de confirmacao confiavel do gateway.

Nota atual do checkout: **8,7/10**.

O ponto mais forte e a seguranca. O ponto que mais segura a nota e operacional: quando frete ou gateway falham, ainda falta uma experiencia melhor para salvar a venda sem improvisar cobranca, e falta uma tela de diagnostico para saber rapidamente o que esta pronto ou quebrado.

## Resposta direta

Sim, conseguimos incluir um terceiro metodo de pagamento sem atrapalhar os que ja existem, desde que ele entre como uma opcao controlada e nao substitua o provider principal.

O caminho seguro e:

1. manter o metodo atual como `default`;
2. manter Apple Pay como preferencia separada;
3. adicionar o terceiro metodo atras de feature flag;
4. gravar a escolha no pedido;
5. criar a cobranca usando a mesma trava de pagamento pendente por pedido;
6. nunca abrir dois links vivos para o mesmo pedido sem uma regra explicita de troca.

## O que ja esta profissional

### 1. Preco e desconto nao dependem do navegador

Arquivos:

- `src/app/checkout/actions.ts`
- `src/lib/cart/store.ts`

O checkout recebe os dados do cliente, mas recalcula o carrinho no servidor antes de criar o pedido. Isso protege contra manipulacao de preco, desconto por quantidade e total.

### 2. Frete nacional e recalculado no servidor

Arquivos:

- `src/app/checkout/CheckoutForm.tsx`
- `src/app/checkout/actions.ts`
- `src/lib/shipping/cotar.ts`

A cotacao exibida no formulario ajuda o cliente, mas nao decide a venda. O servidor chama `cotarFrete()` novamente antes de criar o pedido.

### 3. Se o frete falhar, a venda nao cobra errado

Arquivo:

- `src/app/checkout/actions.ts`

Quando nao existe cotacao escolhida, o checkout responde erro e nao cria uma cobranca. Isso e bom para seguranca: evita cobrar produto sem frete ou gerar promessa de envio sem custo definido.

Fragilidade comercial: a mensagem ainda poderia conduzir melhor para WhatsApp/equipe.

### 4. Pagamento tem trava contra duplicidade

Arquivo:

- `src/app/checkout/pagamento/page.tsx`

Antes de chamar o gateway, o sistema cria uma reserva de pagamento pendente. Se outro clique/tela tentar criar o mesmo pagamento ao mesmo tempo, a segunda execucao espera o link vencedor ou mostra tela segura. Isso reduz muito o risco de dois links para o mesmo pedido.

### 5. Falha ambigua nao reabre pagamento automaticamente

Arquivos:

- `src/lib/payments/provider.ts`
- `src/lib/payments/infinitepay-provider.ts`
- `src/lib/payments/stripe-provider.ts`
- `src/lib/payments/asaas-provider.ts`

Quando o gateway pode ter recebido a chamada, mas a rede caiu antes da resposta, os adapters usam `AmbiguousChargeError`. O sistema preserva a reserva em vez de tentar cobrar de novo no escuro.

### 6. Apple Pay ja tem um desenho seguro

Arquivos:

- `src/app/checkout/schema.ts`
- `src/lib/payments/revera.ts`
- `src/lib/payments/stripe-provider.ts`

Hoje a preferencia aceita `default` ou `apple_pay`. Quando Apple Pay esta disponivel, o pedido grava essa preferencia e a tela de pagamento usa Stripe para abrir o checkout compativel com carteiras digitais.

Observacao importante: tecnicamente a Stripe Checkout pode mostrar Apple Pay, Google Pay ou cartao conforme dispositivo, navegador e configuracao da conta. Portanto, o texto da tela precisa ser honesto: "Apple Pay ou cartao compativel", se for o caso.

### 7. Pixel/Purchase esta bem protegido

Arquivos:

- `src/lib/payments/confirmar.ts`
- `src/lib/tracking/despachar.ts`
- `src/lib/tracking/purchase.ts`

O `Purchase` nasce somente quando o pagamento e confirmado. Isso protege campanhas de Meta/GA contra compra falsa por refresh, simulacao, erro de checkout ou pedido ainda pendente.

## Fragilidades que seguram a nota

### P1 - Terceiro metodo ainda nao existe no contrato do checkout

Arquivo:

- `src/app/checkout/schema.ts`

Hoje `paymentPreference` so aceita:

- `default`
- `apple_pay`

Para adicionar um terceiro metodo, precisa ampliar esse contrato e a logica da pagina de pagamento.

Risco se fizer errado: quebrar pedido existente ou mandar o cliente para o provider errado.

Recomendacao:

- criar um valor explicito, por exemplo `third_method` ou o nome real do provedor;
- exibir somente quando o provider estiver configurado;
- gravar a escolha no pedido;
- manter `default` como fallback.

### P1 - A trava de um pagamento pendente por pedido precisa ser respeitada

Arquivo:

- `src/app/checkout/pagamento/page.tsx`

A trava atual e uma qualidade, nao um problema. Mas ela exige cuidado ao criar varios metodos.

Exemplo de risco:

1. cliente abre Pix;
2. volta e escolhe cartao;
3. sistema cria outro link sem cancelar/encerrar o primeiro;
4. cliente pode pagar duas vezes ou o time se perde na conciliacao.

Recomendacao:

- fase inicial: o cliente escolhe o metodo antes de criar o pedido/link;
- se quiser permitir troca de metodo depois, criar uma regra explicita:
  - so trocar se pagamento antigo ainda nao foi pago;
  - registrar evento de troca;
  - invalidar ou abandonar o link antigo de forma segura;
  - nunca enviar dois links ativos como se fossem o mesmo pedido.

### P1 - Frete estimado pode ajudar venda, mas e decisao comercial

Arquivos:

- `src/lib/shipping/cotar.ts`
- `src/app/checkout/actions.ts`

Hoje, se a cotacao falha, a venda para. Isso e tecnicamente seguro.

Cobrar "frete estimado" sem uma tabela aprovada pode criar prejuizo, atraso e conflito com o cliente. DHL/FedEx podem variar por pais, regiao, peso, dimensao, seguro, combustivel e eventuais adicionais.

Recomendacao:

- nao usar FedEx para cotar e DHL para entregar como regra automatica sem margem e politica escrita;
- se precisar destravar venda, criar primeiro um fluxo de "cotacao manual":
  - cliente envia dados;
  - pedido fica sem cobranca;
  - equipe confirma frete;
  - pagamento abre depois do frete aprovado.

### P2 - Falha de frete ainda nao salva a venda pelo WhatsApp

Arquivo:

- `src/app/checkout/actions.ts`

Mensagem atual e segura, mas fria. O cliente recebe erro e precisa descobrir o proximo passo.

Recomendacao:

- quando o frete falhar, mostrar:
  - "Seu pedido nao foi cobrado";
  - "Nao conseguimos calcular o frete automaticamente agora";
  - botao "Falar com a equipe no WhatsApp";
  - contexto do carrinho/CEP na mensagem, sem expor dados sensiveis desnecessarios.

Copy sugerida:

> Nao conseguimos calcular o frete automaticamente agora. Seu pedido nao foi cobrado. Fale com a equipe para confirmar o envio e concluir com seguranca.

### P2 - Falta painel de diagnostico vivo

Hoje a seguranca existe no codigo, mas a operacao ainda depende de olhar logs, banco e variaveis.

Recomendacao:

Criar `/admin/diagnostico-checkout` com:

- provider nacional ativo;
- Apple Pay/Stripe disponivel;
- status de SuperFrete;
- status de webhook Asaas/Stripe;
- ultimas falhas de frete;
- pagamentos pendentes sem URL;
- ultimo erro ambiguo;
- ultimo Purchase enviado;
- botao de cotacao teste por CEP sem criar cobranca.

### P2 - Comentario antigo de frete pode confundir engenharia futura

Arquivo:

- `src/lib/shipping/index.ts`

Ha comentario antigo mencionando venda com frete 0 em caso de indisponibilidade. A regra atual no checkout e mais segura: sem cotacao escolhida, nao cria cobranca.

Recomendacao:

- atualizar comentario para refletir o estado atual;
- isso nao altera comportamento, mas evita que alguem implemente fallback errado no futuro.

## Plano para melhorar do 1 ao 4

### 1. Melhorar falha de frete sem mexer em pagamento

Objetivo: salvar o cliente quando DHL/SuperFrete nao cotar, sem cobrar errado.

Itens:

- melhorar mensagem de erro;
- adicionar botao de WhatsApp;
- incluir resumo seguro do carrinho e CEP na mensagem;
- manter bloqueio de pagamento quando nao ha frete.

Risco: baixo.  
Impacto: alto em conversao quando frete falha.

### 2. Criar diagnostico admin de checkout

Objetivo: saber em 30 segundos se pagamento, frete e pixel estao prontos.

Itens:

- tela read-only no admin;
- checagem de envs por nome, sem expor segredo;
- status dos providers;
- ultimos eventos/falhas;
- cotacao teste sem criar pedido;
- checklist operacional.

Risco: baixo se for somente leitura.  
Impacto: alto para suporte e deploy.

### 3. Prova controlada de pagamento

Objetivo: testar provider sem poluir pixel nem criar compra falsa.

Itens:

- runbook de smoke test;
- pedido real pequeno quando necessario;
- estorno pelo dashboard quando aplicavel;
- conferir webhook;
- conferir que Purchase so sai apos confirmacao real;
- registrar evidencia da data, metodo e resultado.

Risco: medio, porque envolve dinheiro real se for producao.  
Impacto: alto para confiar em Apple Pay/terceiro metodo.

### 4. Terceiro metodo atras de flag

Objetivo: adicionar opcao sem mexer no metodo principal.

Itens:

- ampliar `paymentPreference`;
- exibir opcao somente quando configurada;
- gravar preferencia no pedido;
- mapear preferencia para provider;
- manter trava de um pagamento pendente por pedido;
- testar desconto, frete, webhook e Purchase;
- publicar primeiro escondido por flag.

Risco: medio/alto por ser pagamento.  
Impacto: alto se reduzir abandono.

## O que nao fazer

1. Nao cotar por FedEx e entregar por DHL automaticamente sem politica comercial.
2. Nao cobrar frete estimado internacional sem margem aprovada.
3. Nao criar link de pagamento alternativo fora da tabela `payments`.
4. Nao disparar `Purchase` por clique, pagina de obrigado ou retorno do navegador.
5. Nao trocar `REVERA_PAYMENT_PROVIDER` globalmente para testar um terceiro metodo.
6. Nao abrir pais internacional sem preco, frete valido e Stripe live conferida.

## Decisoes que faltam do Francisco

1. Qual e o terceiro metodo desejado:
   - Asaas como opcao separada;
   - InfinitePay como opcao separada;
   - Stripe cartao/carteiras digitais;
   - Mercado Pago ou outro provider novo.

2. O frete estimado sera permitido?
   - se sim, para quais paises/UFs;
   - qual margem de seguranca;
   - quem absorve diferenca se o frete real sair maior.

3. Qual WhatsApp deve receber falha de frete:
   - atendimento geral;
   - equipe Revera;
   - numero especifico para checkout.

## Nota final

Estado atual: **8,7/10**.

Com os passos 1 e 2: **9,2/10**.

Com smoke controlado e terceiro metodo por flag: **9,5/10**.

Para chegar em **10/10**, ainda precisa de:

- diagnostico admin vivo;
- prova real de cada metodo;
- politica formal de frete estimado ou cotacao manual;
- evidencia de webhook por provider;
- alerta operacional para falha de pagamento/frete;
- documentacao curta de como reverter uma opcao sem derrubar checkout.

## Validacao executada

Comando:

```bash
npm test -- tests/unit/checkout-frete-automatico.test.ts tests/unit/pagamento-fail-closed.test.ts tests/unit/frete-fail-closed.test.ts tests/unit/ambiguous-charge-error.test.ts tests/unit/webhook-pagamento-asaas-rota.test.ts tests/unit/webhook-stripe-rota.test.ts tests/unit/purchase-isolamento.test.ts
```

Resultado: **7 arquivos passaram, 90 testes passaram**.

Esses testes cobrem os pontos mais sensiveis desta auditoria: frete automatico, falha fechada de pagamento/frete, erro ambiguo, webhooks e isolamento de Purchase.
