-- Policies de admin para os módulos além de Produtos — 26/08/2026, auditoria
-- que criou /admin/pedidos, /admin/precos, /admin/solicitacoes,
-- /admin/conteudo e /admin/configuracoes.
--
-- NÃO APLICADA ainda: mesma regra das migrations anteriores deste
-- repositório (00000000000001 a 00000000000004) — só arquivo local, para o
-- Francisco colar no SQL Editor do projeto real quando decidir. Sem isto,
-- todo módulo novo do admin lê/grava vazio (RLS ligada, sem policy = só
-- service role acessa, herdado do fim de 00000000000001_init.sql) — não é
-- bug das telas novas, é o mesmo comportamento que já valia para Produtos
-- antes de 00000000000002 ser aplicada.
--
-- Mesmo padrão de 00000000000002_admin_write_policies.sql: "for all" cobre
-- select/insert/update/delete com a MESMA condição (existe linha em
-- admin_users para o auth.uid() de quem chamou) em using e with check. Quem
-- autoriza a escrita é esta policy, lida pelo Postgres — nunca a UI do
-- admin, que usa createClient() (sessão, sob RLS), não createAdminClient()
-- (ver src/lib/supabase/server.ts).
--
-- POR QUE orders/order_items/payments/payment_events ENTRAM AQUI, mas o
-- WEBHOOK DE PAGAMENTO NÃO MUDA: o webhook (src/app/api/webhooks/pagamento/
-- route.ts) já usa createAdminClient() (service role), que ignora RLS por
-- completo — ele nunca dependeu, e continua não dependendo, de policy
-- nenhuma. Esta migration só abre a porta para o ADMIN HUMANO, autenticado
-- via Supabase Auth + admin_users, ler pedido/pagamento e mudar status
-- dentro da máquina de estados validada em src/lib/admin/order-status.ts —
-- nunca para marcar 'paid' (essa transição segue bloqueada na aplicação,
-- não no banco: RLS não sabe distinguir "admin mudando de preparing para
-- label_ready" de "admin mudando de new para paid", então a trava fica no
-- server action, e é por isso que o comentário de
-- src/lib/admin/order-status.ts existe).

create policy "admin manage orders" on orders for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage order_items" on order_items for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage payments" on payments for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage payment_events" on payment_events for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage customers" on customers for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage addresses" on addresses for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage shipments" on shipments for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage shipping_quotes" on shipping_quotes for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage tracking_events" on tracking_events for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage color_help_requests" on color_help_requests for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage warranty_requests" on warranty_requests for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage professional_leads" on professional_leads for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage reviews" on reviews for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage faq_items" on faq_items for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage content_blocks" on content_blocks for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage site_settings" on site_settings for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

-- audit_logs: mesma condição, mas propositalmente também de leitura para o
-- admin ver a trilha (não existe outro consumidor desta tabela hoje além do
-- próprio painel).
create policy "admin manage audit_logs" on audit_logs for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

-- analytics_events e pixel_event_log: sem tela de escrita neste módulo (o
-- escopo desta entrega não pediu edição delas), mas SEM policy de admin
-- elas ficariam inacessíveis até para um futuro painel de métricas olhar —
-- e "sem policy nenhuma" aqui não protege nada que a policy de escrita das
-- outras tabelas já não proteja (são tabelas de log, não de dinheiro).
-- Entram com a mesma condição por consistência com a lista pedida na
-- missão, mesmo sem UI própria ainda.
create policy "admin manage analytics_events" on analytics_events for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

create policy "admin manage pixel_event_log" on pixel_event_log for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));
