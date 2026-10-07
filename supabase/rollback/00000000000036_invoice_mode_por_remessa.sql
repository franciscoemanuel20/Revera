-- Restaura a trava anterior; requer revisão dos pedidos em aberto.
drop function if exists reconcile_legacy_shipment_invoice_mode(uuid);
drop trigger if exists export_freeze_shipment_invoice_mode_trigger on shipments;
drop function if exists export_freeze_shipment_invoice_mode();
create or replace function export_require_documents_for_dispatch() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare pais text;
declare total_itens integer;
declare itens_validos integer;
declare itens_invalidos integer;
declare valor_aduaneiro bigint;
declare peso_liquido bigint;
declare pacote record;
declare modo_invoice text;
declare exportador_ok boolean;
begin
  if new.shipping_status not in ('shipped','delivered')
     or new.shipping_status = old.shipping_status then
    return new;
  end if;
  if new.shipping_status = 'delivered' and old.shipping_status <> 'shipped' then
    raise exception 'Entrega exige despacho anterior';
  end if;
  select country into pais from addresses where id = new.address_id;
  if pais is null then raise exception 'Despacho exige destino definido'; end if;
  if pais = 'BR' then return new; end if;
  if new.payment_status <> 'paid' or new.canceled_at is not null then
    raise exception 'Despacho internacional exige pagamento confirmado';
  end if;
  if not exists(
    select 1 from customers c
    join addresses a on a.id = new.address_id
    where c.id = new.customer_id
      and length(trim(coalesce(c.full_name, ''))) > 0
      and length(trim(coalesce(c.email, ''))) > 0
      and length(trim(coalesce(c.phone, ''))) > 0
      and a.country is not null and a.country <> 'BR'
      and length(trim(coalesce(a.city, ''))) > 0
      and length(trim(coalesce(a.line1, ''))) > 0
      and length(trim(coalesce(a.postal_code, ''))) > 0
  ) then
    raise exception 'Despacho internacional exige destinatário e endereço completos';
  end if;
  select count(*) into total_itens from order_items where order_id = new.id;
  select count(*) into itens_validos from order_export_items where order_id = new.id;
  if total_itens = 0 or itens_validos <> total_itens then
    raise exception 'Despacho internacional exige snapshot fiscal de todos os itens';
  end if;

  select count(*) filter (where
           e.order_quantity <> i.quantity
           or e.customs_value_cents % i.quantity <> 0
           or abs(round(e.customs_value_cents * e.fx_rate_brl_per_unit) - e.fiscal_value_brl_cents) > 1
         ),
         coalesce(sum(e.customs_value_cents), 0),
         coalesce(sum(e.net_weight_g * i.quantity), 0)
    into itens_invalidos, valor_aduaneiro, peso_liquido
    from order_export_items e
    join order_items i on i.id = e.order_item_id and i.order_id = e.order_id
    where e.order_id = new.id;
  if itens_invalidos <> 0 or valor_aduaneiro <> new.subtotal_cents - new.discount_cents then
    raise exception 'Despacho internacional exige valores aduaneiros e fiscais reconciliados';
  end if;

  select gross_weight_g, incoterm into pacote from order_export_packages where order_id = new.id;
  if not found or pacote.incoterm not in ('DAP', 'DDP') or pacote.gross_weight_g < peso_liquido
     or not exists(select 1 from shipments where order_id = new.id and provider = 'dhl'
       and regexp_replace(coalesce(tracking_code, ''), '[[:space:]-]', '', 'g') ~ '^[0-9]{10}$'
       and status in ('label_created','registrado_manual')) then
    raise exception 'Despacho internacional exige embalagem reconciliada e guia DHL';
  end if;

  select invoice_mode,
    legal_name is not null and length(trim(legal_name)) > 0 and
    tax_id is not null and length(trim(tax_id)) > 0 and country is not null and
    postal_code is not null and length(trim(postal_code)) > 0 and
    city is not null and length(trim(city)) > 0 and
    address_line1 is not null and length(trim(address_line1)) > 0 and
    contact_name is not null and length(trim(contact_name)) > 0 and
    phone is not null and length(trim(phone)) > 0 and
    email is not null and length(trim(email)) > 0 and dhl_account_confirmed
    into modo_invoice, exportador_ok
    from international_export_settings where singleton = true;
  if not found or not exportador_ok or modo_invoice not in ('external', 'api') then
    raise exception 'Despacho internacional exige exportador e conta DHL confirmados';
  end if;

  if not exists(select 1 from order_export_documents where order_id = new.id and kind = 'nfe'
        and source = 'external' and status = 'verified' and validated_by is not null and validated_at is not null)
     or not exists(select 1 from order_export_documents where order_id = new.id and kind = 'invoice'
        and source = case when modo_invoice = 'api' then 'dhl' else 'external' end
        and status = 'verified' and validated_by is not null and validated_at is not null)
     or not exists(select 1 from order_export_documents where order_id = new.id and kind = 'declaration'
        and source = 'external' and regime in ('DRE','DUE')
        and status = 'verified' and validated_by is not null and validated_at is not null) then
    raise exception 'Despacho internacional exige NF-e, Commercial Invoice e DRE/DU-E conferidas';
  end if;
  if exists(select 1 from order_export_documents d
    where d.order_id = new.id and d.status = 'verified'
      and not exists(select 1 from storage.objects o
        where o.bucket_id = 'export-documents' and o.name = d.storage_path)) then
    raise exception 'Despacho internacional exige arquivos fiscais presentes no Storage privado';
  end if;
  return new;
end $$;
