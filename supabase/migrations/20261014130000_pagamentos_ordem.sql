-- Sequência de pagamento dentro de cada evento: 1, 2, 3… Quem lança define a
-- ordem na aba A pagar; sem ordem, entra no fim (pela data de lançamento).
alter table public.lagun_pagamentos add column if not exists ordem integer;
create index if not exists lagun_pagamentos_evento_ordem_idx on public.lagun_pagamentos (event_id, ordem);
