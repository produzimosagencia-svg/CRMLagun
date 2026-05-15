import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, Plus, Pencil, Trash2, X, CalendarDays, MapPin, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

const SUPABASE_URL = 'https://xwxiijbovreucnrbyput.supabase.co';

// ── Types ──────────────────────────────────────────────────────────────────
interface LagunEvent {
  id: string; nome: string; data: string; dia_semana: string;
  local: string | null; imagem_url: string | null;
  superticket_id: string; status: 'upcoming' | 'past';
  total_vendas: number | null; receita: number | null; participantes: number | null;
}
interface DayBucket { date: string; label: string; count: number; receita: number }
interface LiveStats {
  totalVendas: number; pagos: number; cortesias: number;
  receita: number; participantes: number;
  hoje: { count: number; receita: number };
  ontem: { count: number; receita: number };
  last7: DayBucket[];
  ultimas: { nome: string; valor: number; hora: string; cortesia: boolean }[];
}
interface FormData {
  nome: string; data: string; local: string; imagem_url: string;
  superticket_id: string; superticket_token: string; status: 'upcoming' | 'past';
}

const EMPTY_FORM: FormData = { nome:'', data:'', local:'', imagem_url:'', superticket_id:'', superticket_token:'', status:'upcoming' };
const DIAS_PT = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
function getDiaSemana(d: string) { if (!d) return ''; const [y,m,day]=d.split('-').map(Number); return DIAS_PT[new Date(y,m-1,day).getDay()]; }
function fCurrency(v: number) { return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) }
function fDate(v: string) { if (!v) return ''; const [y,m,d]=v.split('-'); return `${d}/${m}/${y}` }
function fTime(v: string) { if (!v) return '—'; return new Date(v).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) }

// ── Bar Chart with tooltip ─────────────────────────────────────────────────
function BarChart({ data }: { data: DayBucket[] }) {
  const [tip, setTip] = useState<number | null>(null);
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-14 relative">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 flex-1 relative"
          onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)}>
          {/* Tooltip */}
          {tip === i && d.count > 0 && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap
              text-[10px] font-semibold text-white bg-gray-800 rounded px-2 py-1 shadow-lg pointer-events-none">
              {d.count} ingresso{d.count !== 1 ? 's' : ''}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
            </div>
          )}
          {/* Bar */}
          <div className="w-full rounded-sm transition-all duration-150 cursor-default"
            style={{
              height: `${Math.max((d.count / max) * 44, d.count > 0 ? 5 : 2)}px`,
              backgroundColor: d.count > 0 ? '#16a34a' : '#e5e7eb',
            }} />
          <span className="text-[9px] font-medium text-gray-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stat pill ──────────────────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-bold ml-auto" style={{ color: color || '#111827' }}>{value}</span>
    </div>
  );
}

