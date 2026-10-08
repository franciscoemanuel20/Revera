-- Rollback operacional compatível com a versão do aplicativo anterior à 36.
-- A versão anterior grava o primeiro request_snapshot e respostas incertas
-- com a sessão administrativa. Por isso a trava nova de shipments precisa
-- sair junto com o rollback do aplicativo; mantê-la impediria toda etiqueta.
drop trigger if exists export_freeze_shipment_invoice_mode_trigger on shipments;
drop function if exists export_freeze_shipment_invoice_mode();

-- Desativa novas recuperações manuais, preservando os registros e PDFs já
-- vinculados. A conferência documental existente continua disponível.
revoke execute on function register_manual_dhl_invoice(uuid,text,text,text)
  from authenticated;

comment on function register_manual_dhl_invoice(uuid,text,text,text) is
  'Recuperação MyDHL desativada pelo rollback operacional da migration 36; dados e travas de despacho preservados.';
