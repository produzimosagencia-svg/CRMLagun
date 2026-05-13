import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, X, Trash2, Link } from 'lucide-react';
import { toast } from 'sonner';
import LoadingState from '@/components/interno/LoadingState';

const AVAILABLE_EVENTS = ['Maestria', 'BoomRAP', 'Copa do Mundo'];

interface CreativeRef {
  id: string;
  image_url: string;
  observation: string | null;
  events: string[];
  created_at: string;
}

export default function InternoReferencias() {
  const [refs, setRefs] = useState<CreativeRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState<CreativeRef | null>(null);
  const [uploading, setUploading] = useState(false);
  const [observation, setObservation] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imageLink, setImageLink] = useState('');
  const [addTab, setAddTab] = useState<string>('upload');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadRefs();
  }, []);

  async function loadRefs() {
    const { data, error } = await supabase
      .from('creative_references')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setRefs(data as CreativeRef[]);
    setLoading(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function toggleEvent(ev: string) {
    setSelectedEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  }

  async function handleSubmit() {
    const isLink = addTab === 'link';

    if (!isLink && !file) { toast.error('Selecione uma imagem'); return; }
    if (isLink && !imageLink.trim()) { toast.error('Cole o link da imagem'); return; }
    if (selectedEvents.length === 0) { toast.error('Selecione pelo menos um evento'); return; }

    setUploading(true);
    try {
      let finalUrl = '';

      if (isLink) {
        finalUrl = imageLink.trim();
      } else {
        const ext = file!.name.split('.').pop();
        const path = `${crypto.randomUUID()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('creative-references')
          .upload(path, file!);
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('creative-references')
          .getPublicUrl(path);
        finalUrl = urlData.publicUrl;
      }

      const { error: insertErr } = await supabase
        .from('creative_references')
        .insert({
          image_url: finalUrl,
          observation: observation || null,
          events: selectedEvents,
        });
      if (insertErr) throw insertErr;

      toast.success('Referência adicionada!');
      resetForm();
      loadRefs();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta referência?')) return;
    const { error } = await supabase.from('creative_references').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Excluída');
    setShowDetail(null);
    loadRefs();
  }

  function resetForm() {
    setShowAdd(false);
    setFile(null);
    setPreviewUrl(null);
    setObservation('');
    setSelectedEvents([]);
    setImageLink('');
    setAddTab('upload');
  }

  if (loading) return <LoadingState label="referências" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(true)} className="bg-[#FF0080] hover:bg-[#E0006F] text-white">
          <Plus size={16} className="mr-1" /> Adicionar
        </Button>
      </div>

      {/* Pinterest-like masonry grid */}
      {refs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">Nenhuma referência ainda.</p>
          <p className="text-xs mt-1">Clique em "+ Adicionar" para começar.</p>
        </div>
      ) : (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
          {refs.map((ref) => (
            <div
              key={ref.id}
              className="break-inside-avoid cursor-pointer group relative rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
              onClick={() => setShowDetail(ref)}
            >
              <img
                src={ref.image_url}
                alt={ref.observation || 'Referência criativa'}
                className="w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex flex-wrap gap-1">
                  {ref.events.map(ev => (
                    <span key={ev} className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                      {ev}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) resetForm(); else setShowAdd(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Nova Referência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
           <Tabs value={addTab} onValueChange={setAddTab} className="w-full">
              <TabsList className="w-full mb-3">
                <TabsTrigger value="upload" className="flex-1 text-xs">📁 Upload</TabsTrigger>
                <TabsTrigger value="link" className="flex-1 text-xs"><Link size={12} className="mr-1" /> Colar link</TabsTrigger>
              </TabsList>

              <TabsContent value="upload">
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                {previewUrl && addTab === 'upload' ? (
                  <div className="relative">
                    <img src={previewUrl} alt="Preview" className="w-full rounded-lg max-h-64 object-cover" />
                    <button onClick={() => { setFile(null); setPreviewUrl(null); }} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full h-40 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
                  >
                    <Plus size={24} />
                    <span className="text-sm">Selecionar imagem</span>
                  </button>
                )}
              </TabsContent>

              <TabsContent value="link">
                <div className="space-y-3">
                  <Input
                    placeholder="https://exemplo.com/imagem.jpg"
                    value={imageLink}
                    onChange={e => {
                      setImageLink(e.target.value);
                      setPreviewUrl(e.target.value || null);
                    }}
                  />
                  {imageLink && (
                    <img
                      src={imageLink}
                      alt="Preview"
                      className="w-full rounded-lg max-h-64 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block'; }}
                    />
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Observação</label>
              <Textarea
                placeholder="O que achou interessante nesse criativo?"
                value={observation}
                onChange={e => setObservation(e.target.value)}
                rows={3}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-2 block">Evento</label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_EVENTS.map(ev => (
                  <button
                    key={ev}
                    onClick={() => toggleEvent(ev)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedEvents.includes(ev)
                        ? 'bg-[#FF0080] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={handleSubmit} disabled={uploading} className="w-full bg-[#FF0080] hover:bg-[#E0006F] text-white">
              {uploading ? 'Enviando...' : 'Salvar Referência'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!showDetail} onOpenChange={(o) => { if (!o) setShowDetail(null); }}>
        <DialogContent className="max-w-lg">
          {showDetail && (
            <div className="space-y-4">
              <img src={showDetail.image_url} alt="" className="w-full rounded-lg max-h-[60vh] object-contain" />
              {showDetail.observation && (
                <p className="text-sm text-gray-700">{showDetail.observation}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {showDetail.events.map(ev => (
                  <span key={ev} className="px-3 py-1 rounded-full text-xs font-medium bg-[#FF0080]/10 text-[#FF0080]">
                    {ev}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-300">
                {new Date(showDetail.created_at).toLocaleDateString('pt-BR')}
              </p>
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(showDetail.id)}>
                <Trash2 size={14} className="mr-1" /> Excluir
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
