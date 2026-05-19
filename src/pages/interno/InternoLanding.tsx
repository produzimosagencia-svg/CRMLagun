import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, ExternalLink, Globe, Upload, X } from 'lucide-react';
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
    const { data, error } = await (supabase as any)
      .from('lagun_events')
      .select('id, nome, data, dia_semana, artista, guests, tag, link, flyer_mobile_url, flyer_desktop_url, show_on_landing, display_order')
      .order('display_order', { ascending: true });
    if (!error && data) setEvents(data as LandingEvent[]);
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
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-2 transition-colors"
          >
            <Globe size={14} /> Ver site
          </a>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} /> Novo evento
          </button>
        </div>
      </div>

      {/* Events list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Globe size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">Nenhum evento cadastrado ainda</p>
          <button onClick={openNew} className="mt-4 text-indigo-600 text-sm font-medium hover:underline">
            Adicionar primeiro evento
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((ev) => (
            <div
              key={ev.id}
              className={`flex items-center gap-4 rounded-xl border bg-white dark:bg-gray-900 p-4 transition-all ${
                ev.show_on_landing
                  ? 'border-gray-200 dark:border-gray-700'
                  : 'border-dashed border-gray-200 dark:border-gray-700 opacity-60'
              }`}
            >
              {/* Flyer thumb */}
              <div
                className="shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
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
                    className="text-[11px] text-indigo-500 hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <ExternalLink size={10} /> {ev.link.length > 50 ? ev.link.slice(0, 50) + '…' : ev.link}
                  </a>
                )}
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
                      : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {ev.show_on_landing ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  onClick={() => openEdit(ev)}
                  className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar evento' : 'Novo evento'}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 pt-2">
            {/* Nome */}
            {field('Nome do evento *', 'nome', 'text', 'ex: Bero All Night')}

            {/* Data + Dia */}
            <div className="grid grid-cols-2 gap-3">
              {field('Data', 'data', 'date', '')}
              {field('Dia da semana', 'dia_semana', 'text', 'ex: Sábado')}
            </div>

            {/* Artista + Guests */}
            {field('Artista principal', 'artista', 'text', 'ex: Bero Costa (deixe vazio se não tiver)')}
            {field('Guests / line-up', 'guests', 'text', 'ex: BeLeiTe + Dj Lukão')}

            {/* Tag */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tag</label>
              <select
                value={form.tag ?? 'ABERTO'}
                onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ABERTO">ABERTO</option>
                <option value="ESGOTADO">ESGOTADO</option>
                <option value="EM BREVE">EM BREVE</option>
                <option value="ENCERRADO">ENCERRADO</option>
              </select>
            </div>

            {/* Link */}
            {field('Link de ingressos', 'link', 'url', 'https://...')}

            {/* Flyers */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Imagens</p>

              {/* Mobile flyer */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Flyer Mobile (feed quadrado)</label>
                <div className="flex gap-2 items-start">
                  <div className="flex-1">
                    {form.flyer_mobile_url ? (
                      <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50" style={{ height: 80 }}>
                        <img src={form.flyer_mobile_url} alt="mobile" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, flyer_mobile_url: '' }))}
                          className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-black/80"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => mobileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
                        style={{ height: 80 }}
                      >
                        {uploadingMobile ? (
                          <div className="h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <Upload size={18} className="text-gray-400 mb-1" />
                            <span className="text-[11px] text-gray-400">Clique para enviar</span>
                          </>
                        )}
                      </div>
                    )}
                    <input
                      ref={mobileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFlyer(f, 'mobile'); }}
                    />
                  </div>
                </div>
              </div>

              {/* Desktop flyer */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Flyer Desktop (banner largo)</label>
                <div
                  onClick={() => !form.flyer_desktop_url && desktopInputRef.current?.click()}
                  className={`relative rounded-lg overflow-hidden border-2 border-dashed border-gray-200 bg-gray-50 transition-colors ${!form.flyer_desktop_url ? 'cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30' : ''}`}
                  style={{ height: 70 }}
                >
                  {form.flyer_desktop_url ? (
                    <>
                      <img src={form.flyer_desktop_url} alt="desktop" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, flyer_desktop_url: '' }))}
                        className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-black/80"
                      >
                        <X size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => desktopInputRef.current?.click()}
                        className="absolute bottom-1 right-1 bg-black/60 rounded text-white text-[10px] px-1.5 py-0.5 hover:bg-black/80"
                      >
                        Trocar
                      </button>
                    </>
                  ) : uploadingDesktop ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center">
                      <Upload size={18} className="text-gray-400 mb-1" />
                      <span className="text-[11px] text-gray-400">Clique para enviar (formato banner)</span>
                    </div>
                  )}
                </div>
                <input
                  ref={desktopInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFlyer(f, 'desktop'); }}
                />
              </div>
            </div>

            {/* Order + Visible */}
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
              {field('Ordem de exibição', 'display_order', 'number', '1')}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Exibir no site</label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, show_on_landing: !f.show_on_landing }))}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.show_on_landing
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  {form.show_on_landing ? <><Eye size={14} /> Visível</> : <><EyeOff size={14} /> Oculto</>}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
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
