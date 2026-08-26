-- Um pedido, uma etiqueta.
--
-- Sem esta restrição, dois cliques em "Gerar etiqueta" (ou duas abas do
-- admin abertas no mesmo pedido) criam DUAS etiquetas na SuperFrete — e cada
-- etiqueta é paga com o saldo da carteira no instante em que é criada. O
-- prejuízo é silencioso: o pedido fica certo na tela, e a segunda etiqueta só
-- aparece na fatura.
--
-- A trava fica no BANCO, e não num `if` no código, pelo mesmo motivo que a
-- deduplicação do Purchase fica (ver pixel_event_log em 00000000000001):
-- um `if` que lê e depois escreve tem uma janela entre as duas operações, e
-- é exatamente nessa janela que o segundo clique entra. Uma constraint não
-- tem janela.
--
-- `unique` em vez de tornar order_id a chave primária: a tabela já tem id
-- próprio, e trocar a PK de uma tabela em produção não vale o ganho.
create unique index if not exists shipments_order_id_unico on shipments (order_id);

comment on index shipments_order_id_unico is
  'Impede etiqueta duplicada para o mesmo pedido. Cada etiqueta criada na SuperFrete é paga na hora com o saldo da carteira — duas etiquetas é dinheiro perdido, não só linha repetida.';
