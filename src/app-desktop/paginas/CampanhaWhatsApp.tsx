import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Cake, Check, RefreshCw, RotateCcw, ShoppingCart, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { TrackingCampaign } from '@/components/WhatsappAttributionKpis';
import { lembrado, lembrar } from '@/app-desktop/memoria';

/**
 * Carrinho Abandonado, Aniversário e Estornos no APP (uma tela, três chaves).
 *
 * Mesmos dados da tela do site: disparos de template com campaign_key no
 * raw_payload (whatsapp_messages), atribuição do botão rastreável
 * (wa_campaign_attribution_stats) e o destino do botão (wa_tracking_config).
 * Desenho: letreiro com os números, disparos por dia em barras, atribuição
 * com o destino editável e a lista dos últimos disparos com status.
 */
type Chave = Exclude<TrackingCampaign, 'disparo'>;
interface Mensagem { id: string; contact_name: string | null; phone: string; status: string; timestamp: string; raw_payload: any }
interface Atribuicao { links_created: number; unique_clicks: number; direct_conversions: number; direct_revenue: number }

const CONFIG: Record<Chave, { titulo: string; descricao: string; icone: LucideIcon }> = {
  carrinho_abandonado: { titulo: 'Carrinho Abandonado', descricao: 'Disparos de recuperação e compras feitas depois do clique.', icone: ShoppingCart },
  aniversario: { titulo: 'Aniversário', descricao: 'Aniversariantes do mês, disparos e conversões rastreadas.', icone: Cake },
  estornos: { titulo: 'Estornos', descricao: 'Mensagens de estorno, sem depender dos painéis das ticketeiras.', icone: RotateCcw },
};
const VAZIA: Atribuicao = { links_created: 0, unique_clicks: 0, direct_conversions: 0, direct_revenue: 0 };
const nf = new Intl.NumberFormat('pt-BR');
const moeda = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ENTREGUE = new Set(['delivered', 'read']);
const FALHOU = new Set(['failed', 'error', 'undelivered']);

function statusInfo(s: string) {
  const k = String(s).toLowerCase();
  if (k === 'read') return { texto: 'Lida', cor: '#34D399' };
  if (k === 'delivered') return { texto: 'Entregue', cor: '#34D399' };
  if (FALHOU.has(k)) return { texto: 'Falhou', cor: '#F87171' };
  if (k === 'sent') return { texto: 'Enviada', cor: '#8FB4FF' };
  return { texto: s, cor: 'rgba(244,242,234,.5)' };
}

