-- Complementa as travas36/41 sem substituir a validação Focus em andamento.
create or replace function public.export_require_single_dispatch_shipment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.shipping_status in ('shipped','delivered') and new.shipping_status is distinct from old.shipping_status
    and exists(select 1 from addresses where id=new.address_id and country <> 'BR')
    and (select count(*) from shipments where order_id=new.id and provider='dhl'
      and status in ('label_created','registrado_manual')) <> 1 then
    raise exception 'Despacho exige uma única remessa DHL finalizada; reconcilie remessas ambíguas';
  end if;
  return new;
end $$;
create trigger export_single_dispatch_shipment before update of shipping_status on orders
  for each row execute function public.export_require_single_dispatch_shipment();
