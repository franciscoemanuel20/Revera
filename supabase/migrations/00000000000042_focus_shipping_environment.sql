-- Política de infraestrutura, sem escrita por usuários autenticados. O padrão
-- seguro é produção; staging deve ser configurado explicitamente por postgres.
create table if not exists focus_shipping_environment (
  singleton boolean primary key default true check(singleton),
  environment text not null default 'producao' check(environment in ('homologacao','producao'))
);
insert into focus_shipping_environment(singleton) values(true) on conflict do nothing;
alter table focus_shipping_environment enable row level security;
revoke all on focus_shipping_environment from anon, authenticated;
grant select, insert, update, delete on focus_shipping_environment to service_role;

create or replace function guard_focus_shipping_environment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare pedido_id uuid; expected text; fiscal_environment text;
begin
  if tg_table_name = 'orders' then
    if new.shipping_status not in ('shipped','delivered')
      or new.shipping_status is not distinct from old.shipping_status then return new; end if;
    if exists(select 1 from addresses where id=new.address_id and country='BR') then return new; end if;
    pedido_id := new.id;
  else
    if new.provider <> 'dhl' then return new; end if;
    pedido_id := new.order_id;
  end if;
  perform 1 from orders where id=pedido_id for update;
  select environment into fiscal_environment from order_focus_nfe where order_id=pedido_id for update;
  if not found and exists(select 1 from legacy_dhl_shipments l
    join shipments s on s.id=l.shipment_id and s.order_id=l.order_id
    where l.order_id=pedido_id and s.status in ('label_created','registrado_manual')
      and (tg_table_name='orders' or s.id=new.id)) then return new; end if;
  select environment into expected from focus_shipping_environment where singleton=true;
  if expected is null or fiscal_environment is distinct from expected then
    raise exception 'Ambiente fiscal incompatível: despacho e remessa exigem NF-e do ambiente aprovado';
  end if;
  return new;
end $$;
create trigger focus_shipping_environment_order before update of shipping_status on orders
  for each row execute function guard_focus_shipping_environment();
create trigger focus_shipping_environment_shipment before insert or update of status on shipments
  for each row execute function guard_focus_shipping_environment();
