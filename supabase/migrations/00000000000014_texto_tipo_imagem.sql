-- ===========================================================================
-- A FOTO DE UMA PÁGINA VIRA UM TEXTO EDITÁVEL (02/09/2026)
-- ===========================================================================
-- Pedido do Francisco: "dentro da função Admin, é necessário ter a opção da
-- administradora fazer alterações tanto nos textos do site, quanto nas
-- imagens".
--
-- O texto já era editável desde a migration 12. A foto não era: trocar
-- qualquer imagem de página exigia deploy.
--
-- ---------------------------------------------------------------------------
-- POR QUE ISTO É UMA LINHA DE `check`, E NÃO UMA TABELA NOVA
-- ---------------------------------------------------------------------------
-- `site_images` seria o caminho óbvio, e repetiria em outra tabela tudo que
-- `site_texts` já faz: chave estável, valor que sobrescreve o código,
-- ausência de linha = volta ao original. Duas tabelas com a mesma regra é a
-- mesma regra escrita duas vezes — e regra escrita duas vezes é regra que um
-- dia diverge.
--
-- O que muda entre um título e uma foto não é o armazenamento: os dois são um
-- texto curto que substitui o do código. O que muda é a CAIXA que o painel
-- desenha, e isso é a coluna `tipo`. Então o banco só precisa passar a
-- aceitar mais um valor nela.
--
-- O `valor` de uma linha `tipo = 'imagem'` é o endereço da foto — sempre
-- dentro do bucket público `site-media`. Quem valida isso é o painel, na
-- gravação (src/lib/conteudo/midia.ts): endereço ruim não deixa a foto
-- quebrada, deixa a PÁGINA quebrada, porque o next/image recusa host que não
-- esteja em `images.remotePatterns`.
--
-- ---------------------------------------------------------------------------
-- SE A MIGRATION 12 AINDA NÃO FOI APLICADA
-- ---------------------------------------------------------------------------
-- Este arquivo não faz nada e não dá erro. Em 02/09/2026 esse era exatamente
-- o caso do banco de produção da Reverá: `site_texts` e `banners` não
-- existiam, e por isso /admin/textos estava somente-leitura desde que foi
-- construído. Quem for aplicar: use supabase/aplicar/CONTEUDO-EDITAVEL.sql,
-- que já sai com 'imagem' na lista e cobre as duas migrations de uma vez.
-- ===========================================================================

do $$
begin
  if to_regclass('public.site_texts') is null then
    raise notice 'site_texts não existe ainda (migration 12 não aplicada). Nada a fazer.';
    return;
  end if;

  -- Nome gerado pelo Postgres para um `check` declarado na coluna `tipo` de
  -- `site_texts` na migration 12. Se um dia alguém recriar a tabela com a
  -- restrição nomeada à mão, é este nome que precisa ser mantido.
  alter table site_texts drop constraint if exists site_texts_tipo_check;
  alter table site_texts
    add constraint site_texts_tipo_check
    check (tipo in ('texto', 'paragrafo', 'imagem'));
end
$$;
