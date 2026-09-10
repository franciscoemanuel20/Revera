# Auditoria — cotações de frete PT, GB, AU, CA aplicadas (02/09/2026)

**Autorizado por:** Francisco ("aplica os SQLs das cotações de PT GB AU CA").
**Como:** API REST do Supabase (PostgREST + service role), não SQL colado.

## Confirmado antes da escrita

| | |
|---|---|
| projeto | REVERÁ |
| Supabase ref | `ngnaemfiytutyplolgxb` ✓ conferido em runtime |
| ambiente | produção |
| tabela | `intl_shipping_quotes` |
| a inserir | 4 linhas: PT, GB, AU, CA |
| **não podia tocar** | a linha US (USD 6600) |

O script abortaria se a ref divergisse ou se a linha US não estivesse em
6600 — a guarda existe para não escrever sobre um estado diferente do que eu
tinha lido.

## Resultado

```
antes  : 1 linha  (US USD 6600)
linhas ativas pré-existentes para PT/GB/AU/CA: 0
inseridas: 4
depois : 5 linhas
```

| país | moeda | valor | prazo | vence |
|---|---|---|---|---|
| PT | EUR | 74,00 | 4–6 dias | 02/10/2026 |
| GB | GBP | 64,00 | 4–6 dias | 02/10/2026 |
| AU | AUD | 126,00 | 3–5 dias | 02/10/2026 |
| CA | CAD | 102,00 | 5–7 dias | 02/10/2026 |
| US | USD | 66,00 | 4–6 dias | 28/09/2026 |

**Provas:** cada país com exatamente 1 cotação ativa, moeda e valor
conferidos um a um; a linha US comparada campo a campo antes × depois —
**idêntica**.

## Verificação extra: os preços existem?

Cotação de frete sem preço de produto na moeda faz o país aparecer e se
mostrar indisponível. Conferido em `variant_prices`: **145 linhas, 29
variantes, 29 preços em cada uma das 5 moedas — nenhuma combinação
faltando.**

## O que NÃO foi feito

`CHECKOUT_PAISES` segue `BR,US`. Os quatro países **não vendem ainda** —
abrir é decisão comercial e exige mudar a variável na Vercel mais redeploy.

## Desfazer

```sql
delete from intl_shipping_quotes
 where country in ('PT','GB','AU','CA') and quoted_at = '2026-09-02';
```
