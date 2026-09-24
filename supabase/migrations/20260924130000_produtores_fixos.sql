-- Produtores fixos da casa: lista separada da de parceiros, na mesma tabela,
-- distinguida por `tipo`. Só os parceiros aparecem para vincular aos eventos.
alter table public.lagun_partners
  add column if not exists tipo text not null default 'parceiro'
  check (tipo in ('parceiro', 'fixo'));

create index if not exists lagun_partners_tipo_idx on public.lagun_partners (tipo);

-- Produtores fixos iniciais (telefone só com dígitos, com 55).
insert into public.lagun_partners (nome, telefone, tipo) values
  ('Bruno Faria', '5527992034000', 'fixo'),
  ('Saulo',       '5527997950362', 'fixo'),
  ('Dalla',       '5527997789988', 'fixo'),
  ('Guilherme',   '5527996528524', 'fixo');
