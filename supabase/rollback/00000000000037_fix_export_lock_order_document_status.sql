-- A definição anterior lança "record old has no field status" em order_items.
-- Restaurá-la derrubaria o checkout. Exija uma migration corretiva explícita
-- caso seja necessário mudar novamente este gatilho.
do $$
begin
  raise exception 'Rollback da migration 37 bloqueado: a função anterior impede a criação de pedidos. Aplique uma correção versionada.';
end $$;
