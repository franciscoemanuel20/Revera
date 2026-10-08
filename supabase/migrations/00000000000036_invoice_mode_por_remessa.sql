-- Congela a origem da invoice quando ela é fixada na remessa.
create table if not exists order_export_invoice_recoveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  shipment_id uuid not null references shipments(id) on delete restrict,
  storage_path text not null unique,
  invoice_reference text not null,
  lookup_reference text not null,
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now()
);
alter table order_export_invoice_recoveries enable row level security;
drop policy if exists "admin read invoice recovery history" on order_export_invoice_recoveries;
create policy "admin read invoice recovery history" on order_export_invoice_recoveries for select
  using (exists(select 1 from admin_users where id = auth.uid()));
create or replace function protect_invoice_recovery_history() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'Histórico de invoice MyDHL é imutável';
end $$;
drop trigger if exists protect_invoice_recovery_history on order_export_invoice_recoveries;
create trigger protect_invoice_recovery_history before update or delete
  on order_export_invoice_recoveries for each row execute function protect_invoice_recovery_history();

create or replace function export_freeze_shipment_invoice_mode() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare modo_antigo text;
declare modo_novo text;
declare modo_manual text;
begin
  if new.provider <> 'dhl' then return new; end if;
  if tg_op = 'INSERT'
     and jsonb_array_length(case when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)->'documents') = 'array'
       then new.metadata->'documents' else '[]'::jsonb end) > 0
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Documentos DHL só podem ser gravados pela resposta autenticada da API';
  end if;
  if tg_op = 'INSERT' and coalesce(new.metadata, '{}'::jsonb) ? 'invoice_recovery' then
    raise exception 'Prova MyDHL só pode ser vinculada a remessa final pela recuperação auditada';
  end if;
  if tg_op = 'INSERT' and new.status = 'registrado_manual'
     and coalesce(new.metadata->'exporter_snapshot'->>'invoice_mode',
       new.metadata->'request_snapshot'->'exporter_snapshot'->>'invoice_mode') is null then
    select case source when 'dhl' then 'api' when 'external' then 'external' end
      into modo_manual from order_export_documents where order_id = new.order_id
      and kind = 'invoice' and status = 'verified';
    if modo_manual is null then
      select invoice_mode into modo_manual from international_export_settings
        where singleton = true for update;
    end if;
    if modo_manual not in ('api','external') or modo_manual is null then
      raise exception 'Defina o modo da invoice antes de registrar guia manual';
    end if;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) ||
      jsonb_build_object('exporter_snapshot', jsonb_build_object('invoice_mode', modo_manual));
  end if;
  if tg_op = 'UPDATE' then
    if new.metadata->'request_snapshot' is distinct from old.metadata->'request_snapshot'
       and not (
         coalesce(auth.role(), '') = 'service_role'
         and new.status = 'creating'
         and
         old.status = 'creating'
         and old.metadata->'request_snapshot' is null
         and old.metadata->>'communication' = 'prepared_not_sent'
         and new.metadata->'request_snapshot' is not null
         and new.metadata->>'communication' = 'prepared_not_sent'
       ) then
      raise exception 'Snapshot da requisição DHL é imutável';
    end if;
    if old.status = 'creating'
       and new.status in ('label_created', 'creation_unknown')
       and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Resultado da criação DHL só pode ser persistido pelo serviço autenticado';
    end if;
    if new.metadata->'documents' is distinct from old.metadata->'documents'
       and not (
         coalesce(auth.role(), '') = 'service_role'
         and old.status = 'creating'
         and new.status in ('label_created', 'creation_unknown')
       ) then
      raise exception 'Documentos retornados pela DHL são imutáveis';
    end if;
    if new.metadata->'invoice_recovery' is distinct from old.metadata->'invoice_recovery'
       and current_setting('revera.registering_manual_dhl_invoice', true) is distinct from 'on' then
      raise exception 'Prova MyDHL só pode mudar pela recuperação auditada';
    end if;
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

