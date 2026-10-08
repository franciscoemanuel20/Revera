-- Apenas fatos físicos confirmados pelo proprietário para o pedido alemão.
-- Não cria NF-e, invoice, declaração, etiqueta, frete ou envio.
do $$
begin
  if not exists(select 1 from orders where id = '2c4d3a59-0c6e-453d-b5af-78c10cd8c120'
    and order_number = 'REV-7DA5CEBF' and payment_status = 'paid' and canceled_at is null) then
    raise exception 'Pedido alemão pago não encontrado';
  end if;
  if exists(select 1 from shipments where order_id = '2c4d3a59-0c6e-453d-b5af-78c10cd8c120') then
    raise exception 'Pedido já tem remessa';
  end if;
  if (select count(*) from order_items where order_id = '2c4d3a59-0c6e-453d-b5af-78c10cd8c120') <> 2 then
    raise exception 'Quantidade de itens do pedido mudou';
  end if;
  if not exists(select 1 from order_items where id = '769c85cc-9376-428f-92cb-1916a6764677'
    and order_id = '2c4d3a59-0c6e-453d-b5af-78c10cd8c120' and quantity = 1)
    or not exists(select 1 from order_items where id = 'a7e5e854-4091-4922-800f-734fc2147905'
    and order_id = '2c4d3a59-0c6e-453d-b5af-78c10cd8c120' and quantity = 1) then
    raise exception 'Identidade ou quantidade dos itens mudou';
  end if;
end $$;
insert into order_export_item_facts(order_item_id,order_id,ncm,hs_code,country_of_origin,
  net_weight_g,length_cm,width_cm,height_cm)
values
 ('769c85cc-9376-428f-92cb-1916a6764677','2c4d3a59-0c6e-453d-b5af-78c10cd8c120',
  '67042000','670420','BR',75,16,5,11),
 ('a7e5e854-4091-4922-800f-734fc2147905','2c4d3a59-0c6e-453d-b5af-78c10cd8c120',
  '39191000','39191000','BR',138,11,11,2.5)
on conflict(order_item_id) do nothing;
do $$
begin
  if not exists(select 1 from order_export_item_facts where order_item_id = '769c85cc-9376-428f-92cb-1916a6764677'
      and ncm = '67042000' and hs_code = '670420' and country_of_origin = 'BR'
      and net_weight_g = 75 and length_cm = 16 and width_cm = 5 and height_cm = 11)
    or not exists(select 1 from order_export_item_facts where order_item_id = 'a7e5e854-4091-4922-800f-734fc2147905'
      and ncm = '39191000' and hs_code = '39191000' and country_of_origin = 'BR'
      and net_weight_g = 138 and length_cm = 11 and width_cm = 11 and height_cm = 2.5) then
    raise exception 'Fatos existentes diferem dos dados confirmados';
  end if;
end $$;
