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

create policy "anon insert color-help photos"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'color-help');

-- Nenhuma policy de select/update/delete criada de propósito: sem policy
-- pública, storage.objects segue a mesma regra do restante do banco (ver
-- fim de 00000000000001_init.sql) — só service role acessa.
