-- A linha fiscal pode ser corrigida antes da primeira evidência, mas nunca
-- transferida para outro item ou pedido conservando a validação anterior.
create or replace function export_snapshot_identity_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.order_id is distinct from old.order_id
     or new.order_item_id is distinct from old.order_item_id then
    raise exception 'Item e pedido do snapshot fiscal são imutáveis';
  end if;
  return new;
end $$;

create trigger export_snapshot_identity_guard before update on order_export_items
  for each row execute function export_snapshot_identity_guard();
