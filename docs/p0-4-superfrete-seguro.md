# O `insurance_value` da SuperFrete — investigação e veredito

**Data:** 27/08/2026
**Origem:** achado da auditoria de 26/08/2026, seção "SuperFrete", classificado como **P1-3 — RISCO**.
**Método:** cotações reais contra `POST https://api.superfrete.com/api/v0/calculator`. Somente leitura — `/calculator` não cria etiqueta, não debita carteira e não gera cobrança. **Nenhum custo real foi incorrido.**

---

## A suspeita levantada pela auditoria

Uma cotação de R$ 1.600 declarados devolveu, no mesmo campo:

| Serviço | `packages[0].insurance_value` |
|---|---|
| PAC | **15.74** |
| SEDEX | **15.74** |
| Loggi | **1600** |

A leitura natural — e a que a auditoria fez — foi: *"os Correios só estão cobrindo R$ 15,74 de uma peça de R$ 1.600"*. Como o código decide cobertura por uma tabela fixa (`TETO_SEGURO_CENTS`) e não pela resposta, a conclusão foi que poderíamos estar despachando uma prótese praticamente sem seguro.

Era uma suspeita razoável. **Estava errada.**

---

## O experimento

Mesma origem, mesmo destino, mesma caixa (300 g, 30×20×5). Só o valor declarado muda.

| Declarado pedido | PAC — preço | PAC — `insurance_value` | SEDEX — `insurance_value` | Loggi — `insurance_value` |
|---|---|---|---|---|
| R$ 0 | R$ 17,77 | **0** | 0 | 0 |
| R$ 100 | R$ 18,62 | **0,74** | 0,74 | 100 |
| R$ 500 | R$ 23,22 | **4,74** | 4,74 | 500 |
| R$ 1.600 | R$ 35,87 | **15,74** | 15,74 | 1600 |
| R$ 3.000 | R$ 51,97 | **29,74** | 29,74 | 3000 |

---

## O que os números provam

### 1. Nos Correios, o campo é o PREÇO do seguro — não a cobertura

Os valores seguem uma fórmula exata:

```
insurance_value = 0,74 + 1% do que passa de R$ 100
```

Conferindo: R$ 500 → 0,74 + 4,00 = **4,74** ✓ · R$ 1.600 → 0,74 + 15,00 = **15,74** ✓ · R$ 3.000 → 0,74 + 29,00 = **29,74** ✓

Essa é a tabela clássica de **valor declarado dos Correios**. O campo devolve quanto CUSTA segurar, não quanto está segurado.

### 2. A cobertura foi de fato contratada

O preço total do PAC subiu de **R$ 17,77** (sem declarar) para **R$ 35,87** (declarando R$ 1.600). Ninguém cobra R$ 18 a mais por uma cobertura que não deu. O aumento acompanha o valor declarado em todas as faixas.

### 3. Na Loggi, o mesmo campo significa outra coisa

A Loggi devolve o próprio valor declarado (1600 → 1600). **Mesmo nome de campo, duas semânticas diferentes, na mesma resposta.**

### 4. É por isso que a resposta não serve para decidir cobertura

Um código que lesse `insurance_value` para saber se a peça está coberta trataria PAC (15,74 < 160000) como "não cobre" e Loggi (1600) como "cobre" — e estaria comparando um preço em reais com um valor em centavos, por acidente. **A tabela fixa é a abordagem certa.**

---

## Os tetos, conferidos um a um

Cotações acima e abaixo de cada limite, lendo a mensagem de erro da própria API:

| Serviço | Nossa tabela | O que a API respondeu | Veredito |
|---|---|---|---|
| **Loggi** | R$ 3.000 | erro em R$ 3.500: *"limite máximo de R$ 3000,00"*; aceita R$ 1.600 | **BATE** |
| **Jadlog** | R$ 1.500 | erro em R$ 1.600: *"limite máximo de R$ 1500,00"*; aceita R$ 1.400 | **BATE** |
| **J&T** | R$ 1.500 | erro dizendo *"limite máximo de R$ 1000,00"* | **NÃO BATIA — corrigido para R$ 1.000** |
| **PAC / SEDEX** | R$ 3.000 | aceitam R$ 3.500 sem erro | **CONSERVADOR** — o teto real é maior |

Sobre PAC/SEDEX: manter R$ 3.000 erra para o lado seguro. Subestimar um teto no máximo descarta uma opção de frete que serviria; superestimar deixaria a peça a descoberto. Entre os dois erros, só um sangra — mesmo raciocínio da caixa de embalagem em `regras.ts`.

Sobre o J&T: o número estava errado e foi corrigido de R$ 1.500 para R$ 1.000. **Sem efeito prático hoje** — o J&T não está em `SERVICOS_PADRAO`, e mesmo se estivesse a própria API devolveria erro, que `melhorOpcao` já descarta. Mas um número não conferido numa tabela de cobertura é exatamente o tipo de coisa que alguém reaproveita depois acreditando que foi verificada.

---

## Veredito

> **A lógica de `coversInsurance` está CORRETA e não foi alterada.**
>
> O achado P1-3 da auditoria de 26/08/2026 fica **DESCARTADO**: não existe risco de seguro insuficiente. Era leitura equivocada de um campo com duas semânticas.
>
> A única correção foi o teto do J&T (R$ 1.500 → R$ 1.000), com base na mensagem literal da API — não por suspeita.

Uma consequência prática que vale registrar: como o preço da cotação **já inclui** o seguro do valor declarado, o R$ 26,06 da Loggi para a peça de R$ 1.600 é o preço com cobertura integral. A regra de `melhorOpcao` — escolher a mais barata entre as que cobrem — está comparando valores diretamente comparáveis.
