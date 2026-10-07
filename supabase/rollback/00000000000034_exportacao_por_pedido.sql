-- Reversão deliberada quando há evidências: primeiro arquive externamente
-- snapshots, remessas, documentos e arquivos, com conferência humana.
-- Depois remova as referências order_export_documents (DELETE, nunca UPDATE
-- de verificados); então remova arquivos pelo Storage API. Reconcile e remova
-- remessas somente quando não houver obrigação logística pendente, e por fim
-- remova snapshots e embalagens. Só então este rollback pode ser executado.
-- A ordem preserva o guard que impede apagar um arquivo ainda referenciado.
-- O bucket vazio permanece privado: Supabase bloqueia DELETE SQL de buckets.
-- Se necessário, retire-o depois pela API oficial do Storage.
do $$ begin
  if exists(select 1 from storage.objects where bucket_id = 'export-documents') then
    raise exception 'Bucket export-documents contém arquivos; preserve e remova via Storage API antes do rollback';
  end if;
  if exists(select 1 from order_export_items)
     or exists(select 1 from order_export_packages)
     or exists(select 1 from order_export_documents) then
    raise exception 'Exportação contém snapshots ou evidências; arquive e reconcilie antes do rollback';
  end if;
end $$;
drop trigger if exists export_dispatch_guard on orders;
drop function if exists export_require_documents_for_dispatch();
drop trigger if exists export_settings_guard on international_export_settings;
drop function if exists export_settings_guard();
drop trigger if exists export_refund_during_creation on orders;
drop function if exists export_refund_during_creation();
drop trigger if exists export_order_destination_lock on orders;
drop trigger if exists export_address_lock on addresses;
drop function if exists export_protect_destination();
drop function if exists reconcile_stale_dhl_reservation(uuid);
drop function if exists register_dhl_awb_atomic(uuid,text,text,text,text);
drop index if exists shipments_dhl_awb_unico;
drop trigger if exists protect_export_document_object on storage.objects;
drop function if exists protect_export_document_object();
drop trigger if exists export_shipments_lock on shipments;
drop trigger if exists export_documents_lock on order_export_documents;
drop trigger if exists export_packages_lock on order_export_packages;
drop trigger if exists export_items_lock on order_export_items;
drop function if exists export_lock_order();
drop policy if exists "admin delete export documents" on storage.objects;
drop policy if exists "admin insert export documents" on storage.objects;
drop policy if exists "admin read export documents" on storage.objects;
drop table if exists order_export_documents;
drop table if exists order_export_packages;
drop table if exists order_export_items;
alter table order_items drop constraint if exists order_items_order_id_id_unique;
