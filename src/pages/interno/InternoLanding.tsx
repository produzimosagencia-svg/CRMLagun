import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, ExternalLink, Globe, Upload, X, MousePointerClick } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface LandingEvent {
  id: string;
  nome: string;
  data: string | null;
  dia_semana: string | null;
  artista: string | null;
  guests: string | null;
  tag: string | null;
  link: string | null;
  flyer_mobile_url: string | null;
  flyer_desktop_url: string | null;
  show_on_landing: boolean;
  display_order: number;
}

const emptyEvent: Omit<LandingEvent, 'id'> = {
  nome: '',
  data: '',
  dia_semana: '',
  artista: '',
  guests: '',
  tag: 'ABERTO',
  link: '',
  flyer_mobile_url: '',
  flyer_desktop_url: '',
  show_on_landing: true,
  display_order: 0,
};

export default function InternoLanding() {
  const [events, setEvents] = useState<LandingEvent[]>([]);
  const [clicks, setClicks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<LandingEvent, 'id'>>(emptyEvent);
  const [saving, setSaving] = useState(false);
  const [uploadingMobile, setUploadingMobile] = useState(false);
  const [uploadingDesktop, setUploadingDesktop] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);

  async function uploadFlyer(file: File, slot: 'mobile' | 'desktop') {
    const setter = slot === 'mobile' ? setUploadingMobile : setUploadingDesktop;
    setter(true);
    const ext = file.name.split('.').pop();
    const path = `flyers/${Date.now()}-${slot}.${ext}`;
    const { error } = await (supabase as any).storage.from('landing-flyers').upload(path, file, { upsert: true });
    if (error) { toast.error('Erro no upload: ' + error.message); setter(false); return; }
    const { data: { publicUrl } } = (supabase as any).storage.from('landing-flyers').getPublicUrl(path);
    setForm((f) => ({ ...f, [slot === 'mobile' ? 'flyer_mobile_url' : 'flyer_desktop_url']: publicUrl }));
    setter(false);
    toast.success(`Flyer ${slot} enviado!`);
  }

  async function fetchEvents() {
    setLoading(true);
    const [{ data: evData }, { data: clickData }] = await Promise.all([
      (supabase as any)
        .from('lagun_events')
        .select('id, nome, data, dia_semana, artista, guests, tag, link, flyer_mobile_url, flyer_desktop_url, show_on_landing, display_order')
        .order('show_on_landing', { ascending: false })
        .order('display_order', { ascending: true }),
      (supabase as any)
        .from('link_clicks')
        .select('event_id'),
    ]);
    if (evData) setEvents(evData as LandingEvent[]);
    if (clickData) {
      const map: Record<string, number> = {};
      (clickData as { event_id: string }[]).forEach(({ event_id }) => {
        map[event_id] = (map[event_id] || 0) + 1;
      });
      setClicks(map);
    }
    setLoading(false);
  }

  useEffect(() => { fetchEvents(); }, []);

  function openNew() {
    setEditingId(null);
    setForm(emptyEvent);
    setModalOpen(true);
  }

  function openEdit(ev: LandingEvent) {
    setEditingId(ev.id);
    setForm({
      nome: ev.nome,
      data: ev.data ? ev.data.slice(0, 10) : '',
      dia_semana: ev.dia_semana ?? '',
      artista: ev.artista ?? '',
      guests: ev.guests ?? '',
      tag: ev.tag ?? 'ABERTO',
      link: ev.link ?? '',
      flyer_mobile_url: ev.flyer_mobile_url ?? '',
      flyer_desktop_url: ev.flyer_desktop_url ?? '',
      show_on_landing: ev.show_on_landing ?? true,
      display_order: ev.display_order ?? 0,
    });
    setModalOpen(true);
  }

  async function toggleVisible(ev: LandingEvent) {
    await (supabase as any)
      .from('lagun_events')
      .update({ show_on_landing: !ev.show_on_landing })
      .eq('id', ev.id);
    setEvents((prev) =>
      prev.map((e) => e.id === ev.id ? { ...e, show_on_landing: !ev.show_on_landing } : e)
    );
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      data: form.data || null,
      dia_semana: form.dia_semana || null,
      artista: form.artista || null,
      guests: form.guests || null,
      tag: form.tag || 'ABERTO',
      link: form.link || null,
      flyer_mobile_url: form.flyer_mobile_url || null,
      flyer_desktop_url: form.flyer_desktop_url || null,
      show_on_landing: form.show_on_landing,
      display_order: Number(form.display_order) || 0,
    };

    let error: any = null;
    if (editingId) {
      ({ error } = await (supabase as any).from('lagun_events').update(payload).eq('id', editingId));
    } else {
      ({ error } = await (supabase as any).from('lagun_events').insert(payload));
    }

    setSaving(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success(editingId ? 'Evento atualizado!' : 'Evento criado!');
    setModalOpen(false);
    fetchEvents();
  }

  async function handleDelete(id: string) {
    const { error } = await (supabase as any).from('lagun_events').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir'); return; }
    toast.success('Evento removido');
    setDeleteConfirm(null);
    fetchEvents();
  }

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={String(form[key] ?? '')}
        onChange={(e) => setForm((f) => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D9B14E] focus:border-transparent"
      />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Landing Page</h2>
          <p className="text-sm text-gray-400 mt-0.5">Gerencie os eventos exibidos no site público</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#D9B14E] border border-gray-200 rounded-lg px-3 py-2 transition-colors"
          >
            <Globe size={14} /> Ver site
          </a>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-[#D9B14E] hover:bg-[#B98F35] text-white shadow-[0_2px_12px_rgba(168,85,247,0.35)] dark:bg-gradient-to-br dark:from-[#E8C766] dark:via-[#e8b830] dark:to-[#E8C766] dark:hover:brightness-105 dark:text-[#1A0800] text-sm font-semibold px-4 py-2 rounded-lg transition-all dark:shadow-[0_2px_12px_rgba(232,184,48,0.35)]"
          >
            <Plus size={16} /> Novo evento
          </button>
        </div>
      </div>

      {/* Events list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 border-2 border-[#D9B14E] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Globe size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">Nenhum evento cadastrado ainda</p>
          <button onClick={openNew} className="mt-4 text-[#D9B14E] text-sm font-medium hover:underline">
            Adicionar primeiro evento
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((ev) => (
            <div
              key={ev.id}
              className={`flex items-center gap-4 rounded-xl border bg-white dark:bg-[#1A1916] p-4 transition-all ${
                ev.show_on_landing
                  ? 'border-gray-200 dark:border-[#34322B]'
                  : 'border-dashed border-gray-200 dark:border-[#34322B] opacity-60'
              }`}
            >
              {/* Flyer thumb */}
              <div
                className="shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-[#242320]"
                style={{ width: 64, height: 64 }}
              >
                {ev.flyer_mobile_url ? (
                  <img
                    src={ev.flyer_mobile_url}
                    alt={ev.nome}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Globe size={20} className="text-gray-300" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{ev.nome}</p>
                  {ev.tag && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400 text-amber-600 dark:text-amber-400 shrink-0">
                      {ev.tag}
                    </span>
                  )}
                </div>
                {(ev.data || ev.dia_semana) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {ev.data}{ev.dia_semana ? ` · ${ev.dia_semana}` : ''}
                  </p>
                )}
                {ev.guests && (
                  <p className="text-xs text-gray-400 truncate">guests: {ev.guests}</p>
                )}
                {ev.link && (
                  <a
                    href={ev.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#D9B14E] hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <ExternalLink size={10} /> {ev.link.length > 50 ? ev.link.slice(0, 50) + '…' : ev.link}
                  </a>
                )}
              </div>

              {/* Click counter */}
              <div className="flex flex-col items-center shrink-0 min-w-[52px]" title="Cliques no botão de ingresso">
                <div className="flex items-center gap-1 text-[#D9B14E]">
                  <MousePointerClick size={13} />
                  <span className="text-sm font-bold">{(clicks[ev.id] || 0).toLocaleString('pt-BR')}</span>
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5">cliques</span>
              </div>

              {/* Order badge */}
              <div className="flex items-center gap-1 shrink-0 text-gray-400">
                <GripVertical size={14} />
                <span className="text-xs">#{ev.display_order}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleVisible(ev)}
                  title={ev.show_on_landing ? 'Ocultar no site' : 'Mostrar no site'}
                  className={`p-2 rounded-lg transition-colors ${
                    ev.show_on_landing
                      ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                      : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-[#242320]'
                  }`}
                >
                  {ev.show_on_landing ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  onClick={() => openEdit(ev)}
                  className="p-2 rounded-lg text-gray-400 hover:text-[#D9B14E] hover:bg-[#D9B14E]/10 dark:hover:bg-[#D9B14E]/25 transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setDeleteConfirm(ev.id)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl w-full max-h-[92vh] overflow-hidden p-0 flex flex-col">
          <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
            <DialogTitle>{editingId ? 'Editar evento' : 'Novo evento'}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden min-h-0">

            {/* ── LEFT: form ── */}
            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4 min-w-0">
              {field('Nome do evento *', 'nome', 'text', 'ex: Bero All Night')}

              <div className="grid grid-cols-2 gap-3">
                {field('Data', 'data', 'date', '')}
                {field('Dia da semana', 'dia_semana', 'text', 'ex: Sábado')}
              </div>

              {field('Artista principal', 'artista', 'text', 'ex: Bero Costa (vazio se não tiver)')}
              {field('Guests / line-up', 'guests', 'text', 'ex: BeLeiTe + Dj Lukão')}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tag</label>
                <select
                  value={form.tag ?? 'ABERTO'}
                  onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#D9B14E]"
                >
                  <option value="ABERTO">ABERTO</option>
                  <option value="ESGOTADO">ESGOTADO</option>
                  <option value="EM BREVE">EM BREVE</option>
                  <option value="ENCERRADO">ENCERRADO</option>
                </select>
              </div>

              {field('Link de ingressos', 'link', 'url', 'https://...')}

              {/* Flyers */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Imagens</p>

                {/* Mobile flyer */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Flyer Mobile (quadrado)</label>
                  {form.flyer_mobile_url ? (
                    <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50" style={{ height: 80 }}>
                      <img src={form.flyer_mobile_url} alt="mobile" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => setForm((f) => ({ ...f, flyer_mobile_url: '' }))} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-black/80"><X size={12} /></button>
                      <button type="button" onClick={() => mobileInputRef.current?.click()} className="absolute bottom-1 right-1 bg-black/60 rounded text-white text-[10px] px-1.5 py-0.5 hover:bg-black/80">Trocar</button>
                    </div>
                  ) : (
                    <div onClick={() => mobileInputRef.current?.click()} className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 cursor-pointer hover:border-[#D9B14E] hover:bg-[#D9B14E]/10 transition-colors" style={{ height: 80 }}>
                      {uploadingMobile ? <div className="h-5 w-5 border-2 border-[#D9B14E] border-t-transparent rounded-full animate-spin" /> : <><Upload size={18} className="text-gray-400 mb-1" /><span className="text-[11px] text-gray-400">Clique para enviar</span></>}
                    </div>
                  )}
                  <input ref={mobileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFlyer(f, 'mobile'); }} />
                </div>

                {/* Desktop flyer */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Flyer Desktop (banner largo)</label>
                  <div onClick={() => !form.flyer_desktop_url && desktopInputRef.current?.click()} className={`relative rounded-lg overflow-hidden border-2 border-dashed border-gray-200 bg-gray-50 transition-colors ${!form.flyer_desktop_url ? 'cursor-pointer hover:border-[#D9B14E] hover:bg-[#D9B14E]/10' : ''}`} style={{ height: 70 }}>
                    {form.flyer_desktop_url ? (
                      <>
                        <img src={form.flyer_desktop_url} alt="desktop" className="h-full w-full object-cover" />
                        <button type="button" onClick={() => setForm((f) => ({ ...f, flyer_desktop_url: '' }))} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-black/80"><X size={12} /></button>
                        <button type="button" onClick={() => desktopInputRef.current?.click()} className="absolute bottom-1 right-1 bg-black/60 rounded text-white text-[10px] px-1.5 py-0.5 hover:bg-black/80">Trocar</button>
                      </>
                    ) : uploadingDesktop ? (
                      <div className="h-full flex items-center justify-center"><div className="h-5 w-5 border-2 border-[#D9B14E] border-t-transparent rounded-full animate-spin" /></div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center"><Upload size={18} className="text-gray-400 mb-1" /><span className="text-[11px] text-gray-400">Clique para enviar (banner)</span></div>
                    )}
                  </div>
                  <input ref={desktopInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFlyer(f, 'desktop'); }} />
                </div>
              </div>

              {/* Order + Visible */}
              <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
                {field('Ordem', 'display_order', 'number', '1')}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Exibir no site</label>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, show_on_landing: !f.show_on_landing }))}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${form.show_on_landing ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                    {form.show_on_landing ? <><Eye size={14} /> Visível</> : <><EyeOff size={14} /> Oculto</>}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1 pb-2">
                <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#D9B14E] hover:bg-[#B98F35] text-white text-sm font-medium transition-colors disabled:opacity-60">
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>

            {/* ── RIGHT: live preview ── */}
            <div className="w-72 shrink-0 border-l border-gray-100 overflow-y-auto flex flex-col" style={{ backgroundColor: '#1A0800' }}>
              <p className="text-[10px] tracking-[0.3em] uppercase px-4 pt-4 pb-3" style={{ color: 'rgba(245,212,112,0.5)' }}>Preview</p>

              {/* Mobile card preview */}
              <div className="px-3 mb-5">
                <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>Mobile</p>
                <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ backgroundColor: '#2B0E00', border: '1px solid rgba(245,212,112,0.12)' }}>
                  {/* Thumb */}
                  <div className="shrink-0 rounded-xl overflow-hidden" style={{ width: 56, height: 56, backgroundColor: '#3a1500' }}>
                    {form.flyer_mobile_url
                      ? <img src={form.flyer_mobile_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-lg">🎶</div>
                    }
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-xs leading-tight truncate">{form.nome || 'Nome do evento'}</p>
                    {form.artista && <p className="text-[11px] font-semibold truncate mt-0.5" style={{ color: '#E8C766' }}>{form.artista}</p>}
                    {form.guests && <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{form.guests}</p>}
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {form.data
                        ? <><span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>{form.data.slice(5).split('-').reverse().join('/')}</span>{form.dia_semana ? ` · ${form.dia_semana}` : ''}</>
                        : <span style={{ color: 'rgba(255,255,255,0.25)' }}>dd/mm · dia</span>
                      }
                    </p>
                  </div>
                  {/* Ticket btn */}
                  <div className="shrink-0 flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, backgroundColor: '#E8C766' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A0800" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 9a1 1 0 0 1 0-2V5a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v2a1 1 0 0 1 0 2v2a1 1 0 0 1 0 2v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 0-2V9z"/>
                      <line x1="9" y1="4" x2="9" y2="20" strokeDasharray="2 2"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Desktop card preview */}
              <div className="px-3 pb-6">
                <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>Desktop</p>
                <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#2B0E00', border: '1px solid rgba(245,212,112,0.15)' }}>
                  {/* Banner */}
                  <div className="relative w-full overflow-hidden flex items-center justify-center" style={{ aspectRatio: '800/300', backgroundColor: '#1A0800', borderBottom: '1px solid rgba(245,212,112,0.1)' }}>
                    {form.flyer_desktop_url
                      ? <img src={form.flyer_desktop_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-3xl opacity-20">🖼</span>
                    }
                  </div>
                  {/* Body */}
                  <div className="p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] tracking-widest px-2 py-0.5 rounded-full"
                        style={{ border: `1px solid ${form.tag === 'ABERTO' ? '#E8C766' : 'rgba(255,255,255,0.15)'}`, color: form.tag === 'ABERTO' ? '#E8C766' : 'rgba(255,255,255,0.35)' }}>
                        {form.tag || 'ABERTO'}
                      </span>
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {form.data ? form.data.slice(5).split('-').reverse().join('/') : 'dd/mm'}{form.dia_semana ? ` · ${form.dia_semana}` : ''}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white leading-tight">{form.nome || 'Nome do evento'}</p>
                      {form.artista && <p className="text-xs font-semibold mt-0.5" style={{ color: '#E8C766' }}>{form.artista}</p>}
                      {form.guests && <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>special guests: <span style={{ color: 'rgba(255,255,255,0.65)' }}>{form.guests}</span></p>}
                    </div>
                    <div className="text-center text-[9px] tracking-widest py-2 rounded-xl font-bold" style={{ background: 'linear-gradient(135deg,#E8C766 0%,#e8b830 50%,#E8C766 100%)', color: '#1A0800' }}>
                      COMPRAR INGRESSO
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir evento?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 mt-1">
            Essa ação não pode ser desfeita. O evento será removido permanentemente.
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
            >
              Excluir
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
