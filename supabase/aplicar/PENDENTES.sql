-- ===========================================================================
-- REVERÁ — as três migrations pendentes, numa colagem só.
--
-- Gerado em 26/08/2026 a partir de supabase/migrations/ (arquivos 4, 5 e 6).
-- Não edite este arquivo: ele é uma cópia de conveniência. A fonte são os
-- arquivos numerados, e é lá que qualquer correção deve entrar.
--
-- COMO USAR: Supabase → SQL Editor → cole tudo → Run.
-- Rodar de novo não faz mal: tudo aqui é 'if not exists' ou 'drop/create'.
--
-- O que cada bloco faz:
--   4 — o balde privado das fotos de "não sei qual cor escolher"
--   5 — deixa o admin logado enxergar pedidos, clientes e envios
--   6 — impede etiqueta duplicada (cada uma é paga na hora, da carteira)
-- ===========================================================================


-- ###########################################################################
-- 00000000000004_storage_color_help.sql
-- ###########################################################################

-- Bucket de storage para a ferramenta "Ajude-me a descobrir minha cor"
-- (/cores#ajuda) — 26/08/2026, auditoria de páginas públicas.
--
-- NÃO APLICADA ainda: este arquivo só existe na árvore de trabalho, para o
-- Francisco colar no SQL Editor do Supabase real quando decidir (mesmo
-- fluxo das migrations 00000000000001 e 00000000000002 — ver comentário
-- delas). Não rodar automaticamente daqui.
--
-- Privado, não público: é foto do cabelo de uma pessoa identificável, dado
-- sensível sob a LGPD (art. 5º, II — dado que revela característica
-- pessoal, tratado aqui com a mesma cautela que a lei pede para dado de
-- saúde/biometria, mesmo não sendo estritamente um desses). Por isso:
--   - "public" = false no bucket (nenhuma URL pública gerada por padrão);
--   - policy de INSERT liberada para o público (é assim que o formulário
--     do site grava a foto sem exigir login de cliente);
--   - NENHUMA policy de SELECT para anon/authenticated — só a service role
--     lê (ela ignora RLS por completo, é o mesmo client que
--     src/lib/supabase/server.ts chama de createAdminClient()). Sem essa
--     policy de leitura, um link para o arquivo não abre para ninguém que
--     não seja o backend administrativo.
--
-- A Server Action que grava aqui (src/app/cores/actions.ts) usa
-- createAdminClient() por padrão — a policy de INSERT abaixo existe para
-- não deixar a porta de escrita pública fechada por engano, caso o fluxo
-- mude no futuro para upload direto do navegador (client anônimo), mas não
-- é o caminho usado hoje.
insert into storage.buckets (id, name, public)
values ('color-help', 'color-help', false)
on conflict (id) do nothing;

drop policy if exists "anon insert color-help photos" on storage.objects;
create policy "anon insert color-help photos"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'color-help');

-- Nenhuma policy de select/update/delete criada de propósito: sem policy
-- pública, storage.objects segue a mesma regra do restante do banco (ver
-- fim de 00000000000001_init.sql) — só service role acessa.

-- ###########################################################################
-- 00000000000005_admin_pedidos_policies.sql
-- ###########################################################################

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

drop policy if exists "admin manage orders" on orders;
create policy "admin manage orders" on orders for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage order_items" on order_items;
create policy "admin manage order_items" on order_items for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage payments" on payments;
create policy "admin manage payments" on payments for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage payment_events" on payment_events;
create policy "admin manage payment_events" on payment_events for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage customers" on customers;
create policy "admin manage customers" on customers for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage addresses" on addresses;
create policy "admin manage addresses" on addresses for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage shipments" on shipments;
create policy "admin manage shipments" on shipments for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage shipping_quotes" on shipping_quotes;
create policy "admin manage shipping_quotes" on shipping_quotes for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage tracking_events" on tracking_events;
create policy "admin manage tracking_events" on tracking_events for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage color_help_requests" on color_help_requests;
create policy "admin manage color_help_requests" on color_help_requests for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage warranty_requests" on warranty_requests;
create policy "admin manage warranty_requests" on warranty_requests for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage professional_leads" on professional_leads;
create policy "admin manage professional_leads" on professional_leads for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage reviews" on reviews;
create policy "admin manage reviews" on reviews for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage faq_items" on faq_items;
create policy "admin manage faq_items" on faq_items for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage content_blocks" on content_blocks;
create policy "admin manage content_blocks" on content_blocks for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage site_settings" on site_settings;
create policy "admin manage site_settings" on site_settings for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

-- audit_logs: mesma condição, mas propositalmente também de leitura para o
-- admin ver a trilha (não existe outro consumidor desta tabela hoje além do
-- próprio painel).
drop policy if exists "admin manage audit_logs" on audit_logs;
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
drop policy if exists "admin manage analytics_events" on analytics_events;
create policy "admin manage analytics_events" on analytics_events for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

drop policy if exists "admin manage pixel_event_log" on pixel_event_log;
create policy "admin manage pixel_event_log" on pixel_event_log for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

-- ###########################################################################
-- 00000000000006_shipments_unique.sql
-- ###########################################################################

-- Um pedido, uma etiqueta.
--
-- Sem esta restrição, dois cliques em "Gerar etiqueta" (ou duas abas do
-- admin abertas no mesmo pedido) criam DUAS etiquetas na SuperFrete — e cada
-- etiqueta é paga com o saldo da carteira no instante em que é criada. O
-- prejuízo é silencioso: o pedido fica certo na tela, e a segunda etiqueta só
-- aparece na fatura.
--
-- A trava fica no BANCO, e não num `if` no código, pelo mesmo motivo que a
-- deduplicação do Purchase fica (ver pixel_event_log em 00000000000001):
-- um `if` que lê e depois escreve tem uma janela entre as duas operações, e
-- é exatamente nessa janela que o segundo clique entra. Uma constraint não
-- tem janela.
--
-- `unique` em vez de tornar order_id a chave primária: a tabela já tem id
-- próprio, e trocar a PK de uma tabela em produção não vale o ganho.
create unique index if not exists shipments_order_id_unico on shipments (order_id);

comment on index shipments_order_id_unico is
  'Impede etiqueta duplicada para o mesmo pedido. Cada etiqueta criada na SuperFrete é paga na hora com o saldo da carteira — duas etiquetas é dinheiro perdido, não só linha repetida.';
