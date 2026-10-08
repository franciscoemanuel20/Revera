-- Rollback seguro da 40: não remove a função nem o trigger de proteção.
-- Desligue DHL_SHIPMENT_CREATION_ENABLED no deploy anterior. Remessas já
-- criadas mantêm snapshot, documentos e modo da invoice imutáveis.
do $$ begin
  if not exists(select 1 from pg_trigger where tgname = 'export_freeze_shipment_invoice_mode_trigger'
    and not tgisinternal) then
    raise exception 'Trava de remessas DHL ausente: rollback inseguro';
  end if;
end $$;
