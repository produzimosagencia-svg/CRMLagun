import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Link2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Vínculo das campanhas do Meta Ads com o evento, direto no card "Custos de
 * marketing" do dashboard do evento. Grava em lagun_event_campaigns (o mesmo
 * vínculo da tela Performance → Campanhas): cada campanha pertence a no máximo
 * um evento, então marcar aqui tira a campanha do evento anterior.
 */

type Campanha = { id: string; name: string; effective_status?: string };
export type Vinculo = { campaign_id: string; event_id: string; campaign_name: string | null; account_id: string | null };

const STATUS: Record<string, string> = { ACTIVE: 'Ativa', PAUSED: 'Pausada', CAMPAIGN_PAUSED: 'Pausada', ARCHIVED: 'Arquivada' };

export function CampanhasDoEvento({ eventoId, conta, vinculos, nomesEventos, onMudou }: {
  eventoId: string;
  conta: string;
  vinculos: Vinculo[];
  nomesEventos: Map<string, string>;
  onMudou: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [campanhas, setCampanhas] = useState<Campanha[] | null>(null);
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

  // Campanhas da conta escolhida, carregadas na primeira abertura.
  useEffect(() => { setCampanhas(null); }, [conta]);
  useEffect(() => {
    if (!aberto || campanhas) return;
    (async () => {
      const r = await supabase.functions.invoke(`meta-ads-api?action=campaigns&account_id=${conta}`, { method: 'GET' });
      const d = r.data as any;
      if (r.error || d?.error) { setErro(d?.error?.message ?? 'Não deu para ler as campanhas da Meta.'); setCampanhas([]); return; }
      setErro(null);
      setCampanhas((d?.data ?? []) as Campanha[]);
    })();
  }, [aberto, campanhas, conta]);

  const porCampanha = useMemo(() => new Map(vinculos.map((v) => [v.campaign_id, v])), [vinculos]);
  const doEvento = vinculos.filter((v) => v.event_id === eventoId);

  // Vinculadas a este evento primeiro, depois ativas, depois o resto.
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const peso = (c: Campanha) => (porCampanha.get(c.id)?.event_id === eventoId ? 0 : c.effective_status === 'ACTIVE' ? 1 : 2);
    return (campanhas ?? [])
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => peso(a) - peso(b) || a.name.localeCompare(b.name));
  }, [campanhas, busca, porCampanha, eventoId]);

  async function alternar(c: Campanha) {
    const marcada = porCampanha.get(c.id)?.event_id === eventoId;
    setSalvando(c.id);
    const { error } = marcada
      ? await (supabase as any).from('lagun_event_campaigns').delete().eq('campaign_id', c.id)
      : await (supabase as any).from('lagun_event_campaigns').upsert({
          campaign_id: c.id, event_id: eventoId, campaign_name: c.name, account_id: conta, updated_at: new Date().toISOString(),
        }, { onConflict: 'campaign_id' });
    setSalvando(null);
    if (error) setErro('Não deu para salvar o vínculo. Tente de novo.');
    else onMudou();
  }

  return (
    <div ref={caixa} className="relative mt-2">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`flex h-8 w-full items-center gap-2 rounded-lg border bg-[#12110E] px-2.5 text-left text-xs transition-colors ${aberto ? 'border-[#FFE14D]/60' : 'border-[#2A2822] hover:border-[#3A372F]'}`}
      >
        <Link2 size={13} className="flex-none text-[#FFE14D]" />
        <span className={`min-w-0 flex-1 truncate ${doEvento.length ? 'text-white' : 'text-[#8F8A7C]'}`}>
          {doEvento.length === 0 ? 'Vincular campanhas a este evento'
            : doEvento.length === 1 ? (doEvento[0].campaign_name ?? '1 campanha vinculada')
              : `${doEvento.length} campanhas vinculadas`}
        </span>
        <ChevronDown size={13} className={`flex-none text-[#8F8A7C] transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-[#2A2822] bg-[#12110E] p-1.5 shadow-2xl shadow-black/60">
          <div className="mb-1 flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5">
            <Search size={13} className="flex-none text-[#8F8A7C]" />
            <input
              autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar campanha"
              className="h-8 min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-[#8F8A7C]"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {campanhas === null && <p className="px-3 py-4 text-center text-xs text-[#8F8A7C]">Carregando campanhas…</p>}
            {erro && <p className="px-3 py-2 text-xs text-[#FB923C]">{erro}</p>}
            {campanhas && lista.length === 0 && !erro && <p className="px-3 py-4 text-center text-xs text-[#8F8A7C]">Nenhuma campanha encontrada.</p>}
            {lista.map((c) => {
              const v = porCampanha.get(c.id);
              const sel = v?.event_id === eventoId;
              const outro = v && !sel ? nomesEventos.get(v.event_id) ?? 'outro evento' : null;
              return (
                <button
                  key={c.id} type="button" disabled={salvando !== null} onClick={() => void alternar(c)}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-60 ${sel ? 'bg-[#FFE14D]/10' : 'hover:bg-white/[0.04]'}`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded border ${sel ? 'border-[#FFE14D] bg-[#FFE14D] text-black' : 'border-white/15'}`}>
                    {sel && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-xs ${sel ? 'font-semibold text-[#FFE14D]' : 'text-white'}`}>{salvando === c.id ? 'Salvando…' : c.name}</span>
                    <span className="block truncate text-[10px] text-[#8F8A7C]">
                      {STATUS[c.effective_status ?? ''] ?? c.effective_status?.toLowerCase() ?? ''}{outro ? ` · hoje em ${outro}` : ''}
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
