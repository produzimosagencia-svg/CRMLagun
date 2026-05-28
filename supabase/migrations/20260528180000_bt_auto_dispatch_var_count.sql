-- Adiciona contagem de variáveis no template para o auto-disparo
-- Evita enviar components para templates sem variáveis (ex: carrinho_aura)
alter table bt_auto_dispatch
  add column if not exists template_variable_count smallint not null default 0;

-- Atualiza registros existentes: carrinho_lebai tem {{1}}, carrinho_aura não tem
update bt_auto_dispatch set template_variable_count = 1 where template_name = 'carrinho_lebai';
update bt_auto_dispatch set template_variable_count = 0 where template_name = 'carrinho_aura';
