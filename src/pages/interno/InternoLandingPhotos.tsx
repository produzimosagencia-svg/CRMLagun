import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Eye, EyeOff, Image, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface PhotoLink { id: string; title: string; event_date: string | null; url: string; cover_url: string | null; is_visible: boolean; display_order: number }
const blank = { title: '', event_date: '', url: '', cover_url: '', is_visible: true, display_order: 0 };

export default function InternoLandingPhotos({ onBack }: { onBack: () => void }) {
  const [links, setLinks] = useState<PhotoLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from('landing_photo_links').select('*').order('is_visible', { ascending: false }).order('display_order').order('event_date', { ascending: false });
    if (error) toast.error('Não foi possível carregar as fotos');
    setLinks(data ?? []); setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const newLink = () => { setEditing(null); setForm(blank); setOpen(true); };
  const edit = (item: PhotoLink) => { setEditing(item.id); setForm({ title: item.title, event_date: item.event_date ?? '', url: item.url, cover_url: item.cover_url ?? '', is_visible: item.is_visible, display_order: item.display_order }); setOpen(true); };
  const save = async () => {
    if (!form.title.trim() || !form.url.trim()) return toast.error('Informe o nome e o link das fotos');
    const payload = { ...form, title: form.title.trim(), url: form.url.trim(), event_date: form.event_date || null, cover_url: form.cover_url || null, display_order: Number(form.display_order) || 0 };
    const { error } = editing ? await (supabase as any).from('landing_photo_links').update(payload).eq('id', editing) : await (supabase as any).from('landing_photo_links').insert(payload);
    if (error) return toast.error('Erro ao salvar: ' + error.message);
    toast.success(editing ? 'Link de fotos atualizado!' : 'Link de fotos criado!'); setOpen(false); load();
  };
  const toggle = async (item: PhotoLink) => { const { error } = await (supabase as any).from('landing_photo_links').update({ is_visible: !item.is_visible }).eq('id', item.id); if (error) return toast.error('Erro ao atualizar'); setLinks((all) => all.map((x) => x.id === item.id ? { ...x, is_visible: !x.is_visible } : x)); };
  const remove = async () => { if (!deleting) return; const { error } = await (supabase as any).from('landing_photo_links').delete().eq('id', deleting); if (error) return toast.error('Erro ao excluir'); toast.success('Link removido'); setDeleting(null); load(); };
  const field = (label: string, key: keyof typeof blank, type = 'text', placeholder = '') => <div><label className="block text-xs font-medium text-gray-500 mb-1">{label}</label><input type={type} value={String(form[key])} placeholder={placeholder} onChange={(e) => setForm((f) => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D9B14E]" /></div>;

  return <div className="max-w-4xl mx-auto">
    <div className="flex items-center justify-between mb-6"><div className="flex items-center gap-3"><button onClick={onBack} className="p-2 text-gray-500 hover:text-[#D9B14E] hover:bg-[#D9B14E]/10 rounded-lg"><ArrowLeft size={18} /></button><div><h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Fotos</h2><p className="text-sm text-gray-400 mt-0.5">Links exibidos na página pública de fotos</p></div></div><div className="flex gap-2"><a href="/fotos" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-2 hover:text-[#D9B14E]"><ExternalLink size={13}/> Ver página</a><button onClick={newLink} className="flex items-center gap-2 rounded-lg bg-[#D9B14E] px-4 py-2 text-sm font-semibold text-white dark:text-[#1A0800] dark:bg-[#FFE14D]"><Plus size={16}/> Novo link</button></div></div>
    {loading ? <div className="flex justify-center py-16"><div className="h-6 w-6 border-2 border-[#D9B14E] border-t-transparent rounded-full animate-spin"/></div> : links.length === 0 ? <div className="py-20 text-center border border-dashed border-gray-200 rounded-xl"><Image size={36} className="mx-auto text-gray-300 mb-3"/><p className="text-sm text-gray-400">Nenhum link de fotos cadastrado</p><button onClick={newLink} className="mt-3 text-sm text-[#D9B14E] font-medium">Adicionar primeiro link</button></div> : <div className="flex flex-col gap-3">{links.map((item) => <div key={item.id} className={`flex items-center gap-4 p-4 rounded-xl border bg-white dark:bg-[#1A1916] ${item.is_visible ? 'border-gray-200 dark:border-[#34322B]' : 'border-dashed opacity-60'}`}><div className="h-14 w-14 shrink-0 rounded-lg overflow-hidden bg-[#2B0E00] flex items-center justify-center">{item.cover_url ? <img src={item.cover_url} alt="" className="h-full w-full object-cover"/> : <Image size={20} className="text-[#D9B14E]"/>}</div><div className="min-w-0 flex-1"><p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{item.title}</p><p className="text-xs text-gray-400 mt-0.5">{item.event_date ? new Date(`${item.event_date}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem data'}</p><a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#D9B14E] flex items-center gap-1 mt-1 truncate hover:underline"><ExternalLink size={10}/>{item.url}</a></div><span className="hidden sm:inline text-xs text-gray-400">#{item.display_order}</span><button onClick={() => toggle(item)} className="p-2 text-gray-400 hover:text-emerald-600">{item.is_visible ? <Eye size={16}/> : <EyeOff size={16}/>}</button><button onClick={() => edit(item)} className="p-2 text-gray-400 hover:text-[#D9B14E]"><Pencil size={16}/></button><button onClick={() => setDeleting(item.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={16}/></button></div>)}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Editar link de fotos' : 'Novo link de fotos'}</DialogTitle></DialogHeader><div className="space-y-4 pt-2">{field('Nome do álbum *', 'title', 'text', 'ex: Bero All Night — 20/09')}{field('Data do evento', 'event_date', 'date')}{field('Link das fotos *', 'url', 'url', 'https://drive.google.com/...')}{field('Imagem de capa (opcional)', 'cover_url', 'url', 'https://...')}{field('Ordem de exibição', 'display_order', 'number', '0')}<button type="button" onClick={() => setForm((f) => ({...f, is_visible: !f.is_visible}))} className={`w-full rounded-lg border py-2 text-sm font-medium ${form.is_visible ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500'}`}>{form.is_visible ? 'Visível na página de fotos' : 'Oculto na página de fotos'}</button><div className="flex gap-3"><button onClick={() => setOpen(false)} className="flex-1 rounded-lg border py-2.5 text-sm">Cancelar</button><button onClick={save} className="flex-1 rounded-lg bg-[#D9B14E] py-2.5 text-sm font-medium text-white">Salvar</button></div></div></DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Excluir link de fotos?</DialogTitle></DialogHeader><p className="text-sm text-gray-500">Esse álbum será removido da área de fotos.</p><div className="flex gap-3 mt-3"><button onClick={() => setDeleting(null)} className="flex-1 border rounded-lg py-2.5 text-sm">Cancelar</button><button onClick={remove} className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm">Excluir</button></div></DialogContent></Dialog>
  </div>;
}
