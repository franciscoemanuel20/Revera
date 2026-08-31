# Garantia e devolução internacionais — a decisão que falta

> **Estado**: NÃO DECIDIDO. É o bloqueio nº 4 da ativação internacional, e o
> único dos quatro que não depende da Stripe nem de cotação — depende só de
> uma escolha do Francisco.
>
> Escrito em 30/08/2026. **Nada aqui está no ar**: o aceite atual
> (`2026-08-28.v2.pre-juridico`) é silencioso sobre garantia e devolução, de
> propósito. Um aceite que promete o que a operação não sustenta é pior que
> um aceite omisso — o omisso deixa a conversa aberta, o falso já perdeu.

## Por que não dá para copiar a regra do Brasil

A garantia nacional é: **7 dias úteis** para avisar defeito de fabricação, e
**7 dias** para desistir da compra com a peça sem uso. Funciona porque
devolver uma peça dentro do Brasil custa pouco perto do valor dela.

Fora do Brasil a conta vira outra:

| | valor |
|---|---|
| Peça (Micropele 0,08 nos EUA) | **US$ 124,99** |
| Frete de ida (DHL Express Easy) | **US$ 62,80** |
| Frete de volta EUA → Brasil | **igual ou mais caro** que a ida |

Ou seja: **o retorno de uma peça custa perto de metade do valor dela**, sem
contar desembaraço e o tempo. Uma devolução física internacional pode custar
mais do que simplesmente mandar outra peça.

Some-se a isso o que já é verdade da operação: depois de cortada, moldada e
colada, a prótese não volta ao estado em que foi enviada. Isso não muda por
causa da fronteira — só fica mais caro de resolver.

## As três saídas, com a consequência de cada uma

### A. Troca por evidência, sem devolução física  ← recomendada

Defeito de fabricação comprovado por **foto e vídeo** (o mesmo teste dos fios
que a página já ensina), dentro de **7 dias corridos** do recebimento. A
Reverá envia outra peça sem custo, e **o cliente não devolve nada**.

- **Custo do pior caso**: uma peça + um frete (≈ US$ 188) por ocorrência.
- **Por que funciona**: é o padrão do comércio internacional para item de
  valor baixo, justamente porque o frete de volta não se paga. E o teste dos
  fios já produz a evidência naturalmente — a pessoa filma o pano.
- **Risco**: fraude. Mitigado pelo prazo curto e pela exigência de vídeo
  contínuo, e limitado pelo volume (é venda unitária, não atacado).

### B. Paridade com o Brasil (devolução física paga pela Reverá)

- **Custo do pior caso**: peça + ida + volta + desembaraço ≈ **US$ 250+**,
  para receber de volta uma peça que provavelmente não pode ser revendida.
- **Recomendação**: não. Paga-se mais para receber lixo caro.

### C. Cliente paga o frete de volta

- **Custo para a Reverá**: baixo.
- **Custo real**: a taxa de reclamação. Pedir a um americano que gaste
  US$ 60 para devolver uma peça de US$ 125 defeituosa é o roteiro clássico
  de chargeback — e chargeback numa conta Stripe nova, em análise, é o pior
  momento possível para acontecer.
- **Recomendação**: não, pelo menos não no primeiro ano.

## O ponto que precisa de advogado, e não de mim

O direito de **arrependimento em 7 dias** (compra fora do estabelecimento) é
do consumidor brasileiro. A Reverá é empresa brasileira vendendo para fora, e
**qual lei rege esse contrato é pergunta jurídica**, não comercial. Existem
três respostas possíveis (lei brasileira, lei do destino, ou a que o contrato
eleger) e elas mudam o que precisa estar escrito.

Não invente uma resposta aqui. O sufixo `pre-juridico` no aceite existe
exatamente para isso.

## O que acontece depois da sua escolha

Escolhido A, B ou C, eu:

1. escrevo o texto nas **três línguas** (pt, en, es) — mesmo acordo, três
   redações, como já é hoje;
2. subo o aceite para **v3**, porque aí o conteúdo muda de verdade para quem
   vai aceitar (diferente da entrada do espanhol, que não mudou nada);
3. ponho o texto na tela do checkout internacional e na página de garantia;
4. registro a data da decisão no código, como o resto.

Enquanto não houver escolha, o aceite continua silencioso — e continua sendo
a opção mais honesta das disponíveis.
