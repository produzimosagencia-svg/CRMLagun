import { useCallback, useEffect, useState } from 'react';
import { BadgeDollarSign, CheckCircle2, Link2, MousePointerClick } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export type TrackingCampaign = 'disparo' | 'carrinho_abandonado' | 'aniversario' | 'estornos';
type Stats = { links_created: number; unique_clicks: number; direct_conversions: number; direct_revenue: number };
const empty: Stats = { links_created: 0, unique_clicks: 0, direct_conversions: 0, direct_revenue: 0 };
const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function WhatsappAttributionKpis({ campaignKey }: { campaignKey: TrackingCampaign }) {
  const [stats, setStats] = useState<Stats>(empty);
  const [destination, setDestination] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: stat }, { data: config }] = await Promise.all([
      (supabase as any).from('wa_campaign_attribution_stats').select('*').eq('campaign_key', campaignKey).maybeSingle(),
      (supabase as any).from('wa_tracking_config').select('destination_url').eq('campaign_key', campaignKey).maybeSingle(),
    ]);
    if (stat) setStats({ ...empty, ...stat });
    setDestination(config?.destination_url || '');
  }, [campaignKey]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (destination && !/^https:\/\//i.test(destination)) {
      toast.error('Informe um link completo começando com https://');
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from('wa_tracking_config')
      .update({ destination_url: destination || null, updated_at: new Date().toISOString() })
      .eq('campaign_key', campaignKey);
    setSaving(false);
    if (error) toast.error('Não foi possível salvar o destino.');
    else toast.success('Destino rastreável atualizado.');
  }

  const ctr = stats.links_created ? Math.round((stats.unique_clicks / stats.links_created) * 100) : 0;
  const cards = [
    { label: 'Links enviados', value: stats.links_created.toLocaleString('pt-BR'), detail: 'destinatários rastreáveis', icon: Link2, color: 'text-[#FFE14D]' },
    { label: 'Cliques únicos', value: stats.unique_clicks.toLocaleString('pt-BR'), detail: `CTR ${ctr}%`, icon: MousePointerClick, color: 'text-sky-400' },
    { label: 'Conversões', value: stats.direct_conversions.toLocaleString('pt-BR'), detail: 'compras em até 7 dias', icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Receita rastreada', value: money(stats.direct_revenue), detail: 'base de compras Lagun', icon: BadgeDollarSign, color: 'text-[#FFE14D]' },
  ];

  return <section className="space-y-3">
    <div className="flex flex-col gap-3 rounded-xl border border-[#2A2822] bg-[#1A1916] p-4 md:flex-row md:items-end">
      <div className="flex-1">
        <label className="mb-1 block text-[11px] text-[#8F8A7C]">Destino do botão rastreável</label>
        <Input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="https://..." className="border-white/10 bg-white/5 text-white" />
        <p className="mt-1 text-[10px] text-[#8F8A7C]">O template deve usar o botão dinâmico: https://lagun-gamma.vercel.app/r/&#123;&#123;1&#125;&#125;</p>
      </div>
      <Button onClick={() => void save()} disabled={saving} className="bg-[#FFE14D] text-[#17160f] hover:bg-[#f1d77f]">{saving ? 'Salvando…' : 'Salvar destino'}</Button>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map((card) => <div key={card.label} className="rounded-xl border border-[#2A2822] bg-[#1A1916] p-4">
        <card.icon size={17} className={card.color} />
        <p className="mt-2 text-2xl font-bold text-white">{card.value}</p>
        <p className="text-[11px] font-medium text-[#D8D2C7]">{card.label}</p>
        <p className="text-[10px] text-[#8F8A7C]">{card.detail}</p>
      </div>)}
    </div>
  </section>;
}