function Superficie({ titulo, sub, acao, className = '', children }: { titulo: string; sub?: ReactNode; acao?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`app-superficie flex flex-col p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] tracking-[0.12em] text-white">{titulo}</h2>
          {sub && <p className="mt-1 text-[11.5px] leading-snug text-white/45">{sub}</p>}
        </div>
        {acao}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export default function CampanhaWhatsApp({ campaignKey }: { campaignKey: Chave }) {
  const cfg = CONFIG[campaignKey];
  const Icone = cfg.icone;
  const chaveMemoria = `campanha-${campaignKey}`;
  const guardado = lembrado<{ mensagens: Mensagem[]; aniversariantes: number; atribuicao: Atribuicao; destino: string }>(chaveMemoria);
  const [mensagens, setMensagens] = useState<Mensagem[]>(guardado?.mensagens ?? []);
  const [aniversariantes, setAniversariantes] = useState(guardado?.aniversariantes ?? 0);
  const [atribuicao, setAtribuicao] = useState<Atribuicao>(guardado?.atribuicao ?? VAZIA);
  const [destino, setDestino] = useState(guardado?.destino ?? '');
  const [carregando, setCarregando] = useState(!guardado);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { lembrar(chaveMemoria, { mensagens, aniversariantes, atribuicao, destino }); }, [chaveMemoria, mensagens, aniversariantes, atribuicao, destino]);

  const carregar = useCallback(async () => {
    setCarregando((c) => c && mensagens.length === 0);
    const [msgs, stat, conf] = await Promise.all([
      supabase.from('whatsapp_messages').select('id,contact_name,phone,status,timestamp,raw_payload').eq('direction', 'outgoing').eq('message_type', 'template').order('timestamp', { ascending: false }).limit(1000),
      (supabase as any).from('wa_campaign_attribution_stats').select('*').eq('campaign_key', campaignKey).maybeSingle(),
      (supabase as any).from('wa_tracking_config').select('destination_url').eq('campaign_key', campaignKey).maybeSingle(),
    ]);
    setMensagens(((msgs.data || []) as Mensagem[]).filter((m) => m.raw_payload?.campaign_key === campaignKey));
    if (stat.data) setAtribuicao({ ...VAZIA, ...stat.data });
    setDestino(conf.data?.destination_url || '');
    if (campaignKey === 'aniversario') {
      const mes = new Date().getMonth() + 1;
      const { data } = await supabase.from('crm_customers').select('birth_date').not('birth_date', 'is', null);
      setAniversariantes((data || []).filter((r: any) => Number(String(r.birth_date).slice(5, 7)) === mes).length);
    }
    setCarregando(false);
  }, [campaignKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void carregar(); }, [carregar]);

  async function salvarDestino() {
    if (destino && !/^https:\/\//i.test(destino)) { toast.error('Informe um link completo começando com https://'); return; }
    setSalvando(true);
    const { error } = await (supabase as any).from('wa_tracking_config').update({ destination_url: destino || null, updated_at: new Date().toISOString() }).eq('campaign_key', campaignKey);
    setSalvando(false);
    if (error) toast.error('Não foi possível salvar o destino.'); else toast.success('Destino rastreável atualizado.');
  }

  const entregues = mensagens.filter((m) => ENTREGUE.has(String(m.status).toLowerCase())).length;
  const falhas = mensagens.filter((m) => FALHOU.has(String(m.status).toLowerCase())).length;
  const taxa = mensagens.length ? Math.round((entregues / mensagens.length) * 100) : 0;
  const ctr = atribuicao.links_created ? Math.round((atribuicao.unique_clicks / atribuicao.links_created) * 100) : 0;

  // Disparos por dia nos últimos 14 dias.
  const porDia = useMemo(() => {
    const dias: { dia: string; rotulo: string; total: number; entregues: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      dias.push({ dia: d.toISOString().slice(0, 10), rotulo: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), total: 0, entregues: 0 });
    }
    const idx = new Map(dias.map((d, i) => [d.dia, i]));
    for (const m of mensagens) {
      const k = new Date(m.timestamp).toISOString().slice(0, 10);
      const i = idx.get(k); if (i === undefined) continue;
      dias[i].total += 1; if (ENTREGUE.has(String(m.status).toLowerCase())) dias[i].entregues += 1;
    }
    return dias;
  }, [mensagens]);
  const maxDia = Math.max(1, ...porDia.map((d) => d.total));

  const numeros: { label: string; valor: string; sub: string; neon?: boolean }[] = [
    { label: 'Mensagens enviadas', valor: nf.format(mensagens.length), sub: 'desta campanha', neon: true },
    { label: 'Entregues', valor: nf.format(entregues), sub: 'entregues ou lidas' },
    { label: 'Falhas', valor: nf.format(falhas), sub: 'não chegaram' },
    campaignKey === 'aniversario'
      ? { label: 'Aniversariantes', valor: nf.format(aniversariantes), sub: 'no mês, na base do CRM' }
      : { label: 'Taxa de entrega', valor: `${taxa}%`, sub: 'entregues sobre enviadas' },
  ];

  return (
    <div className="space-y-4">
      {/* ── Letreiro ───────────────────────────────────────────────────── */}
      <section className="app-superficie app-superficie--alta overflow-hidden">
        <div className="flex items-center justify-between gap-6 border-b border-white/[0.07] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#FFE14D]/[0.12] text-[#FFE14D] ring-1 ring-[#FFE14D]/30"><Icone size={18} /></span>
            <div className="min-w-0">
              <p className="app-eyebrow">WhatsApp oficial · {cfg.titulo}</p>
              <p className="mt-0.5 truncate text-[13.5px] text-white/60">{cfg.descricao}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => void carregar()} disabled={carregando} className="app-aba h-9 px-4 text-[11.5px]"><RefreshCw size={12} className={carregando ? 'animate-spin' : ''} /> Atualizar</button>
            <Link to="/interno/whatsapp" className="app-aba ativo h-9 px-4 text-[11.5px]">Novo disparo <ArrowUpRight size={13} /></Link>
          </div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-white/[0.07]">
          {numeros.map((n) => (
            <div key={n.label} className="px-6 py-5">
              <p className="app-eyebrow">{n.label}</p>
              <p className={`app-letreiro mt-2 ${n.neon ? 'app-letreiro--neon' : ''}`}>{carregando && !mensagens.length ? <span className="inline-block h-9 w-20 animate-pulse rounded-md bg-white/[0.06] align-middle" /> : n.valor}</p>
              <p className="mt-1.5 text-[11.5px] text-white/40">{n.sub}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-12 gap-4">
        {/* ── Disparos por dia ─────────────────────────────────────────── */}
        <Superficie className="col-span-7" titulo="Disparos por dia" sub="Últimos 14 dias. A parte acesa é o que foi entregue.">
          <div className="flex h-[200px] items-end gap-2">
            {porDia.map((d) => (
              <div key={d.dia} className="group flex flex-1 flex-col items-center gap-2" title={`${d.rotulo}: ${d.total} enviadas, ${d.entregues} entregues`}>
                <span className="text-[10.5px] tabular-nums text-white/0 transition-colors group-hover:text-white/70">{d.total || ''}</span>
                <div className="relative flex w-full flex-1 items-end overflow-hidden rounded-[8px] bg-white/[0.04]">
                  <div className="absolute inset-x-0 bottom-0 rounded-[8px] bg-white/[0.12]" style={{ height: `${(d.total / maxDia) * 100}%` }} />
                  <div className="absolute inset-x-0 bottom-0 rounded-[8px]" style={{ height: `${(d.entregues / maxDia) * 100}%`, background: 'linear-gradient(180deg,#FFEC8A,#E8B923)', boxShadow: d.entregues ? '0 0 14px rgba(255,214,80,.45)' : undefined }} />
                </div>
                <span className="text-[9.5px] tabular-nums text-white/35">{d.rotulo.slice(0, 5)}</span>
              </div>
            ))}
          </div>
        </Superficie>

        {/* ── Atribuição ───────────────────────────────────────────────── */}
        <Superficie className="col-span-5" titulo="Botão rastreável" sub="Quem clicou no link da mensagem e comprou em até 7 dias.">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {([
              ['Links enviados', nf.format(atribuicao.links_created), '#F4F2EA', 'destinatários rastreáveis'],
              ['Cliques únicos', nf.format(atribuicao.unique_clicks), '#8FB4FF', `CTR ${ctr}%`],
              ['Conversões', nf.format(atribuicao.direct_conversions), '#34D399', 'compras em até 7 dias'],
              ['Receita rastreada', moeda(atribuicao.direct_revenue), '#FFE14D', 'base de compras Lagun'],
            ] as const).map(([l, v, c, s]) => (
              <div key={l}>
                <p className="app-eyebrow">{l}</p>
                <p className="app-titulo mt-1 text-[28px]" style={{ color: c }}>{v}</p>
                <p className="text-[11px] text-white/40">{s}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-white/[0.07] pt-4">
            <p className="app-eyebrow mb-2">Destino do botão</p>
            <div className="flex items-center gap-2">
              <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="https://…" className="h-10 min-w-0 flex-1 rounded-full border border-white/10 bg-black/40 px-4 text-[13px] text-white placeholder:text-white/30" />
              <button type="button" onClick={() => void salvarDestino()} disabled={salvando} className="app-aba ativo h-10 px-4 text-[11.5px] disabled:opacity-50"><Check size={13} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
            <p className="mt-2 text-[10.5px] text-white/35" data-selecionavel>O template usa o botão dinâmico https://lagun-gamma.vercel.app/r/{'{{1}}'}</p>
          </div>
        </Superficie>
      </div>

      {/* ── Últimos disparos ─────────────────────────────────────────────── */}
      <Superficie titulo="Últimos disparos" sub="Histórico identificado pela campanha do template." acao={<span className="app-eyebrow text-[10px]">{nf.format(mensagens.length)} no total</span>}>
        {carregando && !mensagens.length ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="app-esqueleto h-[52px]" />)}</div>
          : mensagens.length === 0 ? <p className="py-10 text-center text-[13px] text-white/40">Nenhum disparo desta campanha ainda.</p>
          : (
            <ul className="-mx-2 flex flex-col">
              {mensagens.slice(0, 30).map((m) => {
                const st = statusInfo(m.status);
                const nome = m.contact_name || m.phone;
                const hue = [...nome].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-[14px] px-2 py-2.5 transition-colors hover:bg-white/[0.035]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ring-1 ring-white/10" style={{ background: `radial-gradient(circle at 30% 30%, oklch(.70 .15 ${hue}), oklch(.42 .17 ${hue}) 70%)` }}>{nome.replace(/^\+/, '').slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-white">{nome}</p>
                      <p className="text-[11px] text-white/40">{m.contact_name ? `${m.phone} · ` : ''}{new Date(m.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold" style={{ color: st.cor, borderColor: `${st.cor}55`, background: `${st.cor}14` }}>
                      <i className="h-1.5 w-1.5 rounded-full" style={{ background: st.cor, boxShadow: `0 0 8px ${st.cor}` }} />{st.texto}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
      </Superficie>
    </div>
  );
}
