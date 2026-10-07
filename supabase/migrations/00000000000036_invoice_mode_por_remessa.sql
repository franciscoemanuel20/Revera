-- Congela a origem da invoice quando ela é fixada na remessa.
create or replace function export_freeze_shipment_invoice_mode() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare modo_antigo text;
declare modo_novo text;
begin
  if new.provider <> 'dhl' then return new; end if;
  if tg_op = 'UPDATE' then
    modo_antigo := coalesce(old.metadata->'exporter_snapshot'->>'invoice_mode',
      old.metadata->'request_snapshot'->'exporter_snapshot'->>'invoice_mode');
    modo_novo := coalesce(new.metadata->'exporter_snapshot'->>'invoice_mode',
      new.metadata->'request_snapshot'->'exporter_snapshot'->>'invoice_mode');
    if modo_antigo is not null and modo_novo is distinct from modo_antigo then
      raise exception 'Modo de invoice da remessa não pode ser alterado';
    end if;
    if modo_antigo is null and modo_novo is not null
       and old.status <> 'creating'
       and current_setting('revera.reconciling_invoice_mode', true) is distinct from 'on' then
      raise exception 'Modo de invoice legado exige reconciliação fiscal auditada';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists export_freeze_shipment_invoice_mode_trigger on shipments;
create trigger export_freeze_shipment_invoice_mode_trigger before insert or update on shipments
  for each row execute function export_freeze_shipment_invoice_mode();

-- Recuperação explícita de remessas antigas: a origem vem de uma invoice já
-- conferida, nunca da configuração global atual.
create or replace function reconcile_legacy_shipment_invoice_mode(p_order_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare remessa record;
declare documento record;
declare modo text;
begin
  if not exists(select 1 from admin_users where id = auth.uid()) then
    raise exception 'Acesso administrativo necessário';
  end if;
  select id, status, metadata into remessa from shipments
    where order_id = p_order_id and provider = 'dhl' for update;
  if not found or remessa.status not in ('label_created','registrado_manual','creation_unknown') then
    raise exception 'Remessa DHL legada não encontrada';
  end if;
  if coalesce(remessa.metadata->'exporter_snapshot'->>'invoice_mode',
      remessa.metadata->'request_snapshot'->'exporter_snapshot'->>'invoice_mode') is not null then
    raise exception 'Esta remessa já tem modo de invoice fixado';
  end if;
  select source, storage_path into documento from order_export_documents
    where order_id = p_order_id and kind = 'invoice' and status = 'verified'
      and validated_by is not null and validated_at is not null for update;
  if not found or not exists(select 1 from storage.objects
    where bucket_id = 'export-documents' and name = documento.storage_path) then
    raise exception 'Reconciliação exige Commercial Invoice conferida e arquivo privado';
  end if;
  modo := case documento.source when 'external' then 'external' when 'dhl' then 'api' end;
  if modo is null then raise exception 'Origem da invoice inválida'; end if;
  if modo = 'api' and not exists (
    select 1 from jsonb_array_elements(
      case when jsonb_typeof(remessa.metadata->'documents') = 'array'
        then remessa.metadata->'documents' else '[]'::jsonb end) d
      where coalesce(d->>'typeCode', '') ~* '(invoice|commercial|^inv$)'
        and d->>'storagePath' = documento.storage_path
        and documento.storage_path like p_order_id::text || '/dhl/' || remessa.id::text || '/%'
  ) then
    raise exception 'Invoice DHL não foi devolvida pela API desta remessa';
  end if;
  if modo = 'api' and not exists (
    select 1 from storage.objects o where o.bucket_id = 'export-documents'
      and o.name = documento.storage_path and o.name like '%.pdf'
      and o.metadata->>'mimetype' = 'application/pdf'
  ) then
    raise exception 'Invoice DHL exige PDF privado';
  end if;
  perform set_config('revera.reconciling_invoice_mode', 'on', true);
  update shipments set metadata = coalesce(remessa.metadata, '{}'::jsonb) ||
    jsonb_build_object('exporter_snapshot', jsonb_build_object('invoice_mode', modo)),
    updated_at = now() where id = remessa.id;
  insert into audit_logs(admin_user_id, action, entity_type, entity_id, diff)
    values(auth.uid(), 'exportacao.reconciliar_modo_invoice_legado', 'orders',
      p_order_id::text, jsonb_build_object('shipment_id', remessa.id, 'mode', modo,
        'invoice_storage_path', documento.storage_path));
  return modo;
end $$;
revoke all on function reconcile_legacy_shipment_invoice_mode(uuid) from public;
grant execute on function reconcile_legacy_shipment_invoice_mode(uuid) to authenticated;

-- A regra de despacho lê o modo imutável da remessa, nunca a configuração atual.
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
declare remessa_meta jsonb;
declare remessa_id uuid;
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
       and regexp_replace(coalesce(tracking_code, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
       and status in ('label_created','registrado_manual')) then
    raise exception 'Despacho internacional exige embalagem reconciliada e guia DHL';
  end if;

  select id, metadata into remessa_id, remessa_meta from shipments
    where order_id = new.id and provider = 'dhl'
      and status in ('label_created','registrado_manual') limit 1;
  modo_invoice := coalesce(
    remessa_meta->'exporter_snapshot'->>'invoice_mode',
    remessa_meta->'request_snapshot'->'exporter_snapshot'->>'invoice_mode'
  );
  select legal_name is not null and length(trim(legal_name)) > 0 and
    tax_id is not null and length(trim(tax_id)) > 0 and country is not null and
    postal_code is not null and length(trim(postal_code)) > 0 and
    city is not null and length(trim(city)) > 0 and
    address_line1 is not null and length(trim(address_line1)) > 0 and
    contact_name is not null and length(trim(contact_name)) > 0 and
    phone is not null and length(trim(phone)) > 0 and
    email is not null and length(trim(email)) > 0 and dhl_account_confirmed
    into exportador_ok from international_export_settings where singleton = true;
  if not found or not exportador_ok or modo_invoice not in ('external', 'api') then
    raise exception 'Despacho internacional exige exportador e modo de invoice fixado no pedido';
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
  if modo_invoice = 'api' and not exists (
    select 1 from order_export_documents d
    where d.order_id = new.id and d.kind = 'invoice' and d.source = 'dhl'
      and d.status = 'verified'
      and d.storage_path like '%.pdf'
      and exists (select 1 from storage.objects o
        where o.bucket_id = 'export-documents' and o.name = d.storage_path
          and o.metadata->>'mimetype' = 'application/pdf')
      and exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof(remessa_meta->'documents') = 'array'
            then remessa_meta->'documents' else '[]'::jsonb end
        ) documento
        where coalesce(documento->>'typeCode', '') ~* '(invoice|commercial|^inv$)'
          and documento->>'storagePath' = d.storage_path
          and d.storage_path like new.id::text || '/dhl/' || remessa_id::text || '/%'
      )
  ) then
    raise exception 'Invoice DHL exige PDF retornado pela API nesta remessa e conferido';
  end if;
  return new;
end $$;
