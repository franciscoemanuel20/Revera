# Expansão internacional — 10/09/2026

## Preços e critérios

24 variantes ativas de 7 produtos, com 120 preços ativos nas cinco moedas.
Base: preços BRL ativos no banco de produção. Fonte cambial: fechamento
PTAX de 10/09/2026, Banco Central, lado compra (BRL por unidade estrangeira):
USD 5,1143; EUR 5,9469; GBP 6,9196; AUD 3,6664; CAD 3,7036.

- Fonte: https://ptax.bcb.gov.br/ptax_internet/consultarTodasAsMoedas.do?method=consultaTodasMoedas
- API: https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/
- Referência tarifária: https://stripe.com/br/pricing — 3,99% + 2% internacional + R$0,39.
- Fórmula: arredondar para unidade inteira superior `(base BRL + 0,39) / 0,9401 / PTAX compra`, sem reduzir preço anterior.
- Cada registro mantém base, data, fonte e premissas em `pricing_basis`.
- É uma proteção de referência: câmbio e tarifas efetivos de liquidação podem variar. Não representa garantia de margem líquida após impostos, custos de importação ou flutuação cambial.

| Base BRL | USD | EUR | GBP | AUD | CAD |
|---|---:|---:|---:|---:|---:|
| R$650 | 136 | 117 | 100 | 189 | 187 |
| R$700 | 146 | 126 | 108 | 204 | 202 |
| R$750 | 157 | 135 | 116 | 218 | 216 |

## Fretes

Somente cinco países possuem cotação DHL documentada vigente. O custo original
em BRL foi reexpresso com o mesmo câmbio e cobertura percentual; sem duplicar
a tarifa fixa do pagamento. Foram criadas novas versões comerciais, preservando
as versões anteriores e os pedidos que as referenciam. Nenhuma data de cotação
ou validade DHL foi prorrogada.

| País | Frete comercial | Prazo útil | Validade |
|---|---:|---|---|
| Estados Unidos | USD 68 | 4–6 dias | 28/09/2026 |
| Portugal | EUR 76 | 4–6 dias | 02/10/2026 |
| Reino Unido | GBP 65 | 4–6 dias | 02/10/2026 |
| Austrália | AUD 129 | 3–5 dias | 02/10/2026 |
| Canadá | CAD 104 | 5–7 dias | 02/10/2026 |

Evidência anterior: `2026-09-02-cotacoes-pt-gb-au-ca.md` e registros originais
do banco. As cotações são para a embalagem registrada, com limite de 1 kg.
Não foi obtida cotação para os outros 21 países. A tentativa no MyDHL para
Espanha não retornou tarifa; não há credencial de API DHL no cofre de produção.
Não foi presumido preço de frete para liberar esses países.

## Validação antes da publicação

- 559 testes aprovados em 38 arquivos, incluindo os 26 destinos, idioma/moeda,
  endereço, DDI, código postal obrigatório e exceção AE, conversão, proteção de
  redirecionamento, catálogo incompleto e preservação de frete de pedidos antigos.
- Revisão adversarial independente: APPROVE após correções e nova revisão.
- Configuração de produção: verificação de deploy seguro aprovada.
- Stripe: conta de produção com cobranças e cartões ativos; webhook habilitado.
- Cinco sessões de produção criadas por API para US/PT/GB/AU/CA e imediatamente
  expiradas, todas sem pagamento. Nenhuma cobrança real executada.
- 26 sessões Stripe de teste criadas e expiradas, com país, idioma e moeda corretos.
  Isso comprova criação de sessão, não autorização real de cartão em cada país.
- Nenhum Checkout manual ou Payment Link criado no painel.

## Matriz de configuração

Todos têm 24/24 preços. “Produção” em pagamento significa sessão criada e
expirada sem cobrança; “Sandbox” significa sessão de teste, não venda real.
Disponibilidade final depende também das verificações de runtime da Stripe,
da validade DHL e da cobertura de todo o catálogo.

| País | Idioma | Moeda | Preços | DHL | Pagamento | Status configurado |
|---|---|---|---|---|---|---|
| Estados Unidos | en | USD | 24/24 | Vigente | Produção | Liberado |
| Canadá | en | CAD | 24/24 | Vigente | Produção | Liberado |
| Portugal | pt | EUR | 24/24 | Vigente | Produção | Liberado |
| Reino Unido | en | GBP | 24/24 | Vigente | Produção | Liberado |
| Espanha | es | EUR | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Austrália | en | AUD | 24/24 | Vigente | Produção | Liberado |
| México | es | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Chile | es | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Argentina | es | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Colômbia | es | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Venezuela | es | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Equador | es | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Guatemala | es | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Panamá | es | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Costa Rica | es | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| República Dominicana | es | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Alemanha | en | EUR | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Holanda | en | EUR | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Irlanda | en | EUR | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Índia | en | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| China | en | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Indonésia | en | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Bangladesh | en | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| África do Sul | en | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Emirados Árabes Unidos | en | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |
| Nova Zelândia | en | USD | 24/24 | Ausente | Sandbox | Bloqueado: sem DHL |

Brasil mantém o fluxo nacional em BRL e o provedor existente. Todas as
próteses e suas variantes mantêm os preços BRL originais.

## Publicação e conferência no domínio

- Código: commit `42ce664`, revisão independente aprovada antes de publicar.
- Build local e build Vercel aprovados; 559 testes verdes. Varredura do bundle
  público não encontrou nomes ou valores sensíveis.
- Deployment `dpl_9gimo5JMoxKPax4VTgWAb4GvjrJJ`, status Ready, produção;
  domínio `https://www.reveraprotesecapilar.com` confirmado como alias.
- Navegador: inclusão de uma Micropele 0,08 cor 1B na sacola, seguida de
  seleção dos cinco destinos liberados. Conferidos idioma, endereço, DDI,
  postal obrigatório, preço, frete, total e bloqueio sem aceite de importação.
  Preenchimento e aceite habilitam continuação. Formulários não enviados.
- Totais para essa peça: US USD204, CA CAD291, PT EUR193, GB GBP165, AU AUD318.
- Brasil: preço original R$650; consulta de CEP e cálculo de frete funcionaram
  (CEP 12216-530: LOGGI R$16,44; total R$666,44 no momento da consulta).
- Todos os 21 destinos sem DHL responderam HTTP 200 com aviso localizado
  explícito de ausência de cotação vigente e sem formulário/botão de pagamento.
- Nenhum pedido pago nem cobrança real foi criado. A confirmação completa de
  pagamento/webhook foi coberta por testes automatizados, não por cartão real.
