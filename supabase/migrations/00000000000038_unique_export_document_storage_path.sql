-- Aplicar somente depois da correção urgente do gatilho (migration 37).
-- A separação garante que eventual legado duplicado não impeça o checkout
-- de voltar a inserir order_items. A auditoria deve confirmar zero duplicatas
-- antes desta migration.
do $$
begin
  if exists (
    select 1 from order_export_documents
    group by storage_path having count(*) > 1
  ) then
    raise exception 'Documentos fiscais com storage_path duplicado; sanear antes de aplicar a unicidade';
  end if;
end $$;

create unique index if not exists order_export_documents_storage_path_unico
  on order_export_documents(storage_path);
