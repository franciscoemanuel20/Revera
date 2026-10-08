-- Rollback operacional: desligue FOCUS_NFE_ISSUANCE_ENABLED e
-- DHL_SHIPMENT_CREATION_ENABLED na versão anterior. Preserve esta função e
-- o trigger para que nenhuma atualização direta ou código antigo despache
-- uma exportação sem NF-e Focus autorizada.
do $$ begin
  if not exists(select 1 from pg_trigger where tgname = 'guard_focus_dhl_reservation'
    and not tgisinternal) then
    raise exception 'Trava fiscal da remessa ausente: rollback inseguro';
  end if;
end $$;