-- Vincula um PDF obtido no MyDHL à remessa e ao documento fiscal em uma só
-- transação. O upload privado já deve existir; só o admin que o enviou pode
-- confirmar sua procedência. A conferência fiscal continua separada.
create or replace function register_manual_dhl_invoice(
  p_order_id uuid, p_storage_path text, p_invoice_reference text, p_lookup_reference text)
returns void language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare r record;
declare p record;
declare existente record;
declare modo text;
begin
  if not exists(select 1 from admin_users where id = auth.uid()) then
    raise exception 'Acesso administrativo necessário';
  end if;
  if length(trim(coalesce(p_invoice_reference,''))) < 1
     or length(trim(coalesce(p_lookup_reference,''))) < 3 then
    raise exception 'Referências da invoice e da consulta MyDHL obrigatórias';
  end if;
  select payment_status, canceled_at into p from orders where id = p_order_id for update;
  if not found or p.payment_status <> 'paid' or p.canceled_at is not null then
    raise exception 'Pedido deve estar pago e não cancelado';
  end if;
  select * into r from shipments where order_id = p_order_id and provider = 'dhl' for update;
  if not found or r.status not in ('label_created','registrado_manual')
     or regexp_replace(coalesce(r.tracking_code,''), '[^0-9]', '', 'g') !~ '^[0-9]{10}$' then
    raise exception 'Invoice recuperada exige guia DHL final';
  end if;
  modo := coalesce(r.metadata->'exporter_snapshot'->>'invoice_mode',
    r.metadata->'request_snapshot'->'exporter_snapshot'->>'invoice_mode',
    case when r.metadata->'request_snapshot'->'request'->>'requestInvoice' = 'true'
      then 'api' end);
  if modo <> 'api' or modo is null then
    raise exception 'Esta remessa não usa invoice DHL';
  end if;
  if p_storage_path not like p_order_id::text || '/dhl/invoice-manual/%.pdf' then
    raise exception 'Caminho da invoice não pertence a este pedido';
  end if;
  perform 1 from storage.objects where bucket_id = 'export-documents'
    and name = p_storage_path and owner_id = auth.uid()::text
    and metadata->>'mimetype' = 'application/pdf' for update;
  if not found then raise exception 'PDF privado da invoice não encontrado'; end if;
  select status, storage_path into existente from order_export_documents
    where order_id = p_order_id and kind = 'invoice' for update;
  if found then
    if existente.status <> 'rejected' then
      raise exception 'Invoice existente deve ser rejeitada antes de substituição';
    end if;
    update order_export_documents set source = 'dhl', status = 'pending',
      reference = p_invoice_reference, storage_path = p_storage_path,
      regime = null, validated_by = null, validated_at = null, updated_at = now()
      where order_id = p_order_id and kind = 'invoice';
  else
    insert into order_export_documents(order_id,kind,source,status,reference,storage_path,regime)
      values(p_order_id,'invoice','dhl','pending',p_invoice_reference,p_storage_path,null);
  end if;
  insert into order_export_invoice_recoveries(order_id,shipment_id,storage_path,
    invoice_reference,lookup_reference,confirmed_by)
    values(p_order_id,r.id,p_storage_path,p_invoice_reference,p_lookup_reference,auth.uid());
  perform set_config('revera.registering_manual_dhl_invoice', 'on', true);
  update shipments set metadata = coalesce(r.metadata, '{}'::jsonb) ||
    jsonb_build_object('invoice_recovery', jsonb_build_object(
      'storage_path',p_storage_path,'invoice_reference',p_invoice_reference,
      'lookup_reference',p_lookup_reference,'confirmed_by',auth.uid(),'confirmed_at',now())),
    updated_at = now() where id = r.id;
  insert into audit_logs(admin_user_id,action,entity_type,entity_id,diff)
    values(auth.uid(),'exportacao.recuperar_invoice_mydhl','orders',p_order_id::text,
      jsonb_build_object('shipment_id',r.id,'storage_path',p_storage_path,
        'invoice_reference',p_invoice_reference,'lookup_reference',p_lookup_reference));
end $$;
revoke all on function register_manual_dhl_invoice(uuid,text,text,text) from public;
grant execute on function register_manual_dhl_invoice(uuid,text,text,text) to authenticated;

