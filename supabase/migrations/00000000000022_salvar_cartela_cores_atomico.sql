-- A tela administrativa salva a cartela inteira de uma vez. A transação da
-- função impede que uma falha no meio deixe apenas algumas cores atualizadas.
create or replace function salvar_cartela_cores(p_cores jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cor jsonb;
  cor_id uuid;
  linhas_afetadas integer;
begin
  if auth.uid() is null or not exists (
    select 1 from admin_users where id = auth.uid()
  ) then
    raise exception 'Apenas administradores podem salvar a cartela.';
  end if;

  if jsonb_typeof(p_cores) <> 'array' then
    raise exception 'A cartela de cores é inválida.';
  end if;

  for cor in select value from jsonb_array_elements(p_cores)
  loop
    if coalesce(nullif(btrim(cor->>'code'), ''), '') = ''
      or coalesce(nullif(btrim(cor->>'name'), ''), '') = '' then
      raise exception 'Código e nome da cor são obrigatórios.';
    end if;

    if cor->>'id' is null then
      insert into colors (code, name, photo_url, sort_order, is_active)
      values (
        btrim(cor->>'code'),
        btrim(cor->>'name'),
        nullif(btrim(cor->>'photo_url'), ''),
        (cor->>'sort_order')::integer,
        (cor->>'is_active')::boolean
      );
    else
      cor_id := (cor->>'id')::uuid;
      update colors
      set
        code = btrim(cor->>'code'),
        name = btrim(cor->>'name'),
        photo_url = nullif(btrim(cor->>'photo_url'), ''),
        sort_order = (cor->>'sort_order')::integer,
        is_active = (cor->>'is_active')::boolean
      where id = cor_id;
      get diagnostics linhas_afetadas = row_count;
      if linhas_afetadas <> 1 then
        raise exception 'A cor % não foi encontrada.', cor_id;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function salvar_cartela_cores(jsonb) from public;
grant execute on function salvar_cartela_cores(jsonb) to authenticated;
