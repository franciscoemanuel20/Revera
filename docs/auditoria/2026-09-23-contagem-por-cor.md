# Auditoria da contagem por cor na pagina de produto

Data: 23/09/2026  
Area: Produto, carrinho, desconto por volume, checkout e pixel  
Objetivo: subir a experiencia de compra por varias cores de 8/10 para 9/10+

## Resumo executivo

O metodo atual esta correto na parte critica: cada clique no `+` de uma cor adiciona uma unidade daquela cor ao carrinho, o servidor valida estoque/preco/cor ativa, e o desconto de 5 ou 10 pecas e calculado pela soma do produto, nao por cada cor isolada.

Nota atual: **8/10**.

Meta recomendada: **9,2/10**.

O caminho para subir a nota nao e refazer a regra de preco. A regra esta boa. O que falta e transformar a escolha por cor em um pequeno montador de pedido visivel na propria pagina, para o cliente enxergar imediatamente quantas pecas ja colocou, em quais cores, quanto falta para a oferta e qual subtotal estimado esta se formando.

## O que ja esta profissional

1. **Adicionar por cor e uma acao real de carrinho**
   - Arquivo: `src/app/produtos/[slug]/ProdutoInterativo.tsx`
   - A funcao `adicionarCorRapida(corId)` chama `adicionarItem(variante.id, 1)`.
   - O cliente pode montar um pedido misto: 1B + 4 + 5, por exemplo.

2. **A validacao acontece no servidor**
   - Arquivo: `src/lib/cart/store.ts`
   - `adicionarItemAoCarrinho()` valida quantidade inteira, variante ativa, cor ativa, preco maior que zero e estoque.
   - Isso impede compra de cor desativada, preco zerado ou estoque acima do disponivel.

3. **O desconto soma por produto, nao por cor**
   - Arquivo: `src/lib/cart/store.ts`
   - `quantidadePorProduto` soma todas as variantes do mesmo produto.
   - `precoDaLinhaComDegrauDoProduto()` aplica o degrau de 5/10 usando o total do produto.
   - Exemplo correto: 3 unidades na cor 3 + 2 unidades na cor 5 = 5 Micropele, portanto entra no degrau de 5.

4. **O checkout recalcula o valor no servidor**
   - Arquivo: `src/app/checkout/actions.ts`
   - `criarPedidoAction()` chama `lerCarrinhoCompleto()` antes de criar pedido.
   - O navegador nao decide preco, desconto ou total.

5. **Pixel mais seguro**
   - Arquivo: `src/lib/tracking/browser.ts`
   - O evento `AddToCart` e disparado depois da confirmacao do servidor.
   - `Purchase` nao nasce do navegador por conta propria; depende de confirmacao de pagamento.

## Fragilidades que seguram a nota

### 1. O cliente nao ve um resumo do pedido por cor na propria pagina

Hoje o cliente clica no `+` e recebe uma confirmacao curta. Para conferir se colocou 1B, 4 e 5 corretamente, ele precisa abrir a sacola.

Impacto:
- aumenta duvida em pedido com muitas cores;
- aumenta risco de clique repetido sem perceber;
- deixa a experiencia menos premium para compra de 5/10 pecas.

Prioridade: **P1 alta**.

Recomendacao:
- adicionar um painel compacto perto da cartela:
  - `Seu pedido neste produto`
  - `1B x1`
  - `4 x1`
  - `5 x1`
  - `Total: 3 pecas`
  - `Faltam 2 para a oferta de 5`

### 2. Existem dois caminhos de adicionar e isso pode confundir

Hoje existem:
- o `+` ao lado de cada cor, que adiciona 1 unidade daquela cor;
- o seletor de quantidade principal + botao maior, que adiciona a quantidade escolhida da cor selecionada.

Isso e poderoso, mas exige microcopy clara.

Impacto:
- cliente pode nao entender se o seletor grande muda a quantidade da cor ou do pedido todo;
- em atacado, pode parecer que a oferta depende apenas do seletor principal, quando o carrinho soma tudo.

Prioridade: **P1 alta**.

Recomendacao:
- manter os dois caminhos, mas separar o significado:
  - perto da cartela: `Use + para montar um pedido com cores diferentes.`
  - perto do seletor principal: `Para varias unidades da mesma cor selecionada.`

### 3. Falta progresso visual da oferta de 5/10 na pagina enquanto mistura cores

A regra de desconto esta correta no carrinho, mas a pagina do produto ainda nao mostra claramente o progresso real do pedido misto.

Impacto:
- perde incentivo comercial;
- cliente pode nao perceber que esta perto da oferta;
- oportunidade de aumentar ticket medio fica escondida.

Prioridade: **P1 alta**.

Recomendacao:
- mostrar progresso:
  - `3 pecas na sacola`
  - `faltam 2 para R$ 620,00 cada`
  - `faltam 7 para R$ 600,00 cada`

