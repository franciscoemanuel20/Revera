-- Emirados Árabes Unidos não usam código postal. A aplicação conserva a
-- mesma exigência para todo outro destino internacional e libera somente AE.
-- Sem esta exceção, um endereço válido chegaria ao banco e falharia na
-- constraint genérica, depois de a pessoa já ter preenchido o checkout.

alter table addresses drop constraint if exists endereco_completo_por_pais;

alter table addresses add constraint endereco_completo_por_pais check (
  case
    when country = 'BR' then
      cep is not null and street is not null and number is not null
      and neighborhood is not null and city is not null and state is not null
    when country = 'AE' then
      line1 is not null and city is not null
    else
      line1 is not null and city is not null and postal_code is not null
  end
);

comment on constraint endereco_completo_por_pais on addresses is
  'Endereco brasileiro exige CEP/rua/numero/bairro/cidade/UF. Estrangeiro exige line1/cidade/postal_code, exceto Emirados Árabes Unidos, onde não há código postal.';
