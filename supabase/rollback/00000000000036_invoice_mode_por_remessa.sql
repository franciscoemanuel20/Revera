-- Rollback operacional compatível com remessas já existentes.
-- Desativa novas recuperações manuais. A trava fiscal por remessa, a proteção
-- do PDF e a leitura de provas existentes permanecem: removê-las faria o
-- despacho voltar a depender do modo global atual e invalidaria pedidos.
-- O aplicativo deve ser revertido junto com esta revogação.
revoke execute on function register_manual_dhl_invoice(uuid,text,text,text)
  from authenticated;

comment on function register_manual_dhl_invoice(uuid,text,text,text) is
  'Recuperação MyDHL desativada pelo rollback operacional da migration 36; dados e travas de despacho preservados.';
