-- Dados de contato separados para o pedido de ajuda de cor.
-- `contact` continua para preservar os pedidos já existentes; os novos campos
-- permitem a equipe distinguir e-mail de WhatsApp e agir sem adivinhação.
alter table color_help_requests
  add column if not exists email text,
  add column if not exists phone text;

comment on column color_help_requests.email is
  'E-mail informado no pedido de ajuda de cor. Futuro retorno por e-mail só usa este campo.';
comment on column color_help_requests.phone is
  'Telefone/WhatsApp informado voluntariamente no pedido de ajuda de cor, para contato humano da equipe.';
