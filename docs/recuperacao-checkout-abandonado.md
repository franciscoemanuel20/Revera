# Recuperação de checkout abandonado

O cron existente (`/api/cron/carrinho-abandonado`, a cada 20 minutos) agora
recupera somente pedidos nacionais que ainda estejam com `payment_status =
'pending'` e sem cancelamento.

## Sequência

1. Aos 20 minutos, envia o primeiro aviso.
2. Após 24 horas do primeiro envio confirmado, envia um último lembrete.
3. Cada etapa reserva uma linha própria em `order_notifications`; por isso
   nenhuma execução concorrente consegue enviar duas vezes a mesma etapa.
4. Imediatamente antes de reservar, a rotina relê o pedido. Pago, cancelado
   ou com uma compra posterior da mesma pessoa não recebe mensagem.

O aviso de WhatsApp é intencionalmente sem link, código ou campo variável.
Ele orienta a pessoa a responder diretamente à equipe. A página de pedido
continua permitindo retomar com segurança o checkout já existente, sem criar
uma segunda cobrança.

## Publicação

1. Aplique `supabase/migrations/00000000000021_recuperacao_checkout_segundo_lembrete.sql`
   (ou `supabase/aplicar/RECUPERACAO-CHECKOUT-21.sql`) antes do deploy.
2. Na Clint, use dois templates de **Utility**, sem
   variáveis, links ou códigos:

   - Primeiro (`revera_pagamento_utilidade_1a`): `Status do seu pedido na Reverá: aguardando pagamento. Responda esta mensagem para concluir. Se o pagamento já foi feito, desconsidere.`
   - Último (`revera_pagamento_utilidade_2a`): `Status do seu pedido na Reverá: pagamento pendente. Responda esta mensagem para concluir. Se o pagamento já foi feito, desconsidere.`

3. Guarde somente os IDs dos templates no cofre e exporte para a produção:

   - `CLINT_TEMPLATE_CARRINHO_PRIMEIRO_ID`
   - `CLINT_TEMPLATE_CARRINHO_ULTIMO_ID`
   - `CRON_SECRET`
   - variáveis já usadas pelo canal da Clint: `WHATSAPP_PROVIDER=clint`,
     `CLINT_API_TOKEN` e `CLINT_CANAL_ID`.

Os padrões são `CARRINHO_ESPERA_MINUTOS=20` e
`CARRINHO_SEGUNDO_LEMBRETE_HORAS=24`. Os demais tetos e o horário comercial
continuam configuráveis pelas variáveis já existentes.

O `vercel.json` já agenda a rota a cada 20 minutos. Esse intervalo exige um
plano Vercel que suporte crons subdiários; no Hobby, a Vercel limita crons a
uma execução diária e não atende ao objetivo de 20 minutos.
