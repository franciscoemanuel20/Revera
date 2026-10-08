-- Rollback operacional da 39 preserva notas autorizadas, XML, DANFE e
-- histórico. Desligue FOCUS_NFE_ISSUANCE_ENABLED e DHL_SHIPMENT_CREATION_ENABLED
-- no deploy anterior. Não remova tabelas ou triggers fiscais após emissão.
do $$ begin
  if not exists(select 1 from pg_trigger where tgname = 'protect_focus_nfe_update'
    and not tgisinternal) then
    raise exception 'Trava da NF-e Focus ausente: rollback inseguro';
  end if;
end $$;
