# ADR-014: Checkout internacional multigateway e expedição DHL no monólito
Data: 2026-10-07 · Status: aceito

## Contexto
O checkout internacional já cota DHL em produção e confirma pagamentos por duas
portas, mas escolhe um único gateway global por variável de ambiente e depende
do MyDHL+ manual para expedir. A auditoria encontrou abandono sem causa
observável, nenhuma recuperação internacional e dados fiscais/físicos ausentes
para criar remessas com segurança. A operação é pequena e já usa Next.js +
Supabase; criar outro serviço aumentaria o custo sem reduzir acoplamento real.

## Decisão
Manter o fluxo no monólito e adicionar três fronteiras internas: eventos de
jornada de pagamento, recuperação internacional somente em prévia e expedição
MyDHL. O pedido guarda a escolha do gateway; Stripe só aparece quando uma conta
live confirma cobrança e repasse, e PayPal permanece alternativa. A criação de
remessa DHL falha fechada enquanto exportador e dados aduaneiros/físicos não
estiverem completos.

## Alternativas descartadas
- Trocar PayPal por Stripe globalmente por variável: descartada porque impede
  fallback do comprador e a Stripe live ainda não está validada.
- Gerar etiqueta automaticamente no webhook de pagamento: descartada porque
  gasta dinheiro, pode faltar embalagem real e coloca I/O DHL no caminho crítico
  da confirmação financeira.
- Serviço separado de logística: descartado porque o volume atual não justifica
  outro deploy, credenciais e observabilidade.

## Consequências
- Positivas: funil auditável; escolha explícita e segura de gateway; recuperação
  sem envio acidental; etiqueta idempotente no painel quando os dados existirem.
- Negativas/custos aceitos: novas tabelas/colunas aditivas; operador ainda precisa
  acionar a etiqueta; Stripe e DHL dependem de habilitação externa.
- Contratos afetados: `orders.payment_preference`; eventos de jornada; metadados
  aduaneiros da variante; configuração singleton do exportador; adapter MyDHL
  para `POST /shipments`.

## Plano de rollback
Desligar Stripe e criação DHL por feature flags; o PayPal configurado e o registro
manual de guia continuam funcionando. As mudanças de schema são aditivas e podem
ficar sem leitores durante rollback do código; nenhuma coluna existente é
removida e nenhum dado histórico é reescrito.
