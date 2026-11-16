// Painel de lounges: por evento, o que vendeu (site e WhatsApp), o que está
// aguardando Pix e o que está livre. Lê direto do banco (equipe vê tudo pela RLS).
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

type Evento = { id: string; nome: string; data: string; show_on_landing: boolean };
type Lounge = { id: string; codigo: string | null; nome: string; ordem: number | null };
type Reserva = {
  id: string; codigo: string; origem: string; status: string; lounge_id: string; event_id: string;
  nome: string; cpf: string | null; telefone: string | null; pago: number; txid: string | null;
  created_at: string; pago_em: string | null; expira_em: string | null;
};

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataCurta = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
const hora = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const telefone = (t: string | null) => {
  const d = (t ?? '').replace(/\D/g, '').replace(/^55/, '');
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t ?? '—';
};
const cpfMascara = (c: string | null) => (c && c.length === 11 ? `${c.slice(0, 3)}.***.***-${c.slice(9)}` : '—');
const ORIGEM: Record<string, string> = { site: 'Site', whatsapp: 'WhatsApp', app: 'App' };
const STATUS: Record<string, { rotulo: string; cor: string }> = {
  confirmada: { rotulo: 'Vendido', cor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  aguardando: { rotulo: 'Aguardando Pix', cor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  expirada: { rotulo: 'Pix venceu', cor: 'bg-muted text-muted-foreground' },
  cancelada: { rotulo: 'Cancelada', cor: 'bg-muted text-muted-foreground' },
};

export default function InternoLounges() {
  const [params, setParams] = useSearchParams();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [lounges, setLounges] = useState<Lounge[]>([]);
  const [abertos, setAbertos] = useState<Record<string, Record<string, number>>>({});
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [verHistorico, setVerHistorico] = useState(false);
  const eventoId = params.get('evento');

  async function carregar() {
    const desde = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
    const sb = supabase as any;
    const [{ data: evs }, { data: ls }, { data: evl }, { data: res }] = await Promise.all([
      sb.from('lagun_events').select('id, nome, data, show_on_landing').gte('data', desde).order('data'),
      sb.from('lagun_lounges').select('id, codigo, nome, ordem').eq('ativo', true).order('ordem'),
      sb.from('lagun_evento_lounges').select('event_id, lounge_id, preco'),
      sb.from('lagun_lounge_reservas')
        .select('id, codigo, origem, status, lounge_id, event_id, nome, cpf, telefone, pago, txid, created_at, pago_em, expira_em')
        .gte('created_at', new Date(Date.now() - 90 * 86400_000).toISOString())
        .order('created_at', { ascending: false }),
    ]);
    const mapa: Record<string, Record<string, number>> = {};
    for (const r of (evl ?? []) as any[]) (mapa[r.event_id] ??= {})[r.lounge_id] = Number(r.preco);
    setAbertos(mapa);
    setLounges((ls ?? []) as Lounge[]);
    setReservas(((res ?? []) as any[]).map((r) => ({ ...r, pago: Number(r.pago) })));
    // Só noites com lounge cadastrado.
    setEventos(((evs ?? []) as Evento[]).filter((e) => mapa[e.id]));
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30_000);
    return () => clearInterval(t);
  }, []);

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const visiveis = eventos.filter((e) => verHistorico || e.data >= hoje);
  const atual = eventos.find((e) => e.id === eventoId) ?? visiveis[0] ?? null;

  const resumoPorEvento = useMemo(() => {
    const m: Record<string, { vendidos: number; total: number; aguardando: number }> = {};
    for (const r of reservas) {
      const x = (m[r.event_id] ??= { vendidos: 0, total: 0, aguardando: 0 });
      if (r.status === 'confirmada') { x.vendidos++; x.total += r.pago; }
      if (r.status === 'aguardando') x.aguardando++;
    }
    return m;
  }, [reservas]);

  const doEvento = atual ? reservas.filter((r) => r.event_id === atual.id) : [];
  const ativa = (loungeId: string) => doEvento.find((r) => r.lounge_id === loungeId && (r.status === 'confirmada' || r.status === 'aguardando'));
  const loungesDaNoite = atual ? lounges.filter((l) => abertos[atual.id]?.[l.id] != null) : [];
  const r = atual ? resumoPorEvento[atual.id] ?? { vendidos: 0, total: 0, aguardando: 0 } : null;

  if (carregando) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lounges</h1>
          <p className="text-sm text-muted-foreground">Vendas pelo site (lagunvitoria.com.br/lounges) e pelo WhatsApp. Atualiza a cada 30 s.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={verHistorico} onChange={(e) => setVerHistorico(e.target.checked)} />
            Mostrar eventos passados
          </label>
          <a href="/lounges" target="_blank" rel="noreferrer" className="text-sm underline">Abrir página pública</a>
        </div>
      </div>

      {/* Eventos */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {visiveis.map((e) => {
          const s = resumoPorEvento[e.id];
          const total = Object.keys(abertos[e.id] ?? {}).length;
          const sel = atual?.id === e.id;
          return (
            <button
              key={e.id}
              onClick={() => setParams({ evento: e.id })}
              className={`shrink-0 rounded-xl border px-4 py-3 text-left transition-colors ${sel ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
            >
              <p className="text-sm font-semibold whitespace-nowrap">{e.nome}</p>
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                {dataCurta(e.data)} · {s?.vendidos ?? 0}/{total} vendidos{!e.show_on_landing && e.data >= hoje ? ' · fora da landing' : ''}
              </p>
            </button>
          );
        })}
        {!visiveis.length && <p className="text-sm text-muted-foreground">Nenhum evento com lounge cadastrado. Abra os lounges da noite em Landing Page.</p>}
      </div>

      {atual && r && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Indicador rotulo="Vendidos" valor={`${r.vendidos} de ${loungesDaNoite.length}`} />
            <Indicador rotulo="Faturado" valor={reais(r.total)} />
            <Indicador rotulo="Aguardando Pix" valor={String(r.aguardando)} />
            <Indicador rotulo="Livres" valor={String(loungesDaNoite.filter((l) => !ativa(l.id)).length)} />
          </div>

          {/* Mapa em grade */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {loungesDaNoite.map((l) => {
              const res = ativa(l.id);
              const st = res ? STATUS[res.status] : null;
              return (
                <div key={l.id} className={`rounded-xl border p-3 ${res?.status === 'confirmada' ? 'border-emerald-500/40' : ''}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{l.codigo ?? l.nome}</p>
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${st?.cor ?? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'}`}>{st?.rotulo ?? 'Livre'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{l.nome.split('·')[1]?.trim() ?? ''} · {reais(abertos[atual.id][l.id])}</p>
                  {res && (
                    <div className="mt-2 text-xs space-y-0.5">
                      <p className="font-medium truncate">{res.nome}</p>
                      <p className="text-muted-foreground">{ORIGEM[res.origem] ?? res.origem} · {res.codigo}{res.txid?.startsWith('TESTE') ? ' · teste' : ''}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Lista */}
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr>
                  <th className="p-3">Lounge</th><th className="p-3">Situação</th><th className="p-3">Titular</th><th className="p-3">CPF</th>
                  <th className="p-3">WhatsApp</th><th className="p-3">Canal</th><th className="p-3">Valor</th><th className="p-3">Criada</th><th className="p-3">Paga</th>
                </tr>
              </thead>
              <tbody>
                {doEvento.map((x) => {
                  const l = lounges.find((y) => y.id === x.lounge_id);
                  const st = STATUS[x.status] ?? { rotulo: x.status, cor: 'bg-muted' };
                  return (
                    <tr key={x.id} className="border-b last:border-0">
                      <td className="p-3 font-medium whitespace-nowrap">{l?.codigo ?? l?.nome ?? '—'} <span className="text-muted-foreground font-normal">{x.codigo}</span></td>
                      <td className="p-3"><span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${st.cor}`}>{st.rotulo}</span>{x.txid?.startsWith('TESTE') && <span className="ml-1 text-[11px] text-muted-foreground">teste</span>}</td>
                      <td className="p-3 whitespace-nowrap">{x.nome}</td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{cpfMascara(x.cpf)}</td>
                      <td className="p-3 whitespace-nowrap">
                        {x.telefone ? <a className="underline" href={`/interno/whatsapp/chat?telefone=${x.telefone}`}>{telefone(x.telefone)}</a> : '—'}
                      </td>
                      <td className="p-3">{ORIGEM[x.origem] ?? x.origem}</td>
                      <td className="p-3 whitespace-nowrap">{reais(x.pago)}</td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{hora(x.created_at)}</td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{hora(x.pago_em)}</td>
                    </tr>
                  );
                })}
                {!doEvento.length && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Nenhuma reserva nesta noite ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold mt-1">{valor}</p>
    </div>
  );
}
