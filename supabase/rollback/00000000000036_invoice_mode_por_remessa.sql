-- Rollback operacional seguro para remessas já reconciliadas.
-- Preserve export_freeze_shipment_invoice_mode_trigger: removê-lo permitiria
-- modificar request_snapshot, documentos e modo da invoice já fixados.
-- Ao voltar o aplicativo anterior, desligue DHL_SHIPMENT_CREATION_ENABLED;
-- a versão antiga não usa service_role em todos os passos exigidos pela trava.
-- Remessas existentes continuam consultáveis e as provas ficam imutáveis.
-- Desativa apenas novas recuperações manuais.
revoke execute on function register_manual_dhl_invoice(uuid,text,text,text)
  from authenticated;

comment on function register_manual_dhl_invoice(uuid,text,text,text) is
  'Recuperação MyDHL desativada pelo rollback operacional da migration 36; dados e travas de despacho preservados.';
