-- Preserve a separação fiscal no rollback e mantenha emissão/DHL desligadas.
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='focus_shipping_environment_order' and not tgisinternal)
    or not exists(select 1 from pg_trigger where tgname='focus_shipping_environment_shipment' and not tgisinternal) then
    raise exception 'Rollback inseguro: guarda de ambiente fiscal ausente';
  end if;
end $$;
