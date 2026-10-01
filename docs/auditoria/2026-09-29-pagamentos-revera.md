# Auditoria de pagamentos da Revera - 2026-09-29

## Estado publicado em `HEAD/main`

- Checkout nacional: ativo pelo provider configurado em `REVERA_PAYMENT_PROVIDER` ou `PAYMENT_PROVIDER`.
- Stripe: implementada para internacional e para a opção nacional "Apple Pay, Google Pay ou cartão pela Stripe".
- Webhook Stripe: assinado por `STRIPE_WEBHOOK_SECRET`, com tolerância de replay e reconfirmação no gateway antes de marcar pedido como pago.
- Purchase Meta/Google: continua saindo somente depois de `confirmarPagamento()` transicionar o pedido para pago.
- Recuperação: existe trava de uma cobrança pendente por pedido; tentativa ambígua preserva reserva em vez de criar segundo link.

## Estado WIP local

- PayPal existe como adapter local, mas não está pronto para produção.
- O adapter cria orders internacionais e consegue confirmar/capturar uma order aprovada.
- O bug conhecido de `PAYMENT.CAPTURE.COMPLETED` sem `resource.custom_id` foi coberto: o parser agora preserva o `supplementary_data.related_ids.order_id` como `transactionId`, permitindo resolver o pedido pela linha `payments.provider_payment_id`.
- A rota pública só considera PayPal se `PAYPAL_CHECKOUT_ENABLED=1`, `PAYPAL_WEBHOOK_ENABLED=1` e `REVERA_INTERNATIONAL_PAYMENT_PROVIDER=paypal`. Sem isso, PayPal permanece fora do checkout e do roteamento público.

## Configuração Vercel esperada

Não registrar valores em documento ou chat. Conferir apenas nomes:

- `REVERA_PAYMENT_PROVIDER` ou `PAYMENT_PROVIDER`
- `PAYMENT_WEBHOOK_SECRET`
- `ASAAS_API_KEY` e/ou credenciais do provider nacional em uso
- `ASAAS_WEBHOOK_AUTH_TOKEN`, se Asaas for usado
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `REVERA_APPLE_PAY_ENABLED`
- `PAYPAL_CHECKOUT_ENABLED` e `PAYPAL_WEBHOOK_ENABLED`, ambos ausentes ou diferentes de `1` enquanto PayPal estiver em WIP
- `NEXT_PUBLIC_SITE_URL`
- variáveis de tracking Meta/Google já usadas pelo projeto

## Apple Pay / Google Pay via Stripe

A opção do checkout aparece somente quando:

1. `REVERA_APPLE_PAY_ENABLED=1`;
2. `STRIPE_SECRET_KEY` existe e é do ambiente certo;
3. `STRIPE_WEBHOOK_SECRET` existe;
4. a API `/v1/account` da Stripe responde com `charges_enabled=true` e `card_payments=active`.

Mesmo aparecendo no site, Apple Pay ou Google Pay dependem do navegador, dispositivo, carteira configurada e domínio validado na Stripe. Quando não houver suporte no dispositivo, o Stripe Checkout mantém cartão como alternativa.

Passos externos no painel Stripe:

1. Confirmar que a conta live da Revera está ativa para cobrança.
2. Confirmar o domínio `www.reveraprotesecapilar.com` em Payments > Payment method domains.
3. Conferir que Link/Apple Pay/Google Pay estão habilitados conforme disponibilidade da conta.
4. Criar webhook live para `https://www.reveraprotesecapilar.com/api/webhooks/stripe/<HASH_DO_PAYMENT_WEBHOOK_SECRET>`.
5. Assinar pelo menos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` e `charge.refunded`.

## Stripe

Pronto no código, condicionado ao painel e às variáveis:

- BRL só vai para Stripe quando `payment_preference` é `apple_pay`.
- Internacional continua usando Stripe por padrão.
- `amount`, `currency` e `order_id` são reconferidos antes de aprovar.
- Retorno do cliente e webhook cobrem um ao outro.
- Chave live fora de produção e chave test em produção são recusadas.

## PayPal

Atualizado em 30/09/2026: integração preparada para ativação em produção.

Motivos:

- A assinatura do webhook é conferida pela API oficial antes de processar o evento.
- A rota pública mantém PayPal desligado por padrão via `PAYPAL_WEBHOOK_ENABLED`.
- O checkout mantém PayPal desligado por padrão via `PAYPAL_CHECKOUT_ENABLED`.
- A ativação exige `PAYPAL_CHECKOUT_ENABLED=1`, `PAYPAL_WEBHOOK_ENABLED=1`, `PAYPAL_WEBHOOK_ID`, credenciais Live e `REVERA_INTERNATIONAL_PAYMENT_PROVIDER=paypal`.
- O app Live deve assinar `CHECKOUT.ORDER.APPROVED` e `PAYMENT.CAPTURE.COMPLETED`.
- Links `payer-action` e `approve` são aceitos; a página exige ID de pagamento persistido antes de redirecionar novas cobranças PayPal.
- A criação de ordem Live sem pagamento e a autenticação foram verificadas. A compra aprovada/capturada de ponta a ponta ainda depende de uma compra real de comprador externo.

## Falha e recuperação

Estados existentes na tela de pagamento:

- `metodo_indisponivel`
- `em_preparacao`
- `reserva_travada`
- `internacional_indisponivel`
- `link_bloqueado`
- `erro_tecnico`

Regra principal: nova tentativa só deve criar cobrança quando não existir reserva pendente segura para o pedido. Reserva ambígua fica preservada para evitar cobrança duplicada.
