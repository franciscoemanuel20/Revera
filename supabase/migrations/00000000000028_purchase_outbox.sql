-- Only future verified paid transitions are enrolled; no historical backfill.
create table if not exists public.purchase_outbox (
  order_id uuid primary key references public.orders(id),
  provider text not null,
  event_time timestamptz not null default now(),
  currency text not null check(currency in ('BRL','USD','EUR','GBP','AUD','CAD')),
  value_cents integer not null check (value_cents >= 0),
  state text not null default 'pending' check (state in ('pending','processing','delivered','blocked','exhausted')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  last_http_status integer
);
create index if not exists purchase_outbox_due_idx on public.purchase_outbox(next_attempt_at) where state in ('pending','processing');
alter table public.purchase_outbox enable row level security;
revoke all on public.purchase_outbox from anon, authenticated;
grant all on public.purchase_outbox to service_role;

create or replace function public.enqueue_verified_purchase() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare p text;
begin
  if old.payment_status = 'pending' and new.payment_status = 'paid'
     and new.canceled_at is null and new.tracking_consent = true and new.currency in ('BRL','USD','EUR','GBP','AUD','CAD') then
    select provider into p from public.payments
      where order_id = new.id and status = 'approved'
        and provider in ('infinitepay','asaas','stripe','paypal')
        and amount_cents >= new.total_cents
      order by created_at desc limit 1;
    if p is not null then
      insert into public.pixel_event_log(event_name,event_id,order_id,sent_web,sent_capi)
      values ('Purchase',new.id::text,new.id,false,false)
      on conflict(event_name,event_id) do nothing;
      insert into public.purchase_outbox(order_id,provider,currency,value_cents)
      values(new.id,p,new.currency,greatest(0,new.total_cents-coalesce(new.shipping_cents,0)))
      on conflict(order_id) do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists enqueue_verified_purchase on public.orders;
create trigger enqueue_verified_purchase after update of payment_status on public.orders
  for each row execute function public.enqueue_verified_purchase();
revoke all on function public.enqueue_verified_purchase() from public, anon, authenticated;

create or replace function public.claim_purchase_outbox(p_order_id uuid default null)
returns setof public.purchase_outbox
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.purchase_outbox q set state='blocked',updated_at=now()
    from public.orders o where q.order_id=o.id and q.state in ('pending','processing')
      and (q.lease_until is null or q.lease_until <= now())
      and (o.payment_status <> 'paid' or o.canceled_at is not null or o.tracking_consent is not true);
  update public.purchase_outbox set state='exhausted',updated_at=now()
    where state in ('pending','processing')
      and (event_time < now()-interval '6 days' or attempts >= 8)
      and (lease_until is null or lease_until <= now());
  return query
  with target as (
    select q.order_id from public.purchase_outbox q
      join public.orders o on o.id=q.order_id
      where (p_order_id is null or q.order_id=p_order_id)
        and q.state in ('pending','processing') and q.next_attempt_at <= now()
        and (q.lease_until is null or q.lease_until <= now())
        and q.attempts < 8 and q.event_time >= now()-interval '6 days'
        and o.payment_status='paid' and o.canceled_at is null and o.tracking_consent=true
      order by q.next_attempt_at limit 1 for update of q skip locked
  )
  update public.purchase_outbox q set state='processing',attempts=q.attempts+1,
    lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now()
    from target t where q.order_id=t.order_id returning q.*;
end $$;

create or replace function public.finish_purchase_outbox(p_order_id uuid,p_lease_token uuid,
  p_delivered boolean,p_blocked boolean,p_http_status integer default null,p_infrastructure_failure boolean default false,p_meta_delivered boolean default false,p_ga4_delivered boolean default false)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.purchase_outbox;
begin
  select * into q from public.purchase_outbox where order_id=p_order_id
    and state='processing' and lease_token=p_lease_token for update;
  if not found then return false; end if;
  update public.purchase_outbox set
    state=case when p_infrastructure_failure then 'pending' when p_delivered then 'delivered' when p_blocked then 'blocked'
      when q.attempts >= 8 then 'exhausted' else 'pending' end,
    attempts=case when p_infrastructure_failure then greatest(0,q.attempts-1) else q.attempts end,
    next_attempt_at=now()+make_interval(secs=>case when p_infrastructure_failure then 300 else least(21600,60*power(2,q.attempts)::integer) end),
    lease_token=null,lease_until=null,last_http_status=p_http_status,updated_at=now()
    where order_id=p_order_id;
  if p_meta_delivered or p_ga4_delivered then
    update public.pixel_event_log set sent_capi=sent_capi or p_meta_delivered,
      sent_ga4=sent_ga4 or p_ga4_delivered
      where event_name='Purchase' and event_id=p_order_id::text;
  end if;
  return true;
end $$;
revoke all on function public.claim_purchase_outbox(uuid) from public,anon,authenticated;
revoke all on function public.finish_purchase_outbox(uuid,uuid,boolean,boolean,integer,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.claim_purchase_outbox(uuid) to service_role;
grant execute on function public.finish_purchase_outbox(uuid,uuid,boolean,boolean,integer,boolean,boolean,boolean) to service_role;
