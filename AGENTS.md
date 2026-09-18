# Trava da configuração atual da Revera

Definida pelo Francisco em 16/09/2026.

A configuração atual da Revera está considerada correta e congelada. Daqui em
diante, qualquer atualização pode evoluir o sistema, mas não pode mexer na
configuração atual sem validar a senha de mudança.

Isto vale para:

- código de checkout, pagamento, pedido, webhook, frete, rastreamento ou admin;
- variáveis de ambiente, segredos, Vercel, Supabase, Stripe, Asaas ou gateway;
- deploy, rollback, migração, seed, script operacional ou configuração;
- qualquer mudança que possa alterar preço, cobrança, confirmação de pedido,
  entrega, evento de conversão, disponibilidade da loja ou acesso ao painel.

Regra principal: se a alteração tocar, substituir, remover, renomear ou
republicar qualquer configuração que hoje mantém a Revera funcionando, pare e
valide a senha antes. Isso inclui mudanças aparentemente pequenas em env,
provider, URL, webhook, domínio, build/deploy, scripts de verificação ou
qualquer valor operacional de produção.

Se a alteração não mexe na configuração atual, siga normalmente e preserve a
configuração existente.

Fluxo obrigatório:

1. Peça para o Francisco copiar a senha, sem escrever no chat.
2. Rode `secret run revera prd -- npm run guard:system-change`.
3. Só continue se o script responder que a senha foi validada.

Nunca grave a senha em chat, commit, log, Markdown, variável impressa ou
argumento de comando. A senha fica no cofre como `REVERA_SYSTEM_CHANGE_PASSWORD`.

Se a mudança for apenas leitura, diagnóstico ou explicação sem alterar estado,
não precisa validar senha.
