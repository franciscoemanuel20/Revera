-- Atualiza staging onde a migração 36 anterior já foi aplicada.
-- Mantém 37/38 e instala as travas revisadas de ab3d9e7.

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
