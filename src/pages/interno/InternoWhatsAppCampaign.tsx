import { useEffect, useState } from 'react';
import { Cake, RefreshCw, RotateCcw, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import WhatsappAttributionKpis, { type TrackingCampaign } from '@/components/WhatsappAttributionKpis';

type Message = { id: string; contact_name: string | null; phone: string; status: string; timestamp: string; template_name?: string | null; raw_payload: any };
const config = {
  carrinho_abandonado: { title: 'Carrinho Abandonado', description: 'Acompanhe os disparos de recuperação e as compras realizadas depois do clique.', icon: ShoppingCart },
  aniversario: { title: 'Aniversário', description: 'Público de aniversariantes, disparos e conversões rastreadas no CRM Lagun.', icon: Cake },
  estornos: { title: 'Estornos', description: 'Acompanhe mensagens de estorno sem depender dos painéis Zig Tickets ou Blueticket.', icon: RotateCcw },
} as const;

export default function InternoWhatsAppCampaign({ campaignKey }: { campaignKey: Exclude<TrackingCampaign, 'disparo'> }) {
  const item = config[campaignKey];
  const Icon = item.icon;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [birthdayCount, setBirthdayCount] = useState(0);

  async function load() {
    setLoading(true);
    const messageResult = await supabase.from('whatsapp_messages')
      .select('id,contact_name,phone,status,timestamp,raw_payload')
      .eq('direction', 'outgoing').eq('message_type', 'template')
      .order('timestamp', { ascending: false }).limit(1000);
    setMessages(((messageResult.data || []) as Message[]).filter((message) => message.raw_payload?.campaign_key === campaignKey));
    if (campaignKey === 'aniversario') {
      const month = new Date().getMonth() + 1;
      const { data } = await supabase.from('crm_customers').select('birth_date').not('birth_date', 'is', null);
      setBirthdayCount((data || []).filter((row: any) => Number(String(row.birth_date).slice(5, 7)) === month).length);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [campaignKey]);
  const delivered = messages.filter((message) => ['delivered', 'read'].includes(String(message.status).toLowerCase())).length;
  const failed = messages.filter((message) => ['failed', 'error', 'undelivered'].includes(String(message.status).toLowerCase())).length;

  return <div className="space-y-6">
    <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div><div className="flex items-center gap-2"><Icon size={20} className="text-[#E8C766]" /><h1 className="text-xl font-bold text-foreground">{item.title}</h1></div><p className="mt-1 text-sm text-muted-foreground">{item.description}</p></div>
      <div className="flex gap-2"><button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold"><RefreshCw size={14} /> Atualizar</button><Link to="/interno/whatsapp" className="rounded-lg bg-[#E8C766] px-3 py-2 text-xs font-bold text-[#17160f]">Novo disparo</Link></div>
    </header>

    <WhatsappAttributionKpis campaignKey={campaignKey} />

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      ['Mensagens enviadas', messages.length], ['Entregues', delivered], ['Falhas', failed],
      [campaignKey === 'aniversario' ? 'Aniversariantes no mês' : 'Taxa de entrega', campaignKey === 'aniversario' ? birthdayCount : `${messages.length ? Math.round(delivered / messages.length * 100) : 0}%`],
    ].map(([label, value]) => <div key={label} className="rounded-xl border border-[#2A2822] bg-[#1A1916] p-4"><p className="text-2xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p><p className="text-xs text-[#8F8A7C]">{label}</p></div>)}</div>

    <section className="rounded-xl border border-[#2A2822] bg-[#1A1916] p-4"><h2 className="font-bold text-white">Últimos disparos</h2><p className="mb-3 text-xs text-[#8F8A7C]">Histórico identificado pela campanha do template.</p>{loading ? <p className="py-8 text-center text-sm text-[#8F8A7C]">Carregando…</p> : messages.length === 0 ? <p className="py-8 text-center text-sm text-[#8F8A7C]">Nenhum disparo desta campanha ainda.</p> : <div className="divide-y divide-white/5">{messages.slice(0, 20).map((message) => <div key={message.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{message.contact_name || message.phone}</p><p className="text-xs text-[#8F8A7C]">{new Date(message.timestamp).toLocaleString('pt-BR')}</p></div><span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-[#D8D2C7]">{message.status}</span></div>)}</div>}</section>
  </div>;
}
