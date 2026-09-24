# Auditoria DHL/frete - melhorias seguras enquanto aguardamos retorno

Responsavel: Codex  
Data: 2026-09-24  
Escopo: frete nacional, frete internacional, checkout e atendimento quando a DHL/SuperFrete nao consegue cotar.

## Conclusao executiva

Enquanto a DHL nao entrega um atendimento/API confiavel, a Revera deve melhorar a experiencia sem transformar estimativa em promessa de entrega. A regra correta continua sendo: **sem frete valido, nao cria cobranca**.

Nota atual da estrutura de frete: **7,5/10**.

O sistema ja esta seguro: recalcula frete no servidor, divide pedido grande em remessas nacionais quando necessario, bloqueia pagamento sem cotacao e envia o cliente para WhatsApp quando a cotacao real falha. O ganho agora vem de operacao e clareza: diagnostico, fila de cotacao manual, registro melhor das falhas e textos que nao prometem o que a transportadora ainda nao confirmou.

## O que nao devemos fazer

- Nao cobrar frete estimado como se fosse frete final sem tabela aprovada.
- Nao cotar FedEx e entregar DHL automaticamente sem margem documentada.
- Nao liberar internacional por pais inteiro quando a cotacao foi feita para uma cidade/servico especifico.
- Nao criar pedido pago sem `shipping_cents` confiavel.
- Nao mexer no `Purchase` do pixel: compra so deve nascer depois do pagamento confirmado.

## Melhorias seguras para implementar

### 1. Copy de falha de frete mais honesta

Status: implementado nesta auditoria.

Quando a cotacao previa falha, a tela agora nao promete que o cliente "pode finalizar" normalmente. Ela informa que o sistema vai tentar recotar antes do pagamento e que, se continuar indisponivel, encaminha para atendimento sem cobranca.

Impacto: reduz frustracao e protege a promessa comercial.

### 2. Comentario tecnico atualizado

Status: implementado nesta auditoria.

A rota `/api/frete` agora documenta o comportamento real: falha de cotacao e resposta legitima da rota, mas o pedido so nasce se `actions.ts` conseguir uma cotacao valida no servidor.

Impacto: evita que manutencao futura reintroduza frete zero ou "combina depois".

### 3. Painel de diagnostico de frete

Status: recomendado.

Criar no admin um bloco read-only com:

- provider nacional ativo;
- CEP de origem configurado;
- ultima cotacao bem-sucedida;
- ultimas falhas por CEP/quantidade/valor declarado;
- motivo da falha retornado pela transportadora;
- teste manual de cotacao por CEP sem criar pedido.

Impacto: atendimento descobre em segundos se o problema e CEP, seguro, API ou configuracao.

### 4. Fila de cotacao manual internacional

Status: recomendado.

Quando o destino internacional nao tem cotacao vigente, o site deve capturar interesse sem cobrar:

- pais;
- cidade/regiao/codigo postal;
- itens da sacola;
- nome, telefone e email;
- origem da campanha;
- status `cotacao_manual_pendente`.

Depois a equipe cadastra a cotacao aprovada em `intl_shipping_quotes`; so entao o cliente recebe link seguro para concluir.

Impacto: salva demanda internacional sem arriscar prejuizo de frete.

### 5. Tabela operacional de margem por zona

Status: recomendado como decisao comercial.

Se a operacao quiser usar FedEx como referencia enquanto entrega DHL, precisa de tabela por zona com margem, validade e excecoes. Exemplo:

- America Latina;
- Estados Unidos/Canada;
- Europa;
- Asia/Oceania;
- destinos bloqueados.

Essa tabela nao deve entrar no checkout automatico ate ser aprovada.

Impacto: permite simulacao interna sem prometer preco errado ao comprador.

## Prioridade recomendada

1. Manter a melhoria de texto e comentario ja aplicada.
2. Criar painel de diagnostico de frete.
3. Criar fila de cotacao manual internacional.
4. So depois discutir tabela estimada FedEx/DHL com margem.

## Nota final

O caminho certo nao e esperar a DHL de bracos cruzados, mas tambem nao e improvisar frete. A Revera deve capturar o cliente, explicar que nao houve cobranca, levar para atendimento com contexto e so abrir pagamento quando o envio estiver definido.
