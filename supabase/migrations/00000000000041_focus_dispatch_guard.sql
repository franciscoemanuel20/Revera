-- Trava de banco para despacho direto e remessas novas após integração Focus.
-- Snapshot fechado das remessas DHL que já existiam antes desta migração.
-- Permite concluir um despacho legado com NF-e manual verificada, sem abrir
-- caminho para uma remessa nova escapar da exigência Focus.
create table if not exists legacy_dhl_shipments (
  shipment_id uuid primary key references shipments(id),
  order_id uuid not null references orders(id),
  captured_at timestamptz not null default now()
);
alter table legacy_dhl_shipments enable row level security;
create policy "admin read legacy DHL" on legacy_dhl_shipments for select to authenticated
  using (exists(select 1 from admin_users where id = auth.uid()));
insert into legacy_dhl_shipments(shipment_id, order_id)
select s.id, s.order_id from shipments s
join order_export_documents d on d.order_id = s.order_id and d.kind = 'nfe'
where s.provider = 'dhl' and s.status in ('label_created','registrado_manual')
  and regexp_replace(coalesce(s.tracking_code, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
  and d.source = 'external' and d.status = 'verified'
  and d.validated_by is not null and d.validated_at is not null
on conflict(shipment_id) do nothing;

-- Marca somente reservas novas que passaram pela trava Focus no INSERT.
-- A marca permite persistir a resposta real da DHL após timeout local ou
-- expiração dos 60 segundos, sem liberar despacho antes de nova consulta.
create table if not exists focus_dhl_reservations (
  shipment_id uuid primary key references shipments(id) on delete cascade,
  order_id uuid not null references orders(id),
  captured_at timestamptz not null default now()
);
alter table focus_dhl_reservations enable row level security;
create policy "admin read Focus DHL reservations" on focus_dhl_reservations for select to authenticated
  using (exists(select 1 from admin_users where id = auth.uid()));

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
    remessa_meta->'request_snapshot'->'exporter_snapshot'->>'invoice_mode',
    case when remessa_meta->'request_snapshot'->'request'->>'requestInvoice' = 'true' then 'api'
      when remessa_meta->'request_snapshot'->'request'->>'requestInvoice' = 'false' then 'external' end
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
  if not found or not exportador_ok or modo_invoice is null
     or modo_invoice not in ('external', 'api') then
    raise exception 'Despacho internacional exige exportador e modo de invoice fixado no pedido';
  end if;

  if not exists(
    select 1 from order_focus_nfe n
    join order_export_documents d on d.order_id = n.order_id and d.kind = 'nfe'
    where n.order_id = new.id and n.status = 'authorized'
      and n.consulted_at >= statement_timestamp() - interval '60 seconds'
      and n.access_key = d.reference and d.status = 'verified'
      and n.xml_storage_path is not null and n.danfe_storage_path = d.storage_path
      and exists(select 1 from storage.objects o where o.bucket_id = 'export-documents'
        and o.name = n.xml_storage_path)
      and exists(select 1 from storage.objects o where o.bucket_id = 'export-documents'
        and o.name = n.danfe_storage_path)
  ) and not exists(
    select 1 from legacy_dhl_shipments l
    join shipments s on s.id = l.shipment_id and s.order_id = l.order_id
    join order_export_documents d on d.order_id = l.order_id and d.kind = 'nfe'
    where l.order_id = new.id and s.id = remessa_id and s.provider = 'dhl'
      and s.status in ('label_created','registrado_manual')
      and d.source = 'external' and d.status = 'verified'
      and d.validated_by is not null and d.validated_at is not null
      and not exists(select 1 from order_focus_nfe n where n.order_id = new.id)
  ) then
    raise exception 'Despacho exige NF-e autorizada na Focus com XML e DANFE privados';
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
      and (exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof(remessa_meta->'documents') = 'array'
            then remessa_meta->'documents' else '[]'::jsonb end
        ) documento
        where coalesce(documento->>'typeCode', '') ~* '(invoice|commercial|^inv$)'
          and documento->>'storagePath' = d.storage_path
          and d.storage_path like new.id::text || '/dhl/' || remessa_id::text || '/%'
      ) or (
        d.storage_path like new.id::text || '/dhl/invoice-manual/%.pdf'
        and remessa_meta->'invoice_recovery'->>'storage_path' = d.storage_path
        and remessa_meta->'invoice_recovery'->>'invoice_reference' = d.reference
        and length(coalesce(remessa_meta->'invoice_recovery'->>'lookup_reference','')) >= 3
        and coalesce(remessa_meta->'invoice_recovery'->>'confirmed_by','') <> ''
        and coalesce(remessa_meta->'invoice_recovery'->>'confirmed_at','') <> ''
      ))
  ) then
    raise exception 'Invoice DHL exige PDF da API ou recuperação MyDHL documentada e conferida';
  end if;
  return new;
end $$;

create or replace function guard_focus_dhl_reservation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.provider <> 'dhl' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status not in ('label_created','registrado_manual')
      or old.status in ('label_created','registrado_manual') then return new; end if;
    if exists(select 1 from legacy_dhl_shipments l where l.shipment_id = old.id
      and l.order_id = old.order_id) then return new; end if;
    if exists(select 1 from focus_dhl_reservations r where r.shipment_id = old.id
      and r.order_id = old.order_id) then
      if coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'Resposta DHL Focus exige service role';
      end if;
      return new;
    end if;
  end if;
  perform 1 from orders where id = new.order_id for update;
  if not exists(
    select 1 from order_focus_nfe n
    join order_export_documents d on d.order_id = n.order_id and d.kind = 'nfe'
    where n.order_id = new.order_id and n.status = 'authorized'
      and n.consulted_at >= statement_timestamp() - interval '60 seconds'
      and n.access_key = d.reference and d.status = 'verified'
      and n.xml_storage_path is not null and n.danfe_storage_path = d.storage_path
    for update of n
  ) then
    raise exception 'Remessa DHL exige NF-e Focus autorizada e conferida';
  end if;
  return new;
end $$;
create trigger guard_focus_dhl_reservation before insert or update of status on shipments
  for each row execute function guard_focus_dhl_reservation();

create or replace function mark_focus_dhl_reservation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.provider = 'dhl' then
    insert into focus_dhl_reservations(shipment_id, order_id) values(new.id, new.order_id);
  end if;
  return new;
end $$;
create trigger mark_focus_dhl_reservation after insert on shipments
  for each row execute function mark_focus_dhl_reservation();

create or replace function block_focus_consultation_during_dhl() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.consultation_nonce is distinct from old.consultation_nonce
      or (new.consulted_at is null and old.consulted_at is not null))
    and exists(select 1 from focus_dhl_reservations r
      join shipments s on s.id = r.shipment_id
      where r.order_id = old.order_id and s.status = 'creating') then
    raise exception 'Consulta Focus bloqueada durante criação DHL; reconcilie a remessa primeiro';
  end if;
  return new;
end $$;
create trigger block_focus_consultation_during_dhl before update on order_focus_nfe
  for each row execute function block_focus_consultation_during_dhl();
