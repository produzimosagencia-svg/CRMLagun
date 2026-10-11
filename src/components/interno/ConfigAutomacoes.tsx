import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, CalendarClock, Clock3, ExternalLink, Instagram, RefreshCw, ShoppingCart, Ticket, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

/**
 * Admin → Configurações → Automações: tudo que roda sozinho no sistema, num
 * lugar só. Dois grupos:
 *   • Rotinas agendadas (pg_cron do banco): horário fixo; a tela mostra o
 *     horário e, quando existe, o liga/desliga da configuração.
 *   • Por gatilho: disparam quando algo acontece (compra abandonada, mensagem
 *     no Instagram, mensagem de sócio no WhatsApp).
 * Os horários do cron ficam nas migrações; não dá para mudar daqui.
 */

type Linha = {
  chave: string;
  nome: string;
  quando: string;
  descricao: string;
  icone: typeof Clock3;
  link?: string;
  /** null = sem liga/desliga (sempre ligada). */
  ligada: boolean | null;
  alerta?: string;
};

export function ConfigAutomacoes() {
  const [carregando, setCarregando] = useState(true);
  const [resumoLigado, setResumoLigado] = useState(false);
  const [resumoHora, setResumoHora] = useState('20:00');
  const [carrinhos, setCarrinhos] = useState<{ total: number; ligados: number }>({ total: 0, ligados: 0 });
  const [igAutomacoes, setIgAutomacoes] = useState<{ total: number; ativas: number }>({ total: 0, ativas: 0 });
  const [socios, setSocios] = useState<{ fixos: number; parceiros: number }>({ fixos: 0, parceiros: 0 });
  const [aniversario, setAniversario] = useState<number>(0);
  const [salvandoResumo, setSalvandoResumo] = useState(false);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const [cfg, bt, ig, parc, aniv] = await Promise.all([
        (supabase as any).from('lagun_resumo_config').select('enabled, hora').eq('id', 'default').maybeSingle(),
        (supabase as any).from('bt_auto_dispatch').select('enabled'),
        (supabase as any).from('ig_automations').select('active'),
        (supabase as any).from('lagun_partners').select('tipo'),
        (supabase as any).from('whatsapp_automation_campaigns').select('enabled, trigger_type'),
      ]);
      setResumoLigado(Boolean(cfg.data?.enabled));
      setResumoHora(cfg.data?.hora || '20:00');
      const btRows = (bt.data || []) as { enabled: boolean }[];
      setCarrinhos({ total: btRows.length, ligados: btRows.filter((r) => r.enabled).length });
      const igRows = (ig.data || []) as { active: boolean }[];
      setIgAutomacoes({ total: igRows.length, ativas: igRows.filter((r) => r.active).length });
      const pRows = (parc.data || []) as { tipo: string }[];
      setSocios({ fixos: pRows.filter((p) => p.tipo === 'fixo').length, parceiros: pRows.filter((p) => p.tipo !== 'fixo').length });
      setAniversario(((aniv.data || []) as { enabled: boolean; trigger_type: string }[]).filter((r) => r.trigger_type === 'birthday' && r.enabled).length);
      setCarregando(false);
    })();
  }, []);

  async function alternarResumo(ligar: boolean) {
    setSalvandoResumo(true);
    const anterior = resumoLigado;
    setResumoLigado(ligar);
    const { error } = await (supabase as any).from('lagun_resumo_config').update({ enabled: ligar, updated_at: new Date().toISOString() }).eq('id', 'default');
    setSalvandoResumo(false);
    if (error) { setResumoLigado(anterior); toast.error('Não foi possível salvar: ' + error.message); return; }
    toast.success(ligar ? 'Resumo dos sócios ligado' : 'Resumo dos sócios desligado');
  }

  const rotinas: Linha[] = [
    {
      chave: 'resumo', nome: 'Resumo diário para os sócios', quando: `Todo dia às ${resumoHora} (Brasília)`,
      descricao: 'Template com total de ingressos, vendidos no dia e botão do relatório, enquanto o evento tiver Zig ou campanha vinculada.',
      icone: CalendarClock, link: '/interno/whatsapp/resumo-produtores', ligada: resumoLigado,
    },
    {
      chave: 'zig', nome: 'Sincronização da Zig', quando: 'A cada 10 minutos',
      descricao: 'Lê os pedidos da ticketeira de cada evento com Zig vinculada. Alimenta o resumo e o bot.',
      icone: Ticket, link: '/interno/whatsapp/resumo-produtores', ligada: null,
    },
    {
      chave: 'ig-fila', nome: 'Fila do Instagram', quando: 'A cada minuto',
      descricao: 'Envia as respostas automáticas do Instagram que ficaram na fila (limite da Meta).',
      icone: RefreshCw, link: '/interno/automacoes', ligada: null,
    },
    {
      chave: 'ig-token', nome: 'Renovação do acesso ao Instagram', quando: 'Toda segunda, 3h',
      descricao: 'Renova o token da conta conectada antes de vencer.',
      icone: Instagram, link: '/interno/instagram', ligada: null,
    },
  ];

  const gatilhos: Linha[] = [
    {
      chave: 'bot', nome: 'Bot dos sócios no WhatsApp', quando: 'Quando um sócio manda mensagem',
      descricao: `Responde só a quem está em Parceiros (${socios.fixos} ${socios.fixos === 1 ? 'fixo' : 'fixos'}, ${socios.parceiros} ${socios.parceiros === 1 ? 'parceiro' : 'parceiros'}): eventos, Ads, vendas, disparos, relatório em PDF e perguntas livres.`,
      icone: Bot, link: '/interno/admin', ligada: null,
    },
    {
      chave: 'carrinho', nome: 'Carrinho abandonado (Blueticket)', quando: 'Quando a Blueticket avisa compra não concluída',
      descricao: `Manda o template do evento para quem abandonou o carrinho. ${carrinhos.ligados} de ${carrinhos.total} ${carrinhos.total === 1 ? 'evento configurado' : 'eventos configurados'} com envio ligado.`,
      icone: ShoppingCart, link: '/interno/whatsapp/carrinho-abandonado', ligada: carrinhos.ligados > 0,
      alerta: carrinhos.total && !carrinhos.ligados ? 'Nenhum evento com envio ligado.' : undefined,
    },
    {
      chave: 'ig', nome: 'Automações do Instagram', quando: 'Comentário, story ou direct com palavra-chave',
      descricao: `${igAutomacoes.ativas} de ${igAutomacoes.total} ${igAutomacoes.total === 1 ? 'automação' : 'automações'} ativas (resposta no direct, link, lembrete).`,
      icone: Zap, link: '/interno/automacoes', ligada: igAutomacoes.ativas > 0,
    },
    {
      chave: 'aniversario', nome: 'Aniversário', quando: 'No dia do aniversário do cliente',
      descricao: 'Desconto para quem faz aniversário no mês.',
      icone: CalendarClock, link: '/interno/whatsapp/aniversario', ligada: aniversario > 0,
      alerta: 'Ainda não tem rotina que envie: a tela existe, mas nenhuma mensagem sai sozinha.',
    },
  ];

  const Bloco = ({ titulo, sub, linhas }: { titulo: string; sub: string; linhas: Linha[] }) => (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Clock3 size={16} className="text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {linhas.map((l) => {
          const Icone = l.icone;
          return (
            <div key={l.chave} className="px-5 py-3 flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Icone size={15} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-foreground">{l.nome}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{l.quando}</span>
                  {l.ligada === null ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">sempre ligada</span>
                  ) : l.ligada ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">ligada</span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">desligada</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{l.descricao}</p>
                {l.alerta && <p className="mt-1 text-xs text-amber-500">{l.alerta}</p>}
                {l.link && (
                  <Link to={l.link} className="mt-1 inline-flex items-center gap-1 text-xs text-brand hover:underline">
                    Abrir <ExternalLink size={11} />
                  </Link>
                )}
              </div>
              {l.chave === 'resumo' && (
                <Switch checked={resumoLigado} disabled={salvandoResumo || carregando} onCheckedChange={alternarResumo} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 mb-6">
      <Bloco titulo="Rotinas agendadas" sub="Rodam em horário fixo, pelo relógio do banco. O horário muda só por migração." linhas={rotinas} />
      <Bloco titulo="Por gatilho" sub="Disparam quando algo acontece, sem horário." linhas={gatilhos} />
      <div className="rounded-md border border-dashed border-border bg-card/50 px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Disparos agendados</h2>
        <p className="mt-1 text-xs text-muted-foreground">Nenhum disparo programado ainda. Quando existir, aparece aqui com data, template, público e status.</p>
      </div>
    </div>
  );
}
