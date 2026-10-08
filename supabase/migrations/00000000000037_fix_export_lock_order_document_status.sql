-- Corrige o gatilho em bancos que já aplicaram a migration 34.
-- OLD.status só existe em order_export_documents. A expressão AND anterior
-- podia avaliar o campo mesmo ao inserir em order_items e bloqueava o checkout.
create or replace function export_lock_order() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare pedido_id uuid;
declare situacao record;
declare item_quantity integer;
begin
  pedido_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  select payment_status, canceled_at, shipping_status into situacao from orders where id = pedido_id for update;
  if tg_op = 'UPDATE' then
    if tg_table_name in ('order_export_packages','order_export_documents')
       and new.order_id is distinct from old.order_id then
      raise exception 'Pedido da embalagem ou documento fiscal é imutável';
    end if;
  end if;
  if tg_table_name = 'order_items' then
    if tg_op = 'UPDATE' then
      if new.order_id is distinct from old.order_id then
        raise exception 'Item de pedido não pode trocar de pedido';
      end if;
    end if;
    if exists(select 1 from order_export_items where order_id = pedido_id)
       or exists(select 1 from order_export_documents where order_id = pedido_id)
       or exists(select 1 from shipments where order_id = pedido_id) then
      raise exception 'Itens de pedido bloqueados após evidência fiscal ou remessa';
    end if;
  end if;
  if tg_table_name = 'shipments' then
    if tg_op = 'UPDATE' then
      if new.order_id is distinct from old.order_id or new.provider is distinct from old.provider then
        raise exception 'Pedido e provedor da remessa são imutáveis';
      end if;
      if old.provider = 'dhl' and old.status = 'creation_unknown'
         and (new.status is distinct from old.status
              or new.tracking_code is distinct from old.tracking_code) then
        if new.status <> 'label_created' or new.tracking_code is null
           or length(coalesce(new.metadata->'reconciliation'->>'lookup_reference','')) < 3
           or coalesce(new.metadata->'reconciliation'->>'awb','') <> new.tracking_code
           or coalesce(new.metadata->'reconciliation'->>'verified_by','') = ''
           or coalesce(new.metadata->'reconciliation'->>'looked_up_at','') = ''
           or not exists(select 1 from storage.objects o where o.bucket_id = 'export-documents'
                and o.name = new.metadata->'reconciliation'->>'evidence_path') then
          raise exception 'Guia incerta exige consulta MyDHL com comprovante privado';
        end if;
        perform 1 from storage.objects o where o.bucket_id = 'export-documents'
          and o.name = new.metadata->'reconciliation'->>'evidence_path' for update;
        if not found then raise exception 'Comprovante MyDHL ausente'; end if;
      end if;
      if old.provider = 'dhl' and old.tracking_code is not null
         and new.tracking_code is distinct from old.tracking_code then
        raise exception 'Guia DHL registrada é imutável';
      end if;
      if old.provider = 'dhl' and old.tracking_code is null and new.tracking_code is not null
         and old.status not in ('creating','creation_unknown') then
        raise exception 'Guia DHL exige criação ou reconciliação documentada';
      end if;
      -- A resposta de uma chamada já enviada à DHL deve poder ser gravada
      -- mesmo se o gateway registrar estorno durante a chamada. Isso mantém
      -- a remessa reconciliável; o pedido continua bloqueado para despacho.
      if new.provider = 'dhl'
         and (new.tracking_code is distinct from old.tracking_code
              or new.provider_shipment_id is distinct from old.provider_shipment_id)
         and (situacao.canceled_at is not null or situacao.payment_status <> 'paid') then
        if not (old.status = 'creating' and new.status = 'label_created'
                and new.tracking_code is not null
                and old.metadata ? 'request_snapshot'
                and auth.role() = 'service_role') then
          raise exception 'Guia DHL exige pedido pago e não cancelado';
        end if;
      end if;
    elsif tg_op = 'DELETE' then
      if old.provider = 'dhl' then
        if not (old.status = 'creating' and
                coalesce(old.metadata->>'communication','') = 'prepared_not_sent') then
          raise exception 'Remessa DHL não pode ser apagada; reconcilie a tentativa';
        end if;
      end if;
    else
      if new.provider = 'dhl' then
        if situacao.canceled_at is not null or situacao.payment_status <> 'paid' then
          raise exception 'Remessa DHL exige pedido pago e não cancelado';
        end if;
        if exists(select 1 from shipments where order_id = pedido_id) then
          raise exception 'Pedido já possui remessa; reconciliar antes de nova tentativa';
        end if;
        if new.tracking_code is not null and (
          new.status <> 'registrado_manual'
          or length(coalesce(new.metadata->'manual_evidence'->>'lookup_reference','')) < 3
          or coalesce(new.metadata->'manual_evidence'->>'awb','') <> new.tracking_code
          or coalesce(new.metadata->'manual_evidence'->>'verified_by','') = ''
          or new.metadata->'manual_evidence'->>'evidence_path' not like
            pedido_id::text || '/manual/%'
          or not exists(select 1 from storage.objects o where o.bucket_id = 'export-documents'
            and o.name = new.metadata->'manual_evidence'->>'evidence_path')) then
          raise exception 'Guia manual exige comprovante MyDHL privado';
        end if;
        if new.tracking_code is not null then
          perform 1 from storage.objects o where o.bucket_id = 'export-documents'
            and o.name = new.metadata->'manual_evidence'->>'evidence_path' for update;
          if not found then raise exception 'Comprovante MyDHL ausente'; end if;
        end if;
        perform 1 from international_export_settings where singleton = true for update;
      end if;
    end if;
  end if;
  if tg_table_name in ('order_export_items','order_export_packages') then
    if exists(select 1 from shipments where order_id = pedido_id)
       or exists(select 1 from order_export_documents where order_id = pedido_id) then
      raise exception 'Snapshot fiscal/embalagem bloqueado: pedido já possui documento ou remessa';
    end if;
  end if;
  if tg_table_name = 'order_export_items' and tg_op in ('INSERT','UPDATE') then
    select quantity into item_quantity from order_items
      where id = new.order_item_id and order_id = pedido_id;
    if item_quantity is null or item_quantity <= 0 then
      raise exception 'Snapshot fiscal exige item e quantidade válidos';
    end if;
    new.order_quantity := item_quantity;
  end if;
  if tg_table_name = 'order_export_documents' then
    if tg_op = 'UPDATE' then
      if old.status = 'verified' then
        raise exception 'Documento fiscal verificado é imutável';
      end if;
    end if;
    if situacao.shipping_status in ('shipped','delivered') then
      raise exception 'Documento fiscal de pedido despachado é imutável';
    end if;
    if tg_op = 'DELETE' then
      if old.status = 'verified' then
        raise exception 'Documento fiscal verificado é imutável';
      end if;
    end if;
    if tg_op in ('INSERT','UPDATE') then
      if new.storage_path not like pedido_id::text || '/%' then
        raise exception 'Arquivo fiscal deve pertencer ao diretório do pedido';
      end if;
      perform 1 from storage.objects where bucket_id = 'export-documents'
        and name = new.storage_path for update;
      if not found then raise exception 'Arquivo fiscal privado ausente'; end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
