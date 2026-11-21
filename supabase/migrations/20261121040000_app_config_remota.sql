-- Configurações remotas dos apps de iPhone da Lagun (Lagun Administração e Lagun), 2026-11-21.
-- O app lê estas chaves ao abrir, ao entrar, ao voltar para a frente e a cada minuto.
-- Mudar uma chave muda o comportamento de uma função que JÁ existe no app (texto, ligar/desligar,
-- ordem, limite), sem build novo. Nunca guardar segredo aqui: quem está logado lê tudo.
-- Escrita só pelo servidor (service role / SQL); não há policy de escrita.
-- A conta de revisão da Apple ignora a tabela e usa só os padrões do código.
-- Guia: Cofre/clientes/lagun/app-config-remota.md.
create table if not exists public.app_config (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  atualizado_em timestamptz not null default now()
);
alter table public.app_config enable row level security;
drop policy if exists app_config_ler on public.app_config;
create policy app_config_ler on public.app_config for select to authenticated using (true);

create or replace function public.app_config_tocar() returns trigger language plpgsql set search_path = public as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists app_config_tocar on public.app_config;
create trigger app_config_tocar before update on public.app_config for each row execute function public.app_config_tocar();

-- Valores = padrões atuais do código (nada muda no app ao criar as linhas).
insert into public.app_config (chave, valor, descricao) values
  ('inicio.aviso', '{"texto":"","cor":"#1C1C1E"}', 'Aviso do dia no topo do Início. texto: até 280 caracteres (vazio esconde). cor: fundo em #RRGGBB, texto branco, use cor escura.'),
  ('inicio.secoes', '["vendas","eventos","tarefas"]', 'Ordem das seções do Início. Valores: "vendas", "eventos", "tarefas". Tirar da lista esconde; lista vazia volta ao padrão.'),
  ('inicio.titulos', '{"eventos":"Nossos eventos","tarefas":"Suas tarefas"}', 'Títulos das seções de eventos e de tarefas do Início.'),
  ('inicio.tarefas.quantas', '3', 'Quantas tarefas aparecem em "Suas tarefas" no Início (1 a 10).'),
  ('inicio.eventos.quantos', '4', 'Quantas noites por vir aparecem em "Nossos eventos" no Início (1 a 12).'),
  ('inicio.grafico.hora_inicio', '6', 'Hora em que começa o gráfico de vendas por hora do Início (0 a 12).'),
  ('inicio.aviso_ao_vivo.animado', 'true', 'Aviso verde "Bar ao vivo" do Início entra e sai com animação (true) ou aparece direto (false).'),
  ('aovivo.renovar', '{"aberto":30,"fechado":120,"sem_evento":60}', 'Segundos entre leituras do bar (Ao vivo, Mapa e aviso do Início). aberto: 15 a 300; fechado (evento encerrado): 30 a 900; sem_evento: 15 a 900.'),
  ('aovivo.listas', '{"bares":5,"produtos":8,"horas_checkin":10}', 'Tamanho das listas do Ao vivo: bares no ranking (1 a 20), produtos que mais vendem (1 a 20, o servidor manda até 8), horas no gráfico de entradas (3 a 24).'),
  ('aovivo.areas', '{"pista":"Pista","vip":"Área VIP"}', 'Nomes das áreas no ranking "Áreas" do Ao vivo.'),
  ('mapa.lounges.local', '{"L1":"Backstage","L2":"Backstage","L3":"VIP","L4":"VIP","L5":"Pista","L6":"Pista"}', 'Onde fica cada lounge, como aparece no Mapa da casa ("Lounge 1 · Backstage"). Vazio volta ao padrão.'),
  ('links', '{"privacidade_admin":"https://www.lagunvitoria.com.br/privacidade/app","privacidade_cliente":"https://www.lagunvitoria.com.br/privacidade","termos":"https://www.lagunvitoria.com.br/termos","whatsapp":"5527997789988"}', 'Links dos apps. privacidade_admin (Lagun Administração), privacidade_cliente (app Lagun) e termos: só https. whatsapp: só dígitos com DDI (app Lagun, ajuda no login e Falar com a Lagun).')
on conflict (chave) do nothing;