create or replace function protect_manual_dhl_invoice_object() returns trigger
language plpgsql security definer set search_path = public, storage, pg_temp as $$
begin
  if old.bucket_id = 'export-documents' and exists(
    select 1 from order_export_invoice_recoveries
      where storage_path = old.name) then
    raise exception 'Invoice MyDHL vinculada à remessa não pode ser removida';
  end if;
  return old;
end $$;
drop trigger if exists protect_manual_dhl_invoice_object on storage.objects;
create trigger protect_manual_dhl_invoice_object before delete on storage.objects
  for each row execute function protect_manual_dhl_invoice_object();
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
declare pediu_invoice boolean;
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
  pediu_invoice := remessa.metadata->'request_snapshot'->'request'->>'requestInvoice' = 'true';
  select source, storage_path into documento from order_export_documents
    where order_id = p_order_id and kind = 'invoice' and status = 'verified'
      and validated_by is not null and validated_at is not null for update;
  if not found then
    -- Algumas remessas antigas pediram a Commercial Invoice à DHL, mas a API
    -- não devolveu o PDF. A própria requisição imutável é evidência bastante
    -- para congelar o modo como API; o PDF ainda terá de ser recuperado no
    -- MyDHL e registrado pela função auditada antes do despacho.
    if pediu_invoice then
      modo := 'api';
      documento := null;
    else
      raise exception 'Reconciliação exige Commercial Invoice conferida e arquivo privado';
    end if;
  elsif not exists(select 1 from storage.objects
    where bucket_id = 'export-documents' and name = documento.storage_path) then
    raise exception 'Reconciliação exige Commercial Invoice conferida e arquivo privado';
  else
    modo := case documento.source when 'external' then 'external' when 'dhl' then 'api' end;
  end if;
  if modo is null then raise exception 'Origem da invoice inválida'; end if;
  if remessa.metadata->'request_snapshot'->'request'->>'requestInvoice' in ('true','false')
     and (remessa.metadata->'request_snapshot'->'request'->>'requestInvoice' = 'true')
         is distinct from (modo = 'api') then
    raise exception 'Origem da invoice contradiz o pedido enviado à DHL; reconciliação especial necessária';
  end if;
  if modo = 'api' and documento is not null and not exists (
    select 1 from jsonb_array_elements(
      case when jsonb_typeof(remessa.metadata->'documents') = 'array'
        then remessa.metadata->'documents' else '[]'::jsonb end) d
      where coalesce(d->>'typeCode', '') ~* '(invoice|commercial|^inv$)'
        and d->>'storagePath' = documento.storage_path
        and documento.storage_path like p_order_id::text || '/dhl/' || remessa.id::text || '/%'
  ) then
    raise exception 'Invoice DHL não foi devolvida pela API desta remessa';
  end if;
  if modo = 'api' and documento is not null and not exists (
    select 1 from storage.objects o where o.bucket_id = 'export-documents'
      and o.name = documento.storage_path and o.name like '%.pdf'
      and o.metadata->>'mimetype' = 'application/pdf'
  ) then
    raise exception 'Invoice DHL exige PDF privado';
  end if;
  perform set_config('revera.reconciling_invoice_mode', 'on', true);
  update shipments set metadata = coalesce(remessa.metadata, '{}'::jsonb) ||
    jsonb_build_object('exporter_snapshot',
      coalesce(remessa.metadata->'exporter_snapshot', '{}'::jsonb) ||
      jsonb_build_object('invoice_mode', modo)),
    updated_at = now() where id = remessa.id;
  insert into audit_logs(admin_user_id, action, entity_type, entity_id, diff)
    values(auth.uid(), 'exportacao.reconciliar_modo_invoice_legado', 'orders',
      p_order_id::text, jsonb_build_object('shipment_id', remessa.id, 'mode', modo,
        'invoice_storage_path', case when documento is null then null else documento.storage_path end,
        'source_evidence', case when documento is null then 'request_snapshot.requestInvoice' else 'verified_document' end));
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
