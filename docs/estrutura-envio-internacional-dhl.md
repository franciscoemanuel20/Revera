# Estrutura Revera.com.br — ENVIO INTERNACIONAL — DHL

Registrado em 27/08/2026, a partir da mensagem do Francisco de 21:02 (a de
20:51 chegou cortada e foi substituída pela de 21:02, por decisão dele).
Aceito pelo Francisco em 28/08/2026 como **documento oficial e fonte da
verdade** deste bloco da estrutura internacional da Reverá.

## STATUS DO DOCUMENTO

| área | situação |
|---|---|
| Decisões comerciais | **parcialmente definidas** (faltam: preços reais por mercado, cotação DHL real, conta Stripe de produção) |
| DHL API | **não configurada** |
| NF-e exportação | **não configurada** |
| Commercial Invoice | **não configurada** |
| Gateway internacional | **Stripe em TEST MODE, provado no staging (28/08)** — produção não configurada |
| Fiscal/aduaneiro | **aguardando validação** |
| Checkout internacional real | **construído e provado em staging (test mode)** — produção segue fechada até preço + frete + chaves live |

Este bloco existe para evitar qualquer ilusão de prontidão: enquanto uma
linha acima disser "não configurado" ou "aguardando", nenhuma tela, texto ou
automação deve se comportar como se aquilo existisse.

**Nesta etapa nada aqui vira código.** Este documento existe para que, daqui
a semanas, dê para olhar e saber exatamente o que existe de verdade e o que
ainda é planejamento. Cada item carrega uma etiqueta:

| etiqueta | significado |
|---|---|
| `JÁ IMPLEMENTADO` | existe no código, com commit e teste (branch `fundacao-internacional-27-08`; migrations 8–10 **aplicadas no STAGING** e provadas ao vivo em 28/08; **produção segue sem elas** — ver docs/go-live-internacional.md; nada pushado) |
| `DECISÃO FECHADA` | o Francisco decidiu; falta só implementar |
| `AGUARDANDO IMPLEMENTAÇÃO` | decidido ou especificado, sem código ainda |
| `DEPENDE DA DHL` | precisa de conta/da operação/da API da DHL |
| `DEPENDE DO CONTADOR/FISCAL` | precisa de validação fiscal/tributária |
| `DEPENDE DE DECISÃO COMERCIAL` | precisa de decisão de negócio do Francisco |

---

## 0. Pré-requisito que sequencia tudo

`RESOLVIDO TECNICAMENTE em 28/08/2026 — resta a decisão da CONTA de
produção.` O gateway internacional é a **Stripe** (doc oficial: conta BR
cobra cartão estrangeiro em USD/EUR/GBP/AUD/CAD e liquida em BRL; cartão
brasileiro segue obrigado a BRL — e esse cliente compra pela InfinitePay).
Compra real em test mode + reembolso provados no staging com o sandbox
"OneMark IA". Pende do Francisco: decidir a conta Stripe DE PRODUÇÃO da
Reverá e ativá-la. O texto abaixo é o registro histórico do bloqueio:

