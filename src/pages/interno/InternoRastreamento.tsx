import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, ExternalLink, Link2, MousePointerClick, RefreshCw, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Activity = {
  id: string; token: string; campaign_key: string; template_name: string | null;
  recipient_name: string | null; phone: string | null; sent_at: string;
  first_clicked_at: string | null; click_count: number; purchase_count: number;
  item_count: number; revenue: number;
};

const names: Record<string, string> = {
  disparo: 'Dashboard · Disparo', carrinho_abandonado: 'Carrinho abandonado',
  aniversario: 'Aniversário', estornos: 'Estornos',
};
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function InternoRastreamento() {
  const [rows, setRows] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from('wa_tracking_activity').select('*').order('sent_at', { ascending: false }).limit(1000);
    if (!error) setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel('lagun-wa-tracking-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_tracking_links' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_tracking_clicks' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const filtered = useMemo(() => campaign === 'all' ? rows : rows.filter((row) => row.campaign_key === campaign), [campaign, rows]);
  const stats = useMemo(() => ({
    sent: filtered.length,
    clicked: filtered.filter((row) => row.first_clicked_at).length,
    conversions: filtered.filter((row) => row.purchase_count > 0).length,
    revenue: filtered.reduce((sum, row) => sum + Number(row.revenue || 0), 0),
  }), [filtered]);
  const campaigns = [...new Set(rows.map((row) => row.campaign_key))];

  return <div className="mx-auto w-full max-w-[1500px] space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#FFE14D]"><BarChart3 size={15} /> WhatsApp · atribuição</div><h1 className="text-2xl font-black text-foreground">Rastreamento de links</h1><p className="mt-1 text-sm text-muted-foreground">Envios, cliques e compras atribuídas usando somente os dados do Lagun.</p></div>
      <div className="flex gap-2"><select value={campaign} onChange={(event) => setCampaign(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"><option value="all">Todas as campanhas</option>{campaigns.map((key) => <option key={key} value={key}>{names[key] || key}</option>)}</select><button onClick={() => void load()} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground"><RefreshCw size={15} /> Atualizar</button></div>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[
      ['Links enviados', stats.sent, Send, 'text-[#FFE14D]'], ['Pessoas que clicaram', stats.clicked, MousePointerClick, 'text-sky-400'],
      ['Conversões', stats.conversions, CheckCircle2, 'text-emerald-400'], ['Receita rastreada', money.format(stats.revenue), BarChart3, 'text-[#FFE14D]'],
    ].map(([label, value, Icon, color]: any) => <div key={label} className="rounded-xl border border-[#2A2822] bg-[#1A1916] p-4"><Icon size={18} className={color} /><p className="mt-3 text-2xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p><p className="text-xs text-[#8F8A7C]">{label}</p></div>)}</div>
    <section className="overflow-hidden rounded-xl border border-[#2A2822] bg-[#1A1916]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 className="font-bold text-white">Atividade em tempo real</h2><p className="text-xs text-[#8F8A7C]">O status muda assim que o contato abre o link.</p></div><span className="flex items-center gap-2 text-xs font-semibold text-emerald-400"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Ao vivo</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-white/[0.025] text-xs uppercase text-[#8F8A7C]"><tr><th className="px-5 py-3">Contato</th><th className="px-5 py-3">Campanha</th><th className="px-5 py-3">Envio</th><th className="px-5 py-3">Clique</th><th className="px-5 py-3">Conversão</th><th className="px-5 py-3">Link</th></tr></thead><tbody className="divide-y divide-white/[0.07]">{filtered.map((row) => <tr key={row.id}><td className="px-5 py-4"><p className="font-semibold text-white">{row.recipient_name || 'Contato'}</p><p className="text-xs text-[#8F8A7C]">{row.phone || '—'}</p></td><td className="px-5 py-4 text-[#D8D2C7]">{names[row.campaign_key] || row.campaign_key}<p className="text-xs text-[#8F8A7C]">{row.template_name || '—'}</p></td><td className="px-5 py-4 text-[#B8B2A6]">{dateTime.format(new Date(row.sent_at))}</td><td className="px-5 py-4">{row.first_clicked_at ? <span className="rounded-full bg-sky-400/10 px-2.5 py-1 text-xs font-semibold text-sky-300">{dateTime.format(new Date(row.first_clicked_at))}</span> : <span className="text-[#8F8A7C]">Ainda não</span>}</td><td className="px-5 py-4">{row.purchase_count > 0 ? <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">{row.item_count} item(ns) · {money.format(row.revenue)}</span> : <span className="text-[#8F8A7C]">—</span>}</td><td className="px-5 py-4"><a href={`/r/${row.token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#FFE14D]"><Link2 size={13} /> Abrir <ExternalLink size={11} /></a></td></tr>)}</tbody></table>{loading && <p className="py-14 text-center text-sm text-[#8F8A7C]">Carregando rastreamento…</p>}{!loading && filtered.length === 0 && <p className="py-14 text-center text-sm text-[#8F8A7C]">Os primeiros envios rastreáveis aparecerão aqui.</p>}</div>
    </section>
  </div>;
}
