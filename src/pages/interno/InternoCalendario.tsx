import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  partner: string | null;
  color: string;
}

const EVENT_COLORS = [
  { value: 'indigo',  bg: 'bg-indigo-500',  light: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300',  label: 'Índigo' },
  { value: 'amber',   bg: 'bg-amber-400',   light: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',    label: 'Âmbar' },
  { value: 'emerald', bg: 'bg-emerald-500', light: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300', label: 'Verde' },
  { value: 'rose',    bg: 'bg-rose-500',    light: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300',       label: 'Rosa' },
  { value: 'violet',  bg: 'bg-violet-500',  light: 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300',  label: 'Violeta' },
  { value: 'sky',     bg: 'bg-sky-500',     light: 'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300',          label: 'Azul' },
  { value: 'orange',  bg: 'bg-orange-500',  light: 'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300',  label: 'Laranja' },
  { value: 'teal',    bg: 'bg-teal-500',    light: 'bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300',       label: 'Teal' },
];

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const emptyForm = { title: '', date: '', start_time: '', end_time: '', description: '', partner: '', color: 'indigo' };

export default function InternoCalendario() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents]         = useState<CalendarEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<CalendarEvent | null>(null);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [form, setForm]             = useState({ ...emptyForm });
  const [draggedId, setDraggedId]   = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState<string | null>(null);

  useEffect(() => { fetchEvents(); }, [year, month]);

  async function fetchEvents() {
    setLoading(true);
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const start    = new Date(firstDay);
    start.setDate(start.getDate() - firstDay.getDay());
    const end = new Date(lastDay);
    end.setDate(end.getDate() + (6 - lastDay.getDay()));

    const { data, error } = await (supabase as any)
      .from('calendar_events')
      .select('*')
      .gte('date', start.toISOString().split('T')[0])
      .lte('date', end.toISOString().split('T')[0])
      .order('start_time', { ascending: true, nullsFirst: true });

    if (!error) setEvents(data || []);
    setLoading(false);
  }

  function openNew(date: string) {
    setEditing(null);
    setForm({ ...emptyForm, date });
    setModalOpen(true);
  }

  function openEdit(ev: CalendarEvent, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(ev);
    setForm({
      title: ev.title,
      date: ev.date,
      start_time: ev.start_time || '',
      end_time: ev.end_time || '',
      description: ev.description || '',
      partner: ev.partner || '',
      color: ev.color || 'indigo',
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Título obrigatório'); return; }
    if (!form.date)          { toast.error('Data obrigatória');   return; }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      date: form.date,
      start_time: form.start_time || null,
      end_time:   form.end_time   || null,
      description: form.description || null,
      partner: form.partner || null,
      color: form.color,
    };
    const { error } = editing
      ? await (supabase as any).from('calendar_events').update(payload).eq('id', editing.id)
      : await (supabase as any).from('calendar_events').insert(payload);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success(editing ? 'Evento atualizado!' : 'Evento criado!');
    setModalOpen(false);
    fetchEvents();
  }

  async function handleDelete() {
    if (!editing) return;
    setDeleting(true);
    const { error } = await (supabase as any).from('calendar_events').delete().eq('id', editing.id);
    setDeleting(false);
    if (error) { toast.error('Erro ao excluir'); return; }
    toast.success('Evento excluído');
    setModalOpen(false);
    fetchEvents();
  }

  function handleDragStart(ev: React.DragEvent, eventId: string) {
    setDraggedId(eventId);
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', eventId);
  }

  function handleDragOver(ev: React.DragEvent, dateStr: string) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    setDragOver(dateStr);
  }

  function handleDragLeave() {
    setDragOver(null);
  }

  async function handleDrop(ev: React.DragEvent, targetDate: string) {
    ev.preventDefault();
    setDragOver(null);
    const id = ev.dataTransfer.getData('text/plain') || draggedId;
    if (!id) return;
    const original = events.find(e => e.id === id);
    if (!original || original.date === targetDate) return;

    // Optimistic update
    setEvents(prev => prev.map(e => e.id === id ? { ...e, date: targetDate } : e));

    const { error } = await (supabase as any)
      .from('calendar_events')
      .update({ date: targetDate })
      .eq('id', id);

    if (error) {
      toast.error('Erro ao mover evento');
      setEvents(prev => prev.map(e => e.id === id ? { ...e, date: original.date } : e));
    } else {
      toast.success('Evento movido!');
    }
    setDraggedId(null);
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const days: { date: Date; current: boolean }[] = [];
    for (let i = firstDay.getDay(); i > 0; i--) {
      const d = new Date(firstDay); d.setDate(d.getDate() - i);
      days.push({ date: d, current: false });
    }
    for (let d = 1; d <= lastDay.getDate(); d++)
      days.push({ date: new Date(year, month, d), current: true });
    const rem = 7 - (days.length % 7);
    if (rem < 7) for (let i = 1; i <= rem; i++) {
      const d = new Date(lastDay); d.setDate(d.getDate() + i);
      days.push({ date: d, current: false });
    }
    return days;
  }, [year, month]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(ev => {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    });
    return map;
  }, [events]);

  const colorLight = (c: string) =>
    EVENT_COLORS.find(x => x.value === c)?.light ?? EVENT_COLORS[0].light;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            {MONTHS_PT[month]} {year}
          </h1>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
              <ChevronLeft size={17} />
            </button>
            <button
              onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }}
              className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            >
              Hoje
            </button>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
              <ChevronRight size={17} />
            </button>
          </div>
          {loading && <div className="h-4 w-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />}
        </div>
        <Button
          size="sm"
          onClick={() => openNew(todayStr)}
          className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 h-8 text-xs"
        >
          <Plus size={14} /> Novo evento
        </Button>
      </div>

      {/* ── Day-of-week header ── */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 shrink-0">
        {DAYS_PT.map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* ── Calendar grid ── */}
      <div className="flex-1 grid grid-cols-7 overflow-y-auto" style={{ gridAutoRows: 'minmax(100px, 1fr)' }}>
        {calendarDays.map(({ date, current }, idx) => {
          const ds   = date.toISOString().split('T')[0];
          const evs  = byDate.get(ds) || [];
          const isToday = ds === todayStr;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;

          return (
            <div
              key={idx}
              onClick={() => openNew(ds)}
              onDragOver={e => handleDragOver(e, ds)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, ds)}
              className={[
                'border-b border-r border-gray-100 dark:border-gray-800 p-1.5 cursor-pointer group relative transition-colors',
                !current  ? 'bg-gray-50/70 dark:bg-gray-950/50'            : '',
                current && isWeekend ? 'bg-gray-50/40 dark:bg-gray-800/20' : '',
                current && !isWeekend ? 'bg-white dark:bg-gray-900'        : '',
                dragOver === ds
                  ? 'bg-purple-200/70 dark:bg-purple-700/30 ring-2 ring-inset ring-purple-400'
                  : 'hover:bg-purple-100/40 dark:hover:bg-purple-800/20',
              ].join(' ')}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-1">
                <span className={[
                  'text-[12px] font-semibold w-6 h-6 flex items-center justify-center rounded-full leading-none',
                  isToday   ? 'bg-purple-600 text-white'                             : '',
                  !isToday && current  ? 'text-gray-700 dark:text-gray-200'          : '',
                  !current  ? 'text-gray-300 dark:text-gray-600'                     : '',
                ].join(' ')}>
                  {date.getDate()}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); openNew(ds); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-purple-200 dark:hover:bg-purple-700/40 text-purple-400 transition-opacity"
                >
                  <Plus size={11} />
                </button>
              </div>

              {/* Events */}
              <div className="space-y-0.5">
                {evs.slice(0, 3).map(ev => (
                  <button
                    key={ev.id}
                    draggable
                    onDragStart={e => { e.stopPropagation(); handleDragStart(e, ev.id); }}
                    onDragEnd={() => { setDraggedId(null); setDragOver(null); }}
                    onClick={e => openEdit(ev, e)}
                    title={ev.title}
                    className={[
                      'w-full text-left px-1.5 py-[2px] rounded text-[11px] font-medium truncate leading-snug cursor-grab active:cursor-grabbing transition-opacity',
                      colorLight(ev.color),
                      draggedId === ev.id ? 'opacity-40' : '',
                    ].join(' ')}
                  >
                    {ev.start_time ? `${ev.start_time.slice(0, 5)} ` : ''}{ev.title}
                  </button>
                ))}
                {evs.length > 3 && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 pl-1">
                    +{evs.length - 3} mais
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modal ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar evento' : 'Novo evento'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div>
              <Label htmlFor="cal-title">Título *</Label>
              <Input
                id="cal-title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Nome do evento"
                className="mt-1"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>

            <div>
              <Label htmlFor="cal-date">Data *</Label>
              <Input
                id="cal-date"
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cal-start">Início</Label>
                <Input
                  id="cal-start"
                  type="time"
                  value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cal-end">Fim</Label>
                <Input
                  id="cal-end"
                  type="time"
                  value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cal-desc">Descrição</Label>
              <Textarea
                id="cal-desc"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Detalhes do evento..."
                className="mt-1 resize-none"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="cal-partner">Parceiro</Label>
              <Input
                id="cal-partner"
                value={form.partner}
                onChange={e => setForm(f => ({ ...f, partner: e.target.value }))}
                placeholder="Nome do parceiro (opcional)"
                className="mt-1"
              />
            </div>

            {/* Color */}
            <div>
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {EVENT_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, color: c.value }))}
                    title={c.label}
                    className={`w-6 h-6 rounded-full ${c.bg} transition-all ${
                      form.color === c.value
                        ? 'ring-2 ring-offset-2 ring-gray-500 scale-110'
                        : 'hover:scale-105 opacity-70 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              {editing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting || saving}
                  className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                >
                  <Trash2 size={13} />
                  {deleting ? 'Excluindo...' : 'Excluir'}
                </Button>
              ) : <div />}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
