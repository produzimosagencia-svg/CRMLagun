import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Ticket, DollarSign, Users, ShoppingCart, RefreshCw,
  Loader2, Plus, Pencil, Trash2, X, CalendarDays, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';

const SUPABASE_URL = 'https://xwxiijbovreucnrbyput.supabase.co';

interface LagunEvent {
  id: string;
  nome: string;
  data: string;
  dia_semana: string;
  superticket_id: string;
  status: 'upcoming' | 'past';
  total_vendas: number | null;
  receita: number | null;
  participantes: number | null;
}

interface LiveStats {
  totalVendas: number;
  receita: number;
  participantes: number;
  ultimas: { nome: string; valor: number; hora: string }[];
}

interface FormData {
  nome: string;
  data: string;
  superticket_id: string;
  superticket_token: string;
  status: 'upcoming' | 'past';
}

const EMPTY_FORM: FormData = {
  nome: '',
  data: '',
  superticket_id: '',
  superticket_token: '',
  status: 'upcoming',
};

const DIAS_PT = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function getDiaSemana(dateStr: string) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return DIAS_PT[new Date(y, m - 1, d).getDay()];
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(v: string) {
  if (!v) return '';
  const [y, m, d] = v.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateTime(v: string) {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── Modal ──────────────────────────────────────────────────────────────────
function EventModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: LagunEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        nome: editing.nome,
        data: editing.data,
        superticket_id: editing.superticket_id,
        superticket_token: '', // never pre-fill token
        status: editing.status,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editing]);

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.nome || !form.data || !form.superticket_id) {
      toast.error('Preencha nome, data e ID Superticket');
      return;
    }
    if (!editing && !form.superticket_token) {
      toast.error('Token obrigatório para novo evento');
      return;
    }
    setSaving(true);
    try {
      const dia_semana = getDiaSemana(form.data);
      if (editing) {
        const payload: any = {
          nome: form.nome,
          data: form.data,
          dia_semana,
          superticket_id: form.superticket_id,
          status: form.status,
        };
        if (form.superticket_token) payload.superticket_token = form.superticket_token;
        const { error } = await supabase.from('lagun_events').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Evento atualizado!');
      } else {
        const { error } = await supabase.from('lagun_events').insert({
          nome: form.nome,
          data: form.data,
          dia_semana,
          superticket_id: form.superticket_id,
          superticket_token: form.superticket_token,
          status: form.status,
        });
        if (error) throw error;
        toast.success('Evento criado!');
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #1A0800 0%, #2B0E00 100%)' }}>
          <h3 className="text-sm font-bold" style={{ color: '#F5D470' }}>
            {editing ? 'Editar Evento' : 'Nova Edição'}
          </h3>
          <button onClick={onClose} className="text-[#F5D470]/60 hover:text-[#F5D470]">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nome do evento</label>
            <input
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8960C]"
              placeholder="ex: Lagun Friday #3"
              value={form.nome}
              onChange={e => set('nome', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Data</label>
              <input
                type="date"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8960C]"
                value={form.data}
                onChange={e => set('data', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Dia da semana</label>
              <div className="w-full text-sm border border-gray-100 rounded-lg px-3 py-2 bg-gray-50 text-gray-400">
                {getDiaSemana(form.data) || '—'}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">ID do evento (Superticket)</label>
            <input
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8960C] font-mono"
              placeholder="ex: 22540"
              value={form.superticket_id}
              onChange={e => set('superticket_id', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Token da API {editing && <span className="text-gray-300">(deixe vazio para manter o atual)</span>}
            </label>
            <input
              type="password"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8960C] font-mono"
              placeholder={editing ? '••••••••••••••••' : 'Cole o Bearer token aqui'}
              value={form.superticket_token}
              onChange={e => set('superticket_token', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <div className="flex gap-2">
              {(['upcoming', 'past'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => set('status', s)}
                  className="flex-1 text-xs py-2 rounded-lg border font-medium transition-all"
                  style={form.status === s
                    ? { backgroundColor: '#1A0800', color: '#F5D470', borderColor: '#C8960C' }
                    : { backgroundColor: 'white', color: '#9ca3af', borderColor: '#e5e7eb' }}
                >
                  {s === 'upcoming' ? 'Próximo' : 'Encerrado'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm px-5 py-2 rounded-lg font-semibold flex items-center gap-1.5 disabled:opacity-50"
            style={{ backgroundColor: '#1A0800', color: '#F5D470' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {editing ? 'Salvar' : 'Criar evento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Card de evento ativo ───────────────────────────────────────────────────
function EventCard({
  event,
  onEdit,
  onDelete,
}: {
  event: LagunEvent;
  onEdit: (e: LagunEvent) => void;
  onDelete: (id: string) => void;
}) {
  const [live, setLive] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/superticket-stats?id=${event.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLive(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [event.id]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const totalVendas = live?.totalVendas ?? event.total_vendas ?? null;
  const receita = live?.receita ?? event.receita ?? null;
  const participantes = live?.participantes ?? event.participantes ?? null;

  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{ borderColor: 'rgba(200,150,12,0.2)', backgroundColor: 'white' }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ background: 'linear-gradient(135deg, #1A0800 0%, #2B0E00 100%)' }}>
        <div>
          <p className="text-xs tracking-widest uppercase mb-0.5" style={{ color: 'rgba(245,212,112,0.6)' }}>
            {event.dia_semana} · {formatDate(event.data)}
          </p>
          <h3 className="text-base font-bold" style={{ color: '#F5D470' }}>{event.nome}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            title="Atualizar"
            className="p-1.5 rounded-lg hover:opacity-80 transition-all disabled:opacity-40"
            style={{ color: 'rgba(245,212,112,0.6)' }}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => onEdit(event)} title="Editar"
            className="p-1.5 rounded-lg hover:opacity-80 transition-all"
            style={{ color: 'rgba(245,212,112,0.6)' }}>
            <Pencil size={13} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 divide-x" style={{ borderBottom: '1px solid #f3f4f6' }}>
        {[
          { icon: <Ticket size={13} />, label: 'Vendas', value: loading ? '…' : (totalVendas ?? '—') },
          { icon: <DollarSign size={13} />, label: 'Receita', value: loading ? '…' : (receita != null ? formatCurrency(receita) : '—') },
          { icon: <Users size={13} />, label: 'Participantes', value: loading ? '…' : (participantes ?? '—') },
        ].map(({ icon, label, value }) => (
          <div key={label} className="px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-gray-400">
              {icon}
              <p className="text-[10px] uppercase tracking-wide">{label}</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Últimas compras */}
      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <ShoppingCart size={11} /> Últimas compras
        </p>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 size={18} className="animate-spin text-gray-300" />
          </div>
        ) : !live?.ultimas?.length ? (
          <p className="text-xs text-gray-400 text-center py-4">Nenhuma venda ainda</p>
        ) : (
          <>
            <div className="space-y-2">
              {(showAll ? live.ultimas : live.ultimas.slice(0, 5)).map((u, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0"
                  style={{ borderColor: '#f9fafb' }}>
                  <div>
                    <p className="text-xs font-medium text-gray-800">{u.nome}</p>
                    <p className="text-[10px] text-gray-400">{formatDateTime(u.hora)}</p>
                  </div>
                  <p className="text-xs font-bold" style={{ color: '#16a34a' }}>{formatCurrency(u.valor)}</p>
                </div>
              ))}
            </div>
            {live.ultimas.length > 5 && (
              <button onClick={() => setShowAll(v => !v)}
                className="mt-2 flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
                {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showAll ? 'Ver menos' : `Ver mais ${live.ultimas.length - 5}`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Dashboard principal ────────────────────────────────────────────────────
export default function InternoEventosDashboard() {
  const [events, setEvents] = useState<LagunEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LagunEvent | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('lagun_events')
      .select('id, nome, data, dia_semana, superticket_id, status, total_vendas, receita, participantes')
      .order('data', { ascending: false });
    if (!error && data) setEvents(data as LagunEvent[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  async function handleDelete(id: string) {
    if (!confirm('Excluir este evento?')) return;
    const { error } = await supabase.from('lagun_events').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir'); return; }
    toast.success('Evento excluído');
    loadEvents();
  }

  const upcoming = events.filter(e => e.status === 'upcoming');
  const past = events.filter(e => e.status === 'past');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={24} style={{ color: '#C8960C' }} />
      </div>
    );
  }

  return (
    <>
      {(modalOpen || editing) && (
        <EventModal
          editing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={loadEvents}
        />
      )}

      <div className="space-y-8 max-w-5xl">

        {/* ── Próximos eventos ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} style={{ color: '#C8960C' }} />
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Próximos eventos</h2>
              {upcoming.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(245,212,112,0.15)', color: '#8B6914' }}>
                  {upcoming.length}
                </span>
              )}
            </div>
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-90"
              style={{ backgroundColor: '#1A0800', color: '#F5D470' }}
            >
              <Plus size={13} /> Nova edição
            </button>
          </div>

          {upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed flex flex-col items-center justify-center py-12 gap-2"
              style={{ borderColor: 'rgba(200,150,12,0.3)' }}>
              <CalendarDays size={28} style={{ color: 'rgba(200,150,12,0.3)' }} />
              <p className="text-sm text-gray-400">Nenhum evento próximo cadastrado</p>
              <button
                onClick={() => { setEditing(null); setModalOpen(true); }}
                className="mt-1 text-xs px-4 py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: 'rgba(245,212,112,0.1)', color: '#8B6914' }}
              >
                + Cadastrar evento
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {upcoming.map(ev => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  onEdit={e => { setEditing(e); setModalOpen(true); }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Histórico ── */}
        {past.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Histórico</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                {past.length}
              </span>
            </div>

            <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#f3f4f6' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: '#f3f4f6', backgroundColor: '#fafafa' }}>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Evento</th>
                    <th className="text-center px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Data</th>
                    <th className="text-center px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Vendas</th>
                    <th className="text-center px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Receita</th>
                    <th className="text-center px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Participantes</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {past.map((ev, i) => (
                    <tr key={ev.id}
                      className="border-b last:border-0 hover:bg-gray-50 transition-colors"
                      style={{ borderColor: '#f9fafb' }}>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-gray-800">{ev.nome}</p>
                        <p className="text-[10px] text-gray-400">{ev.dia_semana}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600">{formatDate(ev.data)}</td>
                      <td className="px-4 py-3 text-center text-xs font-semibold text-gray-800">
                        {ev.total_vendas ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-semibold" style={{ color: '#16a34a' }}>
                        {ev.receita != null ? formatCurrency(ev.receita) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600">
                        {ev.participantes ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditing(ev); setModalOpen(true); }}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(ev.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
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
