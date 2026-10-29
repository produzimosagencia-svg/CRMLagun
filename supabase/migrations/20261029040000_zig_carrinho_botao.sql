-- Template único para todos os eventos: {{1}} primeiro nome, {{2}} nome do
-- evento e botão com link variável (a parte final do link do evento na Zig).
-- Aqui fica o começo fixo do link do botão, como está no template.
alter table public.lagun_zig_carrinho
  add column if not exists botao_url_base text,
  add column if not exists estorno_botao_url_base text;