### 4. O `+` por cor e funcional, mas ainda pode ficar mais refinado visualmente

O botao atual e claro e acessivel, mas a cartela pode ficar visualmente cheia por ter uma bolinha de cor e um botao `+` em cada item.

Impacto:
- no desktop esta aceitavel;
- no mobile pode ficar um pouco denso;
- ainda nao passa a sensacao de "montador premium".

Prioridade: **P2 media**.

Recomendacao:
- testar uma versao onde cada cor vira um pequeno controle:
  - botao `-`
  - miniatura da cor
  - contador da cor
  - botao `+`
- para cores zeradas, mostrar apenas miniatura + `+`;
- para cores com quantidade, expandir para `- 1 +`.

### 5. Falta um teste integrado para a jornada 1B + 4 + 5 + oferta

Existem testes da regra de desconto entre cores, mas a experiencia nova merece um teste de fluxo.

Prioridade: **P2 media**.

Recomendacao:
- criar teste cobrindo:
  - adicionar cor A;
  - adicionar cor B;
  - adicionar cor C;
  - carrinho mostra tres linhas ou quantidades corretas;
  - ao atingir 5 pecas, desconto aparece;
  - checkout recebe o mesmo subtotal/desconto.

## Plano para subir para 9,2/10

### Fase 1: clareza imediata na pagina

Objetivo: o cliente entende o que acabou de montar sem abrir a sacola.

Itens:
1. Mostrar painel `Seu pedido neste produto`.
2. Listar cores adicionadas e quantidade por cor.
3. Mostrar total de pecas do produto.
4. Mostrar quanto falta para a oferta de 5 e 10.
5. Botao secundario: `Ver sacola`.

Resultado esperado:
- menos duvida;
- menos erro de cor;
- mais incentivo para completar 5/10.

Nota esperada apos Fase 1: **9/10**.

### Fase 2: controle por cor mais premium

Objetivo: transformar a cartela em um mini montador de pedido.

Itens:
1. Quando a cor esta zerada: miniatura + `+`.
2. Quando a cor tem quantidade: `- quantidade +`.
3. Permitir reduzir sem abrir a sacola.
4. Manter o carrinho como fonte de verdade.

Resultado esperado:
- experiencia parecida com compra B2B/atacado;
- cliente ajusta a combinacao na propria pagina;
- menos atrito antes do checkout.

Nota esperada apos Fase 2: **9,2/10 a 9,5/10**.

### Fase 3: prova visual e teste

Objetivo: garantir que nao quebrou checkout, pixel ou desconto.

Itens:
1. Teste unitario adicional para desconto misto, se necessario.
2. Teste de fluxo com carrinho misto.
3. Verificacao manual:
   - 1B x1;
   - 4 x1;
   - 5 x1;
   - completar ate 5;
   - conferir desconto no carrinho;
   - iniciar checkout;
   - conferir total.
4. Conferir eventos:
   - AddToCart por clique real;
   - InitiateCheckout ao abrir checkout;
   - Purchase somente apos pagamento confirmado.

## Criterios de aceite

Para considerar a melhoria aprovada:

1. O cliente consegue adicionar 1B, 4 e 5 sem abrir a sacola.
2. A pagina mostra as cores escolhidas e quantidades.
3. O total do produto soma cores diferentes.
4. Ao chegar em 5 pecas, o desconto aparece no carrinho.
5. Ao chegar em 10 pecas, o segundo degrau aparece.
6. Checkout usa o mesmo desconto do carrinho.
7. Nenhum preco e calculado apenas no navegador.
8. Pixel AddToCart nao dispara quando o servidor retorna erro.
9. Mobile nao fica poluido ou com texto quebrado.
10. A dona da loja consegue entender o pedido pela cor no painel/pedido.

## Riscos comerciais

1. **Aumentar clique sem compra**
   - O `+` facilita adicionar, mas pode aumentar carrinhos abandonados.
   - Mitigacao: mostrar progresso da oferta e CTA claro para finalizar.

2. **Cliente montar errado e nao perceber**
   - Mitigacao: resumo por cor na pagina e na sacola.

3. **Oferta parecer inconsistente**
   - Mitigacao: texto claro dizendo que a oferta soma as cores do mesmo modelo.

4. **Poluicao visual**
   - Mitigacao: layout compacto, mobile-first, sem transformar a cartela em painel pesado.

## Recomendacao final

Nao recomendo abandonar o metodo atual. Ele esta bem estruturado por baixo.

Recomendo evoluir o metodo para um **montador de pedido por cor**, mantendo o carrinho e o servidor como fonte de verdade.

Prioridade de implementacao:

1. Resumo do pedido por cor na pagina.
2. Progresso para ofertas de 5/10.
3. Controle `- quantidade +` por cor.
4. Teste de fluxo com cores misturadas.

Com isso, a nota sobe de **8/10** para aproximadamente **9,2/10**.
