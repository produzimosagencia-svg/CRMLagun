-- Publicações que não são de evento (institucional, bastidor, aviso) também
-- são classificadas: ficam com event_id nulo e tipo 'geral', e saem da fila
-- de "sem evento". A origem diz se foi a tela que classificou sozinha pela
-- legenda ('auto') ou alguém da equipe ('manual').
alter table public.lagun_event_posts alter column event_id drop not null;
alter table public.lagun_event_posts
  add column if not exists tipo text not null default 'evento' check (tipo in ('evento', 'geral')),
  add column if not exists origem text not null default 'manual' check (origem in ('manual', 'auto'));
