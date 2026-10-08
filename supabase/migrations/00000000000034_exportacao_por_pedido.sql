-- Evidências de exportação pertencem ao pedido, nunca ao cadastro mutável.
-- Nenhum pedido antigo recebe classificação ou aprovação presumida.
comment on column orders.export_status is
  'Legado de criação do checkout. O Admin calcula o estado de exportação pelas evidências do pedido; não usar este campo como autorização de despacho.';
-- Já criado na migration 6; reafirmado aqui porque uma remessa externa dupla
-- custa dinheiro e o trigger abaixo é defesa adicional.
create unique index if not exists shipments_order_id_unico on shipments(order_id);
-- Uma guia física pertence a uma única remessa. A expressão normalizada fecha
-- a corrida entre dois pedidos mesmo se um caminho legado gravar pontuação.
create unique index if not exists shipments_dhl_awb_unico
  on shipments ((coalesce(
    nullif(regexp_replace(coalesce(tracking_code, ''), '[^0-9]', '', 'g'), ''),
    nullif(regexp_replace(coalesce(metadata->>'tracking_code_returned', ''), '[^0-9]', '', 'g'), '')
  )))
  where provider = 'dhl'
    and (tracking_code is not null or metadata->>'tracking_code_returned' is not null);
alter table order_items add constraint order_items_order_id_id_unique unique (order_id, id);
create table if not exists order_export_items (
  order_item_id uuid primary key references order_items(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  order_quantity integer not null check (order_quantity > 0),
  ncm text not null check (ncm ~ '^[0-9]{8}$'),
  hs_code text not null check (hs_code ~ '^[0-9]{6,10}$'),
  country_of_origin char(2) not null check (country_of_origin ~ '^[A-Z]{2}$'),
  description_en text not null check (length(trim(description_en)) >= 3),
  net_weight_g integer not null check (net_weight_g > 0),
  customs_value_cents integer not null check (customs_value_cents > 0),
  fiscal_value_brl_cents integer not null check (fiscal_value_brl_cents > 0),
  fx_rate_brl_per_unit numeric(18,8) not null check (fx_rate_brl_per_unit > 0),
  fx_source text not null check (length(trim(fx_source)) >= 3),
  fx_date date not null,
  validated_by uuid not null references auth.users(id),
  validated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_export_items_belongs_to_order foreign key (order_id, order_item_id)
    references order_items(order_id, id) on delete cascade
);
create index if not exists order_export_items_order_idx on order_export_items(order_id);

create table if not exists order_export_packages (
  order_id uuid primary key references orders(id) on delete cascade,
  gross_weight_g integer not null check (gross_weight_g > 0),
  length_cm numeric not null check (length_cm > 0),
  width_cm numeric not null check (width_cm > 0),
  height_cm numeric not null check (height_cm > 0),
  incoterm text not null check (incoterm in ('DAP', 'DDP')),
  measured_by uuid not null references auth.users(id),
  measured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_export_documents (
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null check (kind in ('nfe','invoice','declaration')),
  source text not null check (source in ('external','dhl')),
  status text not null check (status in ('pending','verified','rejected')),
  reference text not null check (length(trim(reference)) > 0),
  storage_path text not null check (length(trim(storage_path)) > 0),
  regime text check (regime in ('DRE','DUE')),
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (order_id, kind),
  check (kind <> 'declaration' or regime is not null),
  check (status <> 'verified' or (validated_by is not null and validated_at is not null))
);
create unique index if not exists order_export_documents_storage_path_unico
  on order_export_documents(storage_path);

alter table order_export_items enable row level security;
alter table order_export_packages enable row level security;
alter table order_export_documents enable row level security;
create policy "admin manage order export items" on order_export_items for all
  using (exists(select 1 from admin_users where id = auth.uid()))
  with check (exists(select 1 from admin_users where id = auth.uid()));
create policy "admin manage order export packages" on order_export_packages for all
  using (exists(select 1 from admin_users where id = auth.uid()))
  with check (exists(select 1 from admin_users where id = auth.uid()));
create policy "admin manage order export documents" on order_export_documents for all
  using (exists(select 1 from admin_users where id = auth.uid()))
  with check (exists(select 1 from admin_users where id = auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('export-documents','export-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;
create policy "admin read export documents" on storage.objects for select to authenticated
  using (bucket_id = 'export-documents' and exists(select 1 from admin_users where id = auth.uid()));
create policy "admin insert export documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'export-documents' and exists(select 1 from admin_users where id = auth.uid()));
create policy "admin delete export documents" on storage.objects for delete to authenticated
  using (bucket_id = 'export-documents' and exists(select 1 from admin_users where id = auth.uid()));

-- O Storage API remove primeiro a linha de storage.objects. Impedir a
-- remoção de qualquer arquivo ainda referenciado preserva inclusive a prova
-- já conferida, mesmo se a exclusão vier do painel ou de outra ação admin.
create or replace function protect_export_document_object() returns trigger
language plpgsql security definer set search_path = public, storage, pg_temp as $$
begin
  if old.bucket_id = 'export-documents' and (
    exists(select 1 from order_export_documents where storage_path = old.name)
    or exists(select 1 from shipments where provider = 'dhl'
      and (metadata->'reconciliation'->>'evidence_path' = old.name
        or metadata->'manual_evidence'->>'evidence_path' = old.name
        or label_url = 'export-documents:' || old.name))
    or exists(select 1 from shipments s
      cross join lateral jsonb_array_elements(case
        when jsonb_typeof(s.metadata->'documents') = 'array'
          then s.metadata->'documents' else '[]'::jsonb end) d
      where s.provider = 'dhl' and d->>'storagePath' = old.name)) then
    raise exception 'Arquivo de exportação referenciado por documento; substitua ou reconcilie primeiro';
  end if;
  return old;
end $$;
create trigger protect_export_document_object before delete on storage.objects
  for each row execute function protect_export_document_object();

-- Todas as operações que disputam o estado fiscal do mesmo pedido tomam
-- o mesmo lock transacional. Depois da primeira evidência/remessa, snapshot
-- e caixa ficam imutáveis; correção exige reconciliação explícita.
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
create trigger export_items_lock before insert or update or delete on order_export_items
  for each row execute function export_lock_order();
create trigger export_order_items_lock before insert or update or delete on order_items
  for each row execute function export_lock_order();
create trigger export_packages_lock before insert or update or delete on order_export_packages
  for each row execute function export_lock_order();
create trigger export_documents_lock before insert or update or delete on order_export_documents
  for each row execute function export_lock_order();
create trigger export_shipments_lock before insert or update or delete on shipments
  for each row execute function export_lock_order();

-- O estorno é um fato financeiro que não pode ser recusado. Se chegar com a
-- chamada externa em voo, retire o pedido do estado de emissão: a resposta
-- DHL ficará registrada na remessa, mas não avançará o pedido automaticamente.
create or replace function export_refund_during_creation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.payment_status = 'paid' and new.payment_status = 'refunded'
     and old.shipping_status = 'label_processing' then
    new.shipping_status := 'shipping_error';
  end if;
  return new;
end $$;
create trigger export_refund_during_creation before update of payment_status on orders
  for each row execute function export_refund_during_creation();

-- O país do checkout não pode virar BR/nulo numa atualização direta e
-- contornar a trava fiscal. Corrigir endereço de pedido internacional exige
-- reconciliação operacional, não mutação silenciosa da evidência original.
create or replace function export_protect_destination() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare pais_antigo text;
declare pais_novo text;
begin
  if tg_table_name = 'orders' then
    if new.address_id is distinct from old.address_id then
      select country into pais_antigo from addresses where id = old.address_id;
      select country into pais_novo from addresses where id = new.address_id;
      if (old.address_id is not null and pais_antigo is distinct from 'BR')
         or (new.address_id is not null and pais_novo is distinct from 'BR') then
        raise exception 'Endereço de pedido internacional é imutável; reconcilie antes de corrigir';
      end if;
    end if;
    return new;
  end if;
  if exists(select 1 from orders o where o.address_id = old.id
      and (o.payment_status = 'paid' or o.shipping_status <> 'not_ready')
      and (old.country is distinct from 'BR' or new.country is distinct from 'BR')) then
    raise exception 'Endereço de exportação pago é imutável';
  end if;
  return new;
end $$;
create trigger export_order_destination_lock before update of address_id on orders
  for each row execute function export_protect_destination();
create trigger export_address_lock before update on addresses
  for each row execute function export_protect_destination();

-- Recuperação conservadora de processo interrompido. Só a fase que
-- comprovadamente não iniciou HTTP pode voltar a ser tentada. Depois de
-- request_in_flight a existência da remessa é incerta até consulta MyDHL.
create or replace function reconcile_stale_dhl_reservation(p_order_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
declare p record;
begin
  if auth.role() <> 'service_role' and not exists(
    select 1 from admin_users where id = auth.uid()) then
    raise exception 'Acesso administrativo necessário';
  end if;
  select payment_status, canceled_at, shipping_status into p from orders
    where id = p_order_id for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  select id, status, metadata, updated_at into r from shipments
    where order_id = p_order_id and provider = 'dhl' for update;
  if not found or r.status <> 'creating' then
    raise exception 'Não há reserva DHL em criação';
  end if;
  if r.updated_at > now() - interval '15 minutes' then
    raise exception 'Aguarde 15 minutos antes de reconciliar a tentativa';
  end if;
  if coalesce(r.metadata->>'communication','') = 'prepared_not_sent' then
    delete from shipments where id = r.id and status = 'creating';
    if p.shipping_status = 'label_processing' and p.payment_status = 'paid'
       and p.canceled_at is null then
      update orders set shipping_status = 'awaiting_label', updated_at = now()
        where id = p_order_id;
    end if;
    return 'not_sent_released';
  end if;
  update shipments set status = 'creation_unknown', updated_at = now(),
    metadata = r.metadata || jsonb_build_object('requires_manual_reconciliation', true)
    where id = r.id and status = 'creating';
  if p.shipping_status = 'label_processing' and p.payment_status = 'paid'
     and p.canceled_at is null then
    update orders set shipping_status = 'shipping_error', updated_at = now()
      where id = p_order_id;
  end if;
  return 'manual_lookup_required';
end $$;
revoke all on function reconcile_stale_dhl_reservation(uuid) from public;
grant execute on function reconcile_stale_dhl_reservation(uuid) to authenticated, service_role;

-- Guia e estado do pedido avançam juntos. A action executa a mesma avaliação
-- de pendências antes deste RPC; esta transação fecha corridas de pagamento,
-- cancelamento e remessa duplicada entre as duas escritas.
create or replace function register_dhl_awb_atomic(
  p_order_id uuid, p_awb text, p_expected_shipping text,
  p_lookup_reference text default null, p_evidence_path text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare p record;
declare r record;
declare proof jsonb;
declare has_remessa boolean;
begin
  if not exists(select 1 from admin_users where id = auth.uid()) then
    raise exception 'Acesso administrativo necessário';
  end if;
  if p_awb !~ '^[0-9]{10}$' then raise exception 'AWB DHL inválido'; end if;
  if exists(select 1 from shipments where provider = 'dhl'
       and coalesce(
         nullif(regexp_replace(coalesce(tracking_code, ''), '[^0-9]', '', 'g'), ''),
         nullif(regexp_replace(coalesce(metadata->>'tracking_code_returned', ''), '[^0-9]', '', 'g'), '')
       ) = p_awb
       and order_id <> p_order_id) then
    raise exception 'AWB DHL já pertence a outro pedido';
  end if;
  select payment_status, canceled_at, shipping_status into p from orders
    where id = p_order_id for update;
  if not found or p.payment_status <> 'paid' or p.canceled_at is not null then
    raise exception 'Pedido deve estar pago e não cancelado';
  end if;
  select * into r from shipments where order_id = p_order_id for update;
  has_remessa := found;
  if has_remessa and r.provider <> 'dhl' then raise exception 'Remessa de outro provedor'; end if;
  if has_remessa and regexp_replace(coalesce(r.tracking_code,''), '[^0-9]', '', 'g') = p_awb
     and r.status in ('label_created','registrado_manual') then
    if p.shipping_status in ('awaiting_label','shipping_error','label_processing') then
      update orders set shipping_status = 'label_created', updated_at = now()
        where id = p_order_id;
    end if;
    return 'already_registered';
  end if;
  if p.shipping_status not in ('awaiting_label','shipping_error','label_processing')
     or (not has_remessa and p.shipping_status <> p_expected_shipping) then
    raise exception 'Situação de envio mudou; recarregue o pedido';
  end if;
  if not has_remessa then
    if length(coalesce(p_lookup_reference,'')) < 3 or p_evidence_path is null
       or p_evidence_path not like p_order_id::text || '/manual/%'
       or not exists(select 1 from storage.objects o where o.bucket_id = 'export-documents'
          and o.name = p_evidence_path and o.owner_id = auth.uid()::text
          and o.metadata->>'mimetype' in ('application/pdf','image/png','image/jpeg')) then
      raise exception 'Guia manual exige referência e comprovante MyDHL deste pedido';
    end if;
    perform 1 from storage.objects o where o.bucket_id = 'export-documents'
      and o.name = p_evidence_path for update;
    if not found then raise exception 'Comprovante MyDHL removido durante registro'; end if;
    proof := jsonb_build_object('lookup_reference',p_lookup_reference,'evidence_path',p_evidence_path,
      'awb',p_awb,'verified_by',auth.uid(),'looked_up_at',now());
    insert into shipments(order_id, provider, service_name, tracking_code, status, metadata)
      values(p_order_id, 'dhl', 'DHL Express', p_awb, 'registrado_manual',
        jsonb_build_object('manual_evidence',proof));
  elsif r.status = 'creation_unknown' and r.tracking_code is null then
    if length(coalesce(p_lookup_reference,'')) < 3 or p_evidence_path is null
       or p_evidence_path not like p_order_id::text || '/reconciliation/' || r.id::text || '/%'
       or not exists(select 1 from storage.objects o where o.bucket_id = 'export-documents'
          and o.name = p_evidence_path and o.owner_id = auth.uid()::text
          and o.metadata->>'mimetype' in ('application/pdf','image/png','image/jpeg')) then
      raise exception 'Consulta MyDHL e comprovante são obrigatórios';
    end if;
    perform 1 from storage.objects o where o.bucket_id = 'export-documents'
      and o.name = p_evidence_path for update;
    if not found then raise exception 'Comprovante MyDHL removido durante reconciliação'; end if;
    if r.metadata->>'tracking_code_returned' is not null
       and regexp_replace(r.metadata->>'tracking_code_returned', '[^0-9]', '', 'g') <> p_awb then
      raise exception 'AWB diverge da resposta DHL registrada';
    end if;
    proof := jsonb_build_object('lookup_reference',p_lookup_reference,'evidence_path',p_evidence_path,
      'awb',p_awb,'verified_by',auth.uid(),'looked_up_at',now());
    update shipments set tracking_code = p_awb, status = 'label_created',
      metadata = r.metadata || jsonb_build_object('reconciliation',proof), updated_at = now()
      where id = r.id;
  else
    raise exception 'Tentativa DHL exige reconciliação antes de registrar guia';
  end if;
  update orders set shipping_status = 'label_created', updated_at = now()
    where id = p_order_id;
  return 'registered';
end $$;
revoke all on function register_dhl_awb_atomic(uuid,text,text,text,text) from public;
grant execute on function register_dhl_awb_atomic(uuid,text,text,text,text) to authenticated;

-- A trava de despacho também fica no banco: uma atualização direta ou uma
-- ação concorrente não pode contornar a avaliação feita no painel.
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
create trigger export_dispatch_guard before update of shipping_status on orders
  for each row execute function export_require_documents_for_dispatch();

create or replace function export_settings_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists(select 1 from shipments where provider = 'dhl' and status = 'creating') then
    raise exception 'Exportador bloqueado enquanto a DHL cria remessa';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger export_settings_guard before update or delete on international_export_settings
  for each row execute function export_settings_guard();
