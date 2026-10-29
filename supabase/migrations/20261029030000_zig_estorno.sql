-- Estorno da Zig, no mesmo cartão do carrinho abandonado: quando um pedido
-- muda para estornado (ou estornado parcialmente) numa sincronização, a
-- lagun-zig-sync manda o template escolhido. Só vale para a mudança vista
-- depois de ligar; pedido que já chega estornado não recebe.

alter table public.lagun_zig_carrinho
  add column if not exists estorno_enabled boolean not null default false,
  add column if not exists estorno_template_name text,
  add column if not exists estorno_template_language text not null default 'pt_BR',
  add column if not exists estorno_variable_count int not null default 0,
  add column if not exists estorno_header_image_url text,
  add column if not exists estorno_ligado_em timestamptz;

-- Um envio por pedido e por tipo (carrinho ou estorno).
alter table public.lagun_zig_carrinho_envios
  add column if not exists tipo text not null default 'carrinho' check (tipo in ('carrinho', 'estorno'));
alter table public.lagun_zig_carrinho_envios drop constraint if exists lagun_zig_carrinho_envios_pkey;
alter table public.lagun_zig_carrinho_envios add primary key (order_id, tipo);
