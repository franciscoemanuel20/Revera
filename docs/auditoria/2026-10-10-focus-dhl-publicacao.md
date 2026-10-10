# Focus NFe + DHL — validação e publicação

## Validação em 10/10/2026

Continuidade de `47bae8b` na branch `feat/focus-nfe-dhl-20261007`.
`origin/main` (`fd6ab20`) incorporada preservando as correções de confirmação
permanente ao cliente. Código final validado: `0071737`.

- Suíte completa: 1.020 testes em 92 arquivos aprovados.
- Typecheck, build e verificação de segredos aprovados.
- Revisão adversarial independente pelo Codex CLI, modelo gpt-6.1-sol:
  **Approve**, sem achados relevantes após as correções finais. A revisão
  executou também 52 testes fiscais/de exportação dirigidos.
- Staging: 47 verificações do teste vivo e 21 verificações PostgreSQL do
  fluxo fiscal; fixtures exclusivamente fictícias. Fixtures fiscais em
  transação revertida; fixtures do site limpas ao final.
- Testes cobrem idempotência, timeout/resposta ambígua, reconciliação,
  snapshots imutáveis, ambiente fiscal, documentos privados, concorrência,
  consulta fiscal recente e prevenção de duplicidade DHL.
- Rollbacks operacionais 39–42 verificados em staging: preservam dados e
  bloqueios, com emissão e criação DHL desabilitadas.

## Correções desta execução

- `c0fbce3`: recuperação idempotente do vínculo de documento Focus, falhas
  de insert explícitas, proteção contra caminhos e cancelamentos obsoletos.
- `e9d62f5`: merge de main preservando mudanças posteriores.
- `9f87aeb`: ambiente fiscal compatível com o despacho, guarda PostgreSQL
  da migração 42 e proteção contra resposta inicial tardia do POST.
- `0071737`: renovar consulta Focus antes de registrar entrega internacional,
  evitando bloquear entregas dias depois do despacho; falha impede UPDATE.

## Migrações e ambientes

- Staging `dpeluxmzuuijuveesgtu`: aplicadas 37, 38, 39, 40, 41, 42, 43 e 44.
  A 36 já existia; sua estrutura foi conferida. Política fiscal da 42
  configurada explicitamente como `homologacao`.
- Produção `ngnaemfiytutyplolgxb`: aplicadas 36, 37, 38, 39, 40, 41 e 42.
  As 43 e 44 já existiam e foram preservadas. Política fiscal `producao`.
- Migrações aplicadas em transações e verificadas pelo schema real; não se
  repetiram triggers/policies existentes. Bucket `export-documents` privado.

## Cofre e configuração

Política localizada em `~/.claude/secrets/README.md`; o caminho antigo
`~/.Codex/secrets/README.md` não existe nesta máquina. Conexão PostgreSQL
staging guardada no Doppler após o proprietário salvar a senha; conexão
validada sem exposição de valores.

- Staging: Focus homologação, pagamento mock, DHL sandbox, emissão Focus
  e criação DHL desligadas; configuração instalada na Vercel.
- Produção: Focus produção, `FOCUS_NFE_ISSUANCE_ENABLED=0`,
  `FOCUS_NFE_PRODUCTION_APPROVED=0`, `DHL_SHIPMENT_CREATION_ENABLED=0`.
  Token Focus instalado como sensitive; verify:deploy aprovado pelo cofre.
- Smoke autenticado de staging: site, configuração internacional e painel
  fiscal do pedido fictício retornaram HTTP 200 e exibiram os bloqueios.
- Código final publicado por push de `main`, commit `121ea74`, deploy
  `dpl_D6ChXwV38W29vRWeCKH3vzdn1CgE`, estado READY. Proveniência confirmou
  clone Git desse SHA no domínio `www.reveraprotesecapilar.com`.
- Produção: home, checkout e login HTTP 200; documento fiscal sem sessão
  HTTP 403. Smoke autenticado: configuração internacional e pedido alemão
  HTTP 200; sequência fiscal visível, WAITING_FOR_OWNER e emissão Focus
  desabilitada confirmados no HTML do painel.
- Staging final: deploy `dpl_76zZsunZ75jt3jneWrGEdwDnP8pH`, READY;
  comparação de conteúdo com `0071737`: 566 arquivos iguais, nenhuma
  divergência ou arquivo adicional. Home e dois painéis HTTP 200.
- Este registro final acrescenta somente documentação ao código validado.

## Pedido da Alemanha — WAITING_FOR_OWNER

`REV-7DA5CEBF` (`2c4d3a59-0c6e-453d-b5af-78c10cd8c120`): pagamento PayPal
confirmado, sem cancelamento e sem remessa. Já existem documentos manuais
`nfe` e `invoice`, pendentes e externos, anteriores à integração.

A tentativa de gravar os fatos físicos fornecidos com
`supabase/aplicar/PREPARAR-REV-7DA5CEBF.sql` foi integralmente revertida pela
trava de imutabilidade após documento/remessa. Nenhum fato foi parcialmente
persistido. Não remover documentos nem contornar a trava sem reconciliar
fiscalmente sua existência.

Pendências para despachar:

1. Responsável fiscal deve reconciliar a NF-e e invoice manuais pendentes:
   confirmar se são reais, seus dados e o tratamento correto antes de criar
   novo snapshot ou documento Focus.
2. Confirmar emitente/exportador, natureza da operação, CFOP, tributação,
   numeração e demais parâmetros fiscais com o contador.
3. Validar itens, valores em BRL, câmbio/data/fonte, rateio de frete/desconto
   e declaração/documentação aduaneira apropriada.
4. Medir peso bruto e dimensões finais do pacote, confirmar incoterm e
   demais dados aduaneiros. Os fatos líquidos informados não substituem o
   pacote final: prótese 75 g, 16 × 5 × 11 cm, NCM 67042000/HS 670420/BR;
   fita 138 g, 11 × 11 × 2,5 cm, NCM/HS 39191000/BR.
5. Após esses dados, obter confirmação específica para emissão real e para
   etiqueta cobrável. Comunicação permanece como rascunho preparado.

Nenhuma NF-e real, etiqueta cobrável ou comunicação ao cliente foi criada
nesta execução. Nenhum campo fiscal ou medida final foi inventado.
