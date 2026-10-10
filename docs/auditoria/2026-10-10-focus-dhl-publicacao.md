# Focus NFe + DHL — preparação para publicação

## Estado em 10/10/2026

- Branch: `feat/focus-nfe-dhl-20261007`, base de continuidade `47bae8b`.
- Suíte sobre o diff final: 942 testes, 85 arquivos aprovados.
- Typecheck, build e verificação de segredos aprovados sobre o diff final.
- Revisão adversarial independente pelo Codex CLI encerrada sem achados
  concretos no diff `origin/main...HEAD` e nas alterações locais finais.
  O wrapper do plugin não saiu de `starting`; essa execução foi cancelada
  e substituída pela CLI autenticada.
- Staging confirmado no painel: `dpeluxmzuuijuveesgtu` (REVERA-STAGING).
- Produção: `ngnaemfiytutyplolgxb` (REVERA).
- Teste vivo das constraints existentes: 47 verificações aprovadas;
  seis clientes fictícios e seus registros dependentes limpos ao final.
- Bucket `export-documents` de staging confirmado privado.
- Novas tabelas Focus e fatos físicos indisponíveis via REST em staging.
- Nenhuma migração aplicada nesta execução; fluxo fiscal completo ainda
  não homologado. Não fazer merge/deploy de produção antes desse gate.

## Correções desta execução

- Recuperação idempotente do vínculo da NF-e com o pedido: falha de insert
  passa a ser reportada e consulta posterior pode reparar o vínculo.
- Documentos divergentes não são sobrescritos. Insert concorrente só é
  aceito se referência, origem e caminho forem iguais.
- Persistência dos caminhos exige autorização, chave e nonce da consulta atual.
- Cancelamento detectado em consulta exige nonce atual e linha atualizada;
  teste comprova que resposta antiga não cancela confirmação mais nova.
- Teste vivo suporta chave opaca atual do Supabase, com alvo de staging
  fixado, chave diferente de produção e leitura autenticada antes de escrever.

## Cofre e configuração

Política localizada em `~/.claude/secrets/README.md`; o caminho antigo
`~/.Codex/secrets/README.md` não existe nesta máquina.

`revera stg DATABASE_URL` continua ausente. Importação Vercel não recuperou
uma conexão nova. CLI Supabase não autenticada; painel autenticado mostra
conexão com placeholder de senha. Alteração de senha exige execução humana
pela política de controle do navegador.

Configuração gravada no Doppler staging, ainda sem exportação Vercel:

- `FOCUS_NFE_AMBIENTE=homologacao`
- `FOCUS_NFE_ISSUANCE_ENABLED=0`
- `FOCUS_NFE_PRODUCTION_APPROVED=0`
- `REVERA_PAYMENT_PROVIDER=mock`

Configuração existente conferida: `DHL_AMBIENTE=sandbox`, criação DHL e
aprovação de produção desligadas. `verify:deploy` via cofre staging aprovado.

Produção conferida por leitura do cofre: variáveis Focus ainda ausentes
(runtime recusa emissão por padrão); criação de remessa DHL em `0`.

## Pedido da Alemanha

`REV-7DA5CEBF` (`2c4d3a59-0c6e-453d-b5af-78c10cd8c120`): consulta de produção
confirmou pagamento `paid`, ausência de cancelamento e nenhuma remessa.
Tabela de fatos físicos ainda indisponível em produção. O script
`supabase/aplicar/PREPARAR-REV-7DA5CEBF.sql` não foi executado.

Antes de despachar: dados fiscais e emitente validados pelo contador,
tratamento de frete/desconto e câmbio, pacote final medido, documentação
aduaneira apropriada conferida e confirmações específicas de emissão e etiqueta.

## Próximos gates

1. Guardar conexão PostgreSQL de staging no cofre, sem expor senha.
2. Conferir histórico real de schema; aplicar migrações pendentes e deltas
   na ordem correta, sem repetir policies/triggers já existentes.
3. Testar migrações 39–41 e rollback operacional contra staging.
4. Homologar Focus e DHL com fixtures/mocks, sem NF-e ou etiqueta real.
5. Repetir revisão se a homologação exigir novas mudanças de código.
6. Promover schema, integrar main e verificar deploy com emissão desligada.

Nenhuma NF-e real, etiqueta cobrável ou comunicação ao cliente foi criada.