// ── Event Card ─────────────────────────────────────────────────────────────
function EventCard({ event, onEdit }: { event: LagunEvent; onEdit: (e: LagunEvent) => void }) {
  const [live, setLive] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/superticket-stats?id=${event.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setLive(await res.json());
    } catch (e) { console.error(e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [event.id]);

  useEffect(() => { fetchStats() }, [fetchStats]);

  const totalVendas = live?.totalVendas ?? event.total_vendas ?? 0;
  const receita     = live?.receita    ?? event.receita    ?? 0;

  const InfoSide = (
    <div className="flex-1 px-5 py-4 flex flex-col justify-between min-w-0">
      <div>
        {/* Nome maior */}
        <h3 className="text-lg font-bold text-gray-900 leading-tight mb-1 truncate">{event.nome}</h3>
        <p className="text-sm font-medium text-gray-600 flex items-center gap-1.5 mb-0.5">
          <CalendarDays size={13} className="text-gray-400 shrink-0" />
          {event.dia_semana}, {fDate(event.data)}
        </p>
        {event.local && (
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <MapPin size={12} className="shrink-0" /> {event.local}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 mt-4">
        <button onClick={() => fetchStats(true)} disabled={refreshing}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-40 transition-colors" title="Atualizar">
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => onEdit(event)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" title="Editar">
          <Pencil size={13} />
        </button>
      </div>
    </div>
  );

  const StatsSide = (
    <div className="shrink-0 px-5 py-4 flex flex-col gap-3 bg-gray-50 border-l border-gray-100"
      style={{ minWidth: 220 }}>
      {/* Gráfico */}
      {live?.last7 ? <BarChart data={live.last7} /> : (
        <div className="h-14 flex items-center justify-center">
          <Loader2 size={14} className="animate-spin text-gray-300" />
        </div>
      )}

      {/* Ingressos */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Ingressos</p>
        <p className="text-3xl font-bold text-gray-900 leading-none">
          {loading ? '…' : totalVendas}
        </p>
        {live && (
          <div className="mt-1.5 space-y-0.5">
            <StatPill label="pagos"     value={live.pagos}     color="#16a34a" />
            <StatPill label="cortesias" value={live.cortesias} color="#dc2626" />
          </div>
        )}
      </div>

      {/* Receita */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Receita</p>
        <p className="text-base font-bold text-gray-900">{loading ? '…' : fCurrency(receita)}</p>
      </div>

      {/* Ontem / Hoje */}
      <div className="grid grid-cols-2 gap-2">
        {[{ label: 'Ontem', data: live?.ontem }, { label: 'Hoje', data: live?.hoje }].map(({ label, data }) => (
          <div key={label} className="rounded-lg bg-white border border-gray-100 px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{label}</p>
            <p className="text-xs font-bold text-gray-800">
              {loading || !data ? '…' : `${data.count}`}
            </p>
            <p className="text-[10px] text-green-600 font-medium">
              {loading || !data ? '' : fCurrency(data.receita)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm">
      {/* Desktop */}
      <div className="hidden md:flex">
        {/* Imagem 5:4 */}
        <div className="shrink-0" style={{ width: 156 }}>
          <div className="relative" style={{ paddingTop: '80%' }}>
            {event.imagem_url
              ? <img src={event.imagem_url} alt={event.nome} className="absolute inset-0 w-full h-full object-cover" />
              : <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                  <CalendarDays size={24} className="text-gray-300" />
                </div>
            }
          </div>
        </div>
        {InfoSide}
        {StatsSide}
      </div>

      {/* Mobile */}
      <div className="flex flex-col md:hidden">
        <div className="relative w-full" style={{ paddingTop: '80%' }}>
          {event.imagem_url
            ? <img src={event.imagem_url} alt={event.nome} className="absolute inset-0 w-full h-full object-cover" />
            : <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                <CalendarDays size={36} className="text-gray-300" />
              </div>
          }
        </div>
        <div className="px-4 pt-3 pb-1">
          <h3 className="text-lg font-bold text-gray-900">{event.nome}</h3>
          <p className="text-sm font-medium text-gray-600 flex items-center gap-1.5 mt-0.5">
            <CalendarDays size={13} className="text-gray-400" /> {event.dia_semana}, {fDate(event.data)}
          </p>
          {event.local && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
              <MapPin size={12} /> {event.local}
            </p>
          )}
          <div className="flex gap-1 mt-2">
            <button onClick={() => fetchStats(true)} disabled={refreshing}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-40">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => onEdit(event)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <Pencil size={13} />
            </button>
          </div>
        </div>
        <div className="mx-3 mb-3 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-3">
          {live?.last7 && <BarChart data={live.last7} />}
          <div className="flex gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Ingressos</p>
              <p className="text-3xl font-bold text-gray-900">{loading ? '…' : totalVendas}</p>
              {live && (
                <div className="mt-1 space-y-0.5">
                  <StatPill label="pagos"     value={live.pagos}     color="#16a34a" />
                  <StatPill label="cortesias" value={live.cortesias} color="#dc2626" />
                </div>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Receita</p>
              <p className="text-base font-bold text-gray-900">{loading ? '…' : fCurrency(receita)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[{ label: 'Ontem', data: live?.ontem }, { label: 'Hoje', data: live?.hoje }].map(({ label, data }) => (
              <div key={label} className="rounded-lg bg-white border border-gray-100 px-3 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
                <p className="text-xs font-bold text-gray-800">{loading||!data?'…':`${data.count}`}</p>
                <p className="text-[10px] text-green-600 font-medium">{loading||!data?'':fCurrency(data.receita)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────
const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8960C] bg-white';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>{children}</div>;
}

function EventModal({ editing, onClose, onSaved }: {
  editing: LagunEvent | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editing ? {
      nome: editing.nome, data: editing.data, local: editing.local||'',
      imagem_url: editing.imagem_url||'', superticket_id: editing.superticket_id,
      superticket_token: '', status: editing.status,
    } : EMPTY_FORM);
  }, [editing]);

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.nome || !form.data || !form.superticket_id) { toast.error('Preencha nome, data e ID'); return; }
    if (!editing && !form.superticket_token) { toast.error('Token obrigatório'); return; }
    setSaving(true);
    try {
      const payload: any = {
        nome: form.nome, data: form.data, dia_semana: getDiaSemana(form.data),
        local: form.local||null, imagem_url: form.imagem_url||null,
        superticket_id: form.superticket_id, status: form.status,
      };
      if (form.superticket_token) payload.superticket_token = form.superticket_token;
      const { error } = editing
        ? await supabase.from('lagun_events').update(payload).eq('id', editing.id)
        : await supabase.from('lagun_events').insert(payload);
      if (error) throw error;
      toast.success(editing ? 'Evento atualizado!' : 'Evento criado!');
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">{editing ? 'Editar Evento' : 'Nova Edição'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Nome"><input className={inputCls} placeholder="ex: Lagun Friday #3" value={form.nome} onChange={e=>set('nome',e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><input type="date" className={inputCls} value={form.data} onChange={e=>set('data',e.target.value)} /></Field>
            <Field label="Dia da semana"><div className={`${inputCls} bg-gray-50 text-gray-400`}>{getDiaSemana(form.data)||'—'}</div></Field>
          </div>
          <Field label="Local / Venue"><input className={inputCls} placeholder="ex: Lagun Vitória, ES" value={form.local} onChange={e=>set('local',e.target.value)} /></Field>
          <Field label="URL da imagem (ex: /flyer-sexta.png)"><input className={inputCls} placeholder="/flyer-nome.png ou https://..." value={form.imagem_url} onChange={e=>set('imagem_url',e.target.value)} /></Field>
          <Field label="ID do evento (Superticket)"><input className={`${inputCls} font-mono`} placeholder="ex: 22540" value={form.superticket_id} onChange={e=>set('superticket_id',e.target.value)} /></Field>
          <Field label={editing?'Token (deixe vazio pra manter)':'Token da API'}>
            <input type="password" className={`${inputCls} font-mono`} placeholder={editing?'••••••••':'Cole o Bearer token'} value={form.superticket_token} onChange={e=>set('superticket_token',e.target.value)} />
          </Field>
          <Field label="Status">
            <div className="flex gap-2">
              {(['upcoming','past'] as const).map(s=>(
                <button key={s} onClick={()=>set('status',s)}
                  className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-all ${form.status===s?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-400 border-gray-200'}`}>
                  {s==='upcoming'?'Próximo':'Encerrado'}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="text-sm px-5 py-2 rounded-lg bg-gray-900 text-white font-semibold flex items-center gap-1.5 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {editing?'Salvar':'Criar evento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard principal ────────────────────────────────────────────────────
export default function InternoEventosDashboard() {
  const [events, setEvents]   = useState<LagunEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LagunEvent | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('lagun_events')
      .select('id,nome,data,dia_semana,local,imagem_url,superticket_id,status,total_vendas,receita,participantes')
      .order('data', { ascending: false });
    if (data) setEvents(data as LagunEvent[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadEvents() }, [loadEvents]);

  async function handleDelete(id: string) {
    if (!confirm('Excluir este evento?')) return;
    const { error } = await supabase.from('lagun_events').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir'); return; }
    toast.success('Evento excluído');
    loadEvents();
  }

  const upcoming = events.filter(e => e.status === 'upcoming');
  const past      = events.filter(e => e.status === 'past');

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-gray-300" size={24} />
    </div>
  );

  return (
    <>
      {(modalOpen || editing) && (
        <EventModal editing={editing} onClose={() => { setModalOpen(false); setEditing(null) }} onSaved={loadEvents} />
      )}

      <div className="space-y-8 max-w-4xl">

        {/* Próximos */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays size={15} className="text-gray-400" />
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Próximos eventos</h2>
              {upcoming.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{upcoming.length}</span>
              )}
            </div>
            <button onClick={() => { setEditing(null); setModalOpen(true) }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors">
              <Plus size={13} /> Nova edição
            </button>
          </div>

          {upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 flex flex-col items-center py-14 gap-3">
              <CalendarDays size={32} className="text-gray-200" />
              <p className="text-sm text-gray-400">Nenhum evento próximo</p>
              <button onClick={() => { setEditing(null); setModalOpen(true) }}
                className="text-xs px-4 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
                + Cadastrar evento
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {upcoming.map(ev => (
                <EventCard key={ev.id} event={ev} onEdit={e => { setEditing(e); setModalOpen(true) }} />
              ))}
            </div>
          )}
        </section>

        {/* Histórico */}
        {past.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Histórico</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">{past.length}</span>
            </div>
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Evento','Data','Ingressos','Cortesias','Receita',''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {past.map(ev => (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors border-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-gray-800">{ev.nome}</p>
                        <p className="text-[10px] text-gray-400">{ev.dia_semana}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{fDate(ev.data)}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-gray-800">{ev.total_vendas ?? '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-red-500">—</td>
                      <td className="px-4 py-3 text-xs font-semibold text-green-600">{ev.receita!=null?fCurrency(ev.receita):'—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditing(ev); setModalOpen(true) }}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"><Pencil size={13} /></button>
                          <button onClick={() => handleDelete(ev.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </>
  );
}
