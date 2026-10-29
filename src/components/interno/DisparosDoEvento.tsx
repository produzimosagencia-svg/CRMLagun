import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Link2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Vínculo dos disparos de WhatsApp com o evento, no card "Custos de marketing"
 * do dashboard do evento. Um disparo é o grupo de templates enviados no mesmo
 * dia com a mesma primeira linha (RPC whatsapp_disparos); o vínculo fica em
 * lagun_event_disparos, um evento por disparo.
 */

export type Disparo = { dia: string; titulo: string; categoria: string; enviados: number; event_id: string | null };

const chave = (d: { dia: string; titulo: string }) => `${d.dia}|${d.titulo}`;
const diaBR = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

export function DisparosDoEvento({ eventoId, vinculados, nomesEventos, onMudou }: {
  eventoId: string;
  vinculados: Disparo[];
  nomesEventos: Map<string, string>;
  onMudou: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [disparos, setDisparos] = useState<Disparo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  // Disparos dos últimos 90 dias, recarregados a cada abertura.
  useEffect(() => {
    if (!aberto) return;
    (async () => {
      const desde = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
      const { data, error } = await (supabase as any).rpc('whatsapp_disparos', { p_desde: desde });
      if (error) { setErro('Não deu para ler os disparos.'); setDisparos([]); return; }
      setErro(null);
      setDisparos((data ?? []) as Disparo[]);
    })();
  }, [aberto]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (disparos ?? []).filter((d) => !q || d.titulo.toLowerCase().includes(q));
  }, [disparos, busca]);

  async function alternar(d: Disparo) {
    const marcado = d.event_id === eventoId;
    setSalvando(chave(d));
    const { error } = marcado
      ? await (supabase as any).from('lagun_event_disparos').delete().eq('dia', d.dia).eq('titulo', d.titulo)
      : await (supabase as any).from('lagun_event_disparos').upsert({
          dia: d.dia, titulo: d.titulo, event_id: eventoId, updated_at: new Date().toISOString(),
        }, { onConflict: 'dia,titulo' });
    setSalvando(null);
    if (error) { setErro('Não deu para salvar o vínculo. Tente de novo.'); return; }
    setDisparos((l) => l?.map((x) => (chave(x) === chave(d) ? { ...x, event_id: marcado ? null : eventoId } : x)) ?? l);
    onMudou();
  }

  const limpar = (t: string) => t.replace(/[*_~]/g, '').trim();

  return (
    <div ref={caixa} className="relative mt-2">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`flex h-8 w-full items-center gap-2 rounded-lg border bg-[#12110E] px-2.5 text-left text-xs transition-colors ${aberto ? 'border-[#FFE14D]/60' : 'border-[#2A2822] hover:border-[#3A372F]'}`}
      >
        <Link2 size={13} className="flex-none text-[#FFE14D]" />
        <span className={`min-w-0 flex-1 truncate ${vinculados.length ? 'text-white' : 'text-[#8F8A7C]'}`}>
          {vinculados.length === 0 ? 'Vincular disparos a este evento'
            : vinculados.length === 1 ? limpar(vinculados[0].titulo)
              : `${vinculados.length} disparos vinculados`}
        </span>
        <ChevronDown size={13} className={`flex-none text-[#8F8A7C] transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-[#2A2822] bg-[#12110E] p-1.5 shadow-2xl shadow-black/60">
          <div className="mb-1 flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5">
            <Search size={13} className="flex-none text-[#8F8A7C]" />
            <input
              autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar disparo"
              className="h-8 min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-[#8F8A7C]"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {disparos === null && <p className="px-3 py-4 text-center text-xs text-[#8F8A7C]">Carregando disparos…</p>}
            {erro && <p className="px-3 py-2 text-xs text-[#FB923C]">{erro}</p>}
            {disparos && lista.length === 0 && !erro && <p className="px-3 py-4 text-center text-xs text-[#8F8A7C]">Nenhum disparo nos últimos 90 dias.</p>}
            {lista.map((d) => {
              const k = chave(d);
              const sel = d.event_id === eventoId;
              const outro = d.event_id && !sel ? nomesEventos.get(d.event_id) || 'outro evento' : null;
              return (
                <button
                  key={k} type="button" disabled={salvando !== null} onClick={() => void alternar(d)}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-60 ${sel ? 'bg-[#FFE14D]/10' : 'hover:bg-white/[0.04]'}`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded border ${sel ? 'border-[#FFE14D] bg-[#FFE14D] text-black' : 'border-white/15'}`}>
                    {sel && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-xs ${sel ? 'font-semibold text-[#FFE14D]' : 'text-white'}`}>{salvando === k ? 'Salvando…' : limpar(d.titulo)}</span>
                    <span className="block truncate text-[10px] text-[#8F8A7C]">
                      {diaBR(d.dia)} · {Number(d.enviados).toLocaleString('pt-BR')} enviadas · {d.categoria === 'UTILITY' ? 'utilidade' : 'marketing'}{outro ? ` · hoje em ${outro}` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