`DEPENDE DE DECISÃO COMERCIAL` — **não existe hoje como COBRAR um cliente no
exterior.** A InfinitePay não vende para fora do Brasil (central de ajuda
oficial; cartão estrangeiro só com portador que tenha CPF, em BRL). Todo o
checkout internacional descrito abaixo fica atrás dessa decisão de gateway.
Por isso `paisesDoCheckout()` devolve só `["BR"]` — de propósito, para
ninguém preencher um formulário inteiro e descobrir no fim que não consegue
pagar. Detalhe completo no dossiê "Exportação Reverá"
(https://claude.ai/code/artifact/582fbc43-a102-43e6-851a-2eb0ad1c8e05).

## 1. Frete separado do produto

`JÁ IMPLEMENTADO` (no desenho nacional) — `orders` tem `subtotal_cents`,
`shipping_cents` e `total_cents` como colunas separadas desde a migration 1,
e a migration 9 acrescenta `tax_cents`; o checkout BR cota o frete pelo CEP
e mostra o total antes do gateway. Nunca houve frete embutido no preço.

`DECISÃO FECHADA` — preservar sempre a separação em quatro parcelas:
**subtotal / shipping / tax / total**. Nenhuma delas se esconde dentro de
outra.

`JÁ IMPLEMENTADO` (28/08/2026) — a tela do checkout internacional exibe
"Produtos / Frete internacional — DHL / Total" na moeda do mercado, provada
de ponta a ponta no staging com a Stripe real em test mode (pedido
REV-A8D6FD68, US$ 850 + 120 = 970).

## 2. Cotação por destino

`JÁ IMPLEMENTADO` (28/08/2026, migration 10) — tabela `intl_shipping_quotes`
com país, serviço, transportadora, moeda, peso máximo em GRAMAS, prazo
min/máx, data da cotação e **validade** (cotação vencida fecha o país
sozinha); administrada em `/admin/internacional`; o pedido grava QUAL
cotação usou em `orders.intl_shipping_quote_id`. O que segue pendente da
fase DHL: dimensões por cotação e valor declarado/seguro por pedido.

Regras que continuam valendo (a segunda entra na fase DHL):

- **Peso internamente em gramas, sempre.** A Reverá inteira usa gramas
  (`SUPERFRETE_CAIXA_PESO_GRAMAS`, `products.net_weight_g`); o irmão
  pedido-à-distância usa quilos e copiar número entre os dois já quase errou
  peso por mil vezes. Integração que trabalhe em kg (a DHL, por exemplo)
  converte **somente na fronteira do provider/API** — nunca no domínio.
- **Valor declarado/seguro por pedido**, não fixo: a cotação de referência
  segura R$ 1.000, mas 1 peça já custa R$ 650 e 10 peças passam de R$ 6.000.

### Cotação de referência — REGISTRO HISTÓRICO, não é preço

| | |
|---|---|
| Rota | Brasil → Estados Unidos |
| Peso | 0,5 kg (500 g) |
| Dimensões | 19 × 15 × 5 cm |
| Serviço | DHL Courier Express, porta a porta, rastreio, comprovante |
| Seguro | valor declarado R$ 1.000 |
| Valor | **R$ 333,23** |
| Validade | **28/08/2026 — já vencida na prática** |

**Cotação VENCIDA, mantida apenas como referência histórica.** Jamais deve
ser usada pelo checkout como preço — nem como fixo, nem como fallback. Ela
existe só para dimensionar ordem de grandeza e testar a estrutura de
cotações com um exemplo real.

## 3. DHL

`DECISÃO FECHADA` — a DHL é a transportadora operacional inicial dos pedidos
internacionais. **"Pronto para levar à DHL" é o fluxo operacional ATUAL da
Reverá: ela prepara o pedido e leva o pacote à DHL.** Sem integração
automática por API nesta fase — não presumir. No futuro pode haver coleta
pela DHL, mas **não abstrair isso excessivamente agora** — quando mudar, o
rótulo e o fluxo mudam juntos, numa entrega própria.

`JÁ IMPLEMENTADO` — o código já assume exatamente esse modelo: o eixo
`export_status` termina em `ready_for_dispatch`, rotulado na tela como
**"Pronto para levar à DHL"**, e dali o bastão passa para `shipping_status`.
O checklist tem a etapa DHL como `nao_configurado` (terceiro estado — não é
"pendente", é "não existe ainda"), ligável por env `DHL_ATIVA=1`.

`DEPENDE DA DHL` — evolução futura via MyDHL API: cotação, criação de envio,
AWB, etiqueta, documentação (Paperless Trade), tracking. Exige conta DHL
Express ativa, e **ter conta não garante acesso à API** — validar com a DHL
antes de desenhar essa fase.

## 4. Impostos de importação

`DECISÃO FECHADA` — linguagem juridicamente prudente, sempre no condicional:

> "O pedido poderá estar sujeito a impostos, taxas de importação ou encargos
> aduaneiros no país de destino."

Proibido: "você será taxado", "todos os pedidos são taxados", "você não será
taxado". Proibido calcular imposto sem fonte/integrador confiável. Proibido
inventar porcentagem por país ou afirmar que país X sempre/nunca cobra.

`JÁ IMPLEMENTADO` (28/08/2026) — o aviso no checkout internacional e o
bloco informativo "Seu pedido será enviado pela DHL", com a linguagem
condicional desta seção, ao vivo no staging.

**Atenção a um campo que já existe**: `orders.tax_cents` (migration 9,
default 0). Ele foi criado para o dia em que houver DDP — **não** é convite
a calcular imposto hoje. **Permanece 0 enquanto não existir solução
tributária validada.** E o zero significa "a Reverá não cobrou imposto no
checkout" — **não significa "o cliente não terá imposto"**. São conceitos
diferentes: o cliente ainda pode ser cobrado pela alfândega ou pela
transportadora no destino, e é exatamente isso que o aviso e o aceite
comunicam.

## 5. Responsabilidade / Incoterm

`DEPENDE DO CONTADOR/FISCAL` + `DEPENDE DE DECISÃO COMERCIAL` — o fluxo é
estruturado considerando **DAP como possibilidade operacional** (tributos no
destino por conta do comprador), **mas nenhum Incoterm está decidido nem
deve ser publicado** até validação comercial/fiscal. Esta é uma decisão
explicitamente em aberto. O texto ao cliente diz que eventuais cobranças
"dependerão das regras do país e da modalidade de envio adotada" — sem citar
DAP/DDP.

## 6. Aceite do cliente

`DECISÃO FECHADA` (requisito) — antes do pagamento internacional, aceite
obrigatório e específico (não um checkbox genérico) deixando claro que:

- é uma compra internacional;
- haverá frete internacional;
- o prazo pode sofrer impacto de alfândega;
- o pedido poderá estar sujeito a tributos/taxas no destino;
- eventuais cobranças dependerão das regras do país e da modalidade adotada.

O botão de finalizar permanece desabilitado até o aceite. O aceite é
**versionado e auditável**: gravar `terms_version` e `accepted_at` no pedido.

`JÁ IMPLEMENTADO` (28/08/2026, migration 10) — `orders.terms_version` +
`orders.terms_accepted_at` (relógio do servidor, CHECK de coerência),
checkbox obrigatória que trava o botão E é revalidada no servidor
(`literal(true)`). Versão atual: `2026-08-28.v1.pre-juridico`.

`DEPENDE DO CONTADOR/FISCAL` — o texto jurídico definitivo não sai sem
revisão apropriada. O texto acima é requisito de conteúdo, não redação final.

## 7. Prazo

`DECISÃO FECHADA` — separar sempre **prazo de preparação da Reverá** do
**prazo estimado da transportadora**. Nunca prometer data de entrega
absoluta em envio internacional; o desembaraço aduaneiro pode afetar o prazo.

`PARCIALMENTE IMPLEMENTADO` (28/08/2026) — o prazo da TRANSPORTADORA vive
na cotação (eta min/máx) e a tela diz explicitamente que ele "não inclui o
tempo de preparação nem o desembaraço aduaneiro". O prazo de PREPARAÇÃO da
Reverá continua sem número — `DEPENDE DE DECISÃO COMERCIAL`.

## 8. Admin → Vendas: bloco "Envio internacional"

`JÁ IMPLEMENTADO` (base) — a central de vendas já filtra por origem
(brasil/internacional), país e moeda; o pedido já guarda moeda, câmbio
(taxa, fonte, data) e `export_status` com rótulo em linguagem de operação.

`JÁ IMPLEMENTADO` (base, 28/08/2026) — o detalhe internacional mostra
gateway (stripe), frete cobrado, moeda, destino formatado por país,
checklist com NF-e/Invoice/DHL `NÃO CONFIGURADO` e o SuperFrete bloqueado
para destino estrangeiro (tela E servidor). A cotação usada está GRAVADA no
pedido (`intl_shipping_quote_id`); exibi-la com data na tela do pedido é
refinamento pendente. Documentação e rastreio seguem com o checklist até as
fases DHL/fiscal.

## 9. Preparar para DAP/DDP sem oferecer

`DECISÃO FECHADA` — a arquitetura pode prever modalidades diferentes, mas:
**não oferecer DDP agora; não marcar DAP como decisão fiscal definitiva; não
inventar cálculo de duties/taxes.** Preparar significa: a modalidade é um
campo da cotação/pedido (item 2), não um if espalhado — e nada mais.

## 10. Regra principal

**Não transformar hipótese em funcionalidade pronta.** Este documento é a
fronteira: o que está `JÁ IMPLEMENTADO` existe com commit e teste; todo o
resto é planejamento etiquetado com sua dependência real. Quando algo mudar
de etiqueta, atualizar aqui na mesma entrega.

---

## Pendências que ESTE registro fez surgir

1. **Gateway internacional** (item 0) — decisão comercial que destrava tudo.
2. **Valor declarado/seguro por pedido** — a referência de R$ 1.000 não
   cobre nem 2 peças; a estrutura de cotação precisa do campo.
3. **Limiar de US$ 1.000, DRE × DU-E, RADAR e demais obrigações
   aduaneiras** — `DEPENDE DE VALIDAÇÃO FISCAL / CONTADOR / DHL`. A
   pesquisa de 27/08 indicou que até US$ 1.000 a declaração (DRE) pode ser
   registrada pelo próprio courier, e acima disso entraria DU-E — mas isso
   é **leitura preliminar de norma, não regra comercial fechada**. Nada
   disso está validado formalmente, e **nenhum código deve tomar decisão de
   DRE/DU-E automaticamente** até a validação com contador e com a DHL.
   O que a operação precisa saber desde já: **10 peças a R$ 600 já passam
   de US$ 1.000**, então o limiar — seja qual for sua forma validada — vai
   aparecer na prática.
4. **Conta DHL Express + acesso à API** — confirmar com a DHL. `DEPENDE DA DHL`.
5. **Texto jurídico do aceite** — revisão apropriada antes de publicar.
6. **Prazo de preparação da Reverá** — definir o número (dias úteis) antes
   de exibir qualquer prazo composto. `DEPENDE DE DECISÃO COMERCIAL`.

## Conflitos verificados contra o código (27/08/2026)

- **Nenhum conflito estrutural.** A mensagem do Francisco e o que já foi
  construído apontam na mesma direção; nada precisa ser desfeito.
- Três pontos de atenção, não conflitos: `tax_cents` já existe e deve
  continuar 0 (item 4); peso em **gramas** na cotação, nunca kg (item 2);
  `ready_for_dispatch` já pressupõe "levar à DHL" — se um dia houver coleta
  pela DHL, o rótulo muda junto.
