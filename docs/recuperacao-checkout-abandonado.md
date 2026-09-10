# Recuperação de checkout abandonado

O cron existente (`/api/cron/carrinho-abandonado`, a cada 15 minutos) agora
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
2. Na Clint, envie para aprovação dois templates de **Marketing**, sem
   variáveis, links ou códigos:

   - Primeiro (`revera_pagamento_ajuda_1`): `Olá! Notamos que seu pedido da Reverá ainda aguarda a finalização do pagamento. Se precisar de ajuda para concluir, responda a esta mensagem. Estamos aqui para ajudar.`
   - Último (`revera_pagamento_ajuda_2`): `Olá! Seu pedido da Reverá continua aguardando pagamento. Se quiser concluir ou tiver alguma dúvida, responda a esta mensagem. Nossa equipe está à disposição para ajudar.`

3. Guarde somente os IDs dos templates no cofre e exporte para a produção:

   - `CLINT_TEMPLATE_CARRINHO_PRIMEIRO_ID`
   - `CLINT_TEMPLATE_CARRINHO_ULTIMO_ID`
   - `CRON_SECRET`
   - variáveis já usadas pelo canal da Clint: `WHATSAPP_PROVIDER=clint`,
     `CLINT_API_TOKEN` e `CLINT_CANAL_ID`.

Os padrões são `CARRINHO_ESPERA_MINUTOS=20` e
`CARRINHO_SEGUNDO_LEMBRETE_HORAS=24`. Os demais tetos e o horário comercial
continuam configuráveis pelas variáveis já existentes.

O `vercel.json` já agenda a rota a cada 15 minutos. Esse intervalo exige um
plano Vercel que suporte crons subdiários; no Hobby, a Vercel limita crons a
uma execução diária e não atende ao objetivo de 20 minutos.
