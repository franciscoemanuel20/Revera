# ADR — piloto dos EUA com jornada localizada

**Status:** aceita para implementacao incremental
**Data:** 2026-10-06

## Contexto

Os anuncios internacionais em rascunho levam hoje a uma jornada incompleta: a
pagina do produto e a rota de checkout perdem o prefixo de idioma, a vitrine
mostra BRL e o comprador americano pode chegar a textos do mercado brasileiro.
O checkout internacional, por outro lado, ja possui pais, ingles, USD, Stripe,
cotacao DHL de producao e bloqueios fail-closed.

## Decisao

Liberar primeiro somente o piloto dos Estados Unidos. A URL do anuncio deve ser
`/en/produtos/<slug>` e conservar o mercado `US` ate `/en/checkout`. Produto,
carrinho e checkout devem usar ingles; precos apresentados em USD devem nascer
da mesma conversao PTAX usada na criacao do pedido. Se preco, Stripe ou cotacao
DHL valida faltarem, a venda permanece bloqueada com mensagem honesta.

Espanha, Franca e Alemanha continuam em rascunho ate a mesma jornada estar
validada e as regras de devolucao, tributos e informacao pre-contratual da UE
estarem publicadas.

## Consequencias

- Nenhum anuncio e publicado apenas porque a rota existe: e necessario teste
  completo, build verde, revisao adversarial e validacao no ambiente publico.
- Nao duplicaremos calculo comercial no navegador; a apresentacao internacional
  reutiliza funcoes de mercado no servidor.
- O checkout brasileiro e as campanhas nacionais permanecem sem alteracao.
- O rollout pode ser interrompido mantendo a campanha pausada, sem fechar o
  checkout brasileiro.
