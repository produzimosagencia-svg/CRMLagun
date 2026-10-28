import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatPhone } from '@/lib/formatPhone';
import { variantesDoTelefone } from '@/lib/telefoneVariantes';

// Janela de 24 horas do WhatsApp: depois que a pessoa manda mensagem, a casa
// pode responder com texto livre (sem template) por 24h. Esta aba lista quem
// está com a janela aberta, destacando quem respondeu a um disparo.
// Parceiros (bot dos sócios) ficam de fora: não são clientes.

const JANELA_MS = 24 * 60 * 60 * 1000;

type Linha = {
  phone: string;
  nome: string | null;
  ultimaRecebida: string;
  ultimoTexto: string | null;
  recebidas: number;
  disparo: { quando: string; texto: string | null } | null;
};

function restante(desde: string, agora: number) {
  const ms = new Date(desde).getTime() + JANELA_MS - agora;
  if (ms <= 0) return { ms: 0, rotulo: 'Fechada' };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { ms, rotulo: h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min` };
}

export default function InternoWhatsApp24h() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'disparo' | 'todas'>('disparo');
  const [agora, setAgora] = useState(Date.now());

  async function load() {
    setLoading(true);
    const desde = new Date(Date.now() - JANELA_MS).toISOString();
    const [{ data: recebidas }, { data: parceiros }] = await Promise.all([
      supabase.from('whatsapp_messages')
        .select('phone,contact_name,message_text,timestamp')
        .eq('direction', 'incoming').eq('channel', 'whatsapp')
        .gte('timestamp', desde)
        .order('timestamp', { ascending: false }).limit(2000),
      (supabase as any).from('lagun_partners').select('telefone'),
    ]);
    const deParceiro = new Set(((parceiros || []) as Array<{ telefone: string | null }>)
      .flatMap((p) => variantesDoTelefone(p.telefone || '')));

    const porTelefone = new Map<string, Linha>();
    for (const m of (recebidas || []) as Array<{ phone: string; contact_name: string | null; message_text: string | null; timestamp: string }>) {
      if (variantesDoTelefone(m.phone).some((v) => deParceiro.has(v))) continue;
      const atual = porTelefone.get(m.phone);
      if (atual) { atual.recebidas += 1; if (!atual.nome && m.contact_name) atual.nome = m.contact_name; continue; }
      porTelefone.set(m.phone, { phone: m.phone, nome: m.contact_name, ultimaRecebida: m.timestamp, ultimoTexto: m.message_text, recebidas: 1, disparo: null });
    }

    // Último template enviado a cada um nos 7 dias anteriores à resposta.
    const telefones = [...porTelefone.keys()];
    for (let i = 0; i < telefones.length; i += 200) {
      const { data: enviados } = await supabase.from('whatsapp_messages')
        .select('phone,message_text,timestamp')
        .eq('direction', 'outgoing').eq('message_type', 'template')
        .in('phone', telefones.slice(i, i + 200))
        .gte('timestamp', new Date(Date.now() - 8 * JANELA_MS).toISOString())
        .order('timestamp', { ascending: false });
      for (const e of (enviados || []) as Array<{ phone: string; message_text: string | null; timestamp: string }>) {
        const linha = porTelefone.get(e.phone);
        if (linha && !linha.disparo && e.timestamp <= linha.ultimaRecebida) linha.disparo = { quando: e.timestamp, texto: e.message_text };
      }
    }

    setLinhas([...porTelefone.values()]);
    setAgora(Date.now());
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const relogio = setInterval(() => setAgora(Date.now()), 30_000);
    const canal = supabase.channel('janela-24h')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' }, (p) => {
        if ((p.new as { direction?: string }).direction === 'incoming') void load();
      })
      .subscribe();
    return () => { clearInterval(relogio); void supabase.removeChannel(canal); };
  }, []);

  const abertas = useMemo(() => linhas.filter((l) => restante(l.ultimaRecebida, agora).ms > 0), [linhas, agora]);
  const doDisparo = abertas.filter((l) => l.disparo);
  const fechandoLogo = abertas.filter((l) => restante(l.ultimaRecebida, agora).ms < 2 * 3_600_000);
  const visiveis = (filtro === 'disparo' ? doDisparo : abertas)
    .sort((a, b) => restante(a.ultimaRecebida, agora).ms - restante(b.ultimaRecebida, agora).ms);

  return <div className="space-y-6">
    <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <div className="flex items-center gap-2"><Clock size={20} className="text-[#FFE14D]" /><h1 className="text-xl font-bold text-foreground">Janela de 24 horas</h1></div>
        <p className="mt-1 text-sm text-muted-foreground">Quem mandou mensagem nas últimas 24h. Enquanto a janela está aberta, dá pra responder com texto livre, sem template e sem custo de disparo.</p>
      </div>
      <button onClick={() => void load()} className="flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-2 text-xs font-semibold"><RefreshCw size={14} /> Atualizar</button>
    </header>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[
      ['Janelas abertas', abertas.length, 'text-white'],
      ['Responderam a um disparo', doDisparo.length, 'text-emerald-400'],
      ['Fecham em menos de 2h', fechandoLogo.length, 'text-[#FFE14D]'],
    ].map(([label, value, cls]) => <div key={label as string} className="rounded-xl border border-[#2A2822] bg-[#1A1916] p-4"><p className={`text-2xl font-bold ${cls}`}>{(value as number).toLocaleString('pt-BR')}</p><p className="text-xs text-[#8F8A7C]">{label}</p></div>)}</div>

    <section className="rounded-xl border border-[#2A2822] bg-[#1A1916] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-bold text-white">Para responder</h2><p className="text-xs text-[#8F8A7C]">Quem fecha primeiro aparece em cima.</p></div>
        <div className="flex rounded-lg border border-[#2A2822] p-0.5 text-xs font-semibold">
          {([['disparo', 'Responderam ao disparo'], ['todas', 'Todas']] as const).map(([valor, rotulo]) =>
            <button key={valor} onClick={() => setFiltro(valor)} className={`rounded-md px-3 py-1.5 ${filtro === valor ? 'bg-[#FFE14D] text-[#17160f]' : 'text-[#8F8A7C]'}`}>{rotulo}</button>)}
        </div>
      </div>
      {loading && !linhas.length ? <p className="py-8 text-center text-sm text-[#8F8A7C]">Carregando…</p>
        : visiveis.length === 0 ? <p className="py-8 text-center text-sm text-[#8F8A7C]">{filtro === 'disparo' ? 'Ninguém respondeu a um disparo nas últimas 24h.' : 'Nenhuma janela aberta agora.'}</p>
        : <div className="divide-y divide-white/5">{visiveis.map((l) => {
          const r = restante(l.ultimaRecebida, agora);
          const pct = Math.max(0, Math.min(100, r.ms / JANELA_MS * 100));
          const cor = r.ms < 2 * 3_600_000 ? 'bg-[#FFE14D]' : 'bg-emerald-400';
          return <div key={l.phone} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><p className="truncate text-sm font-medium text-white">{l.nome || formatPhone(l.phone)}</p>{l.recebidas > 1 && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[#D8D2C7]">{l.recebidas} mensagens</span>}</div>
              <p className="mt-0.5 truncate text-xs text-[#D8D2C7]"><MessageCircle size={11} className="mr-1 inline" />{l.ultimoTexto || 'Mídia'}</p>
              {l.disparo && <p className="mt-0.5 truncate text-[11px] text-[#8F8A7C]"><Send size={10} className="mr-1 inline" />Disparo de {new Date(l.disparo.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}: {(l.disparo.texto || 'template').split('\n')[0].replace(/\*/g, '')}</p>}
            </div>
            <div className="flex items-center gap-3 sm:w-64">
              <div className="flex-1"><div className="flex justify-between text-[11px]"><span className="text-[#8F8A7C]">Fecha em</span><span className="font-semibold text-white">{r.rotulo}</span></div><div className="mt-1 h-1.5 rounded-full bg-white/5"><div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} /></div></div>
              <Link to={`/interno/whatsapp/chat?telefone=${l.phone}`} className="shrink-0 rounded-lg bg-[#FFE14D] px-3 py-2 text-xs font-bold text-[#17160f]">Responder</Link>
            </div>
          </div>;
        })}</div>}
    </section>
  </div>;
}
