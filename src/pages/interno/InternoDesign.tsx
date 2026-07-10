import { useEffect, useState, useCallback, useRef, DragEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Paperclip, ArrowLeft, Upload, X, ExternalLink, Calendar, GripVertical, Clock, AlertTriangle, CheckCircle2, Circle, Loader2, Flag, User, List, LayoutGrid, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface EventOption {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface Demand {
  id: string;
  title: string;
  description: string | null;
  publish_date: string | null;
  status: string;
  priority: string | null;
  attachments: string[];
  created_at: string;
  event_id: string;
  events?: EventOption;
}

interface CreativeRef {
  id: string;
  image_url: string;
  observation: string | null;
  events: string[];
}

const STATUS_COLUMNS = [
  { key: 'pendente', label: 'Pendente', color: 'bg-yellow-500', bg: 'bg-yellow-500/10', text: 'text-yellow-600', border: 'border-yellow-500/20', icon: Circle },
  { key: 'em andamento', label: 'Em Andamento', color: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-600', border: 'border-blue-500/20', icon: Loader2 },
  { key: 'finalizado', label: 'Finalizado', color: 'bg-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-600', border: 'border-purple-500/20', icon: CheckCircle2 },
  { key: 'aprovado', label: 'Aprovado', color: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/20', icon: CheckCircle2 },
];

const PRIORITIES = [
  { key: 'razoavel', label: 'Razoável', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { key: 'urgente', label: 'Urgente', color: 'text-red-500', bg: 'bg-red-500/10' },
];

function getDateUrgencyClass(dateStr: string | null): string {
  if (!dateStr) return 'text-gray-400';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T12:00:00');
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'text-red-600 font-bold'; // overdue
  if (diffDays <= 1) return 'text-red-600 font-bold'; // today or tomorrow
  if (diffDays <= 3) return 'text-orange-500 font-semibold'; // 2-3 days
  if (diffDays <= 7) return 'text-yellow-600'; // this week
  return 'text-gray-400';
}

export default function InternoDesign() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventOption[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [references, setReferences] = useState<CreativeRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const draggedId = useRef<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [refPickerTarget, setRefPickerTarget] = useState<'create' | 'detail'>('create');

  // Create form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventId, setEventId] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [priority, setPriority] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [selectedRefUrls, setSelectedRefUrls] = useState<string[]>([]);
  const [newEventName, setNewEventName] = useState('');
  const [creatingNewEvent, setCreatingNewEvent] = useState(false);

  // Detail editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState('');

  const load = useCallback(async () => {
    const [evRes, demRes, refRes] = await Promise.all([
      supabase.from('events').select('id, name, avatar_url').order('name'),
      supabase.from('design_demands').select('*, events(id, name, avatar_url)').order('created_at', { ascending: false }),
      supabase.from('creative_references').select('id, image_url, observation, events').order('created_at', { ascending: false }),
    ]);
    setEvents(evRes.data || []);
    setDemands((demRes.data || []) as unknown as Demand[]);
    setReferences(refRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreateNewEvent(): Promise<string | null> {
    if (!newEventName.trim()) return null;
    const { data, error } = await supabase.from('events').insert({ name: newEventName.trim() }).select('id').single();
    if (error || !data) { toast.error('Erro ao criar evento'); return null; }
    toast.success(`Evento "${newEventName.trim()}" criado!`);
    setNewEventName(''); setCreatingNewEvent(false);
    await load();
    return data.id;
  }

  async function handleCreate() {
    let finalEventId = eventId;
    if (creatingNewEvent) {
      const id = await handleCreateNewEvent();
      if (!id) return;
      finalEventId = id;
    }
    if (!title.trim() || !finalEventId) { toast.error('Título e evento são obrigatórios'); return; }
    setSaving(true);

    const attachmentUrls: string[] = [...selectedRefUrls];
    for (const file of files) {
      const path = `${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from('design-attachments').upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from('design-attachments').getPublicUrl(path);
        attachmentUrls.push(data.publicUrl);
      }
    }

    const { error } = await supabase.from('design_demands').insert({
      title: title.trim(),
      description: description.trim() || null,
      event_id: finalEventId,
      publish_date: publishDate || null,
      priority: priority || null,
      attachments: attachmentUrls,
    });

    if (error) {
      toast.error('Erro ao criar demanda');
    } else {
      toast.success('Demanda criada!');
      setShowCreate(false);
      setTitle(''); setDescription(''); setEventId(''); setPublishDate(''); setPriority(''); setFiles([]);
      setSelectedRefUrls([]); setCreatingNewEvent(false); setNewEventName('');
      load();
    }
    setSaving(false);
  }

  async function handleStatusChange(demandId: string, newStatus: string) {
    const { error } = await supabase.from('design_demands').update({ status: newStatus }).eq('id', demandId);
    if (error) { toast.error('Erro ao atualizar status'); } else {
      setDemands(prev => prev.map(d => d.id === demandId ? { ...d, status: newStatus } : d));
      if (selectedDemand?.id === demandId) setSelectedDemand(prev => prev ? { ...prev, status: newStatus } : null);
    }
  }

  async function handlePriorityChange(demandId: string, newPriority: string | null) {
    const { error } = await supabase.from('design_demands').update({ priority: newPriority }).eq('id', demandId);
    if (error) { toast.error('Erro ao atualizar prioridade'); } else {
      setDemands(prev => prev.map(d => d.id === demandId ? { ...d, priority: newPriority } : d));
      if (selectedDemand?.id === demandId) setSelectedDemand(prev => prev ? { ...prev, priority: newPriority } : null);
    }
  }

  async function handleUpdateTitle(demandId: string, newTitle: string) {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from('design_demands').update({ title: newTitle.trim() }).eq('id', demandId);
    if (error) { toast.error('Erro ao atualizar título'); } else {
      setDemands(prev => prev.map(d => d.id === demandId ? { ...d, title: newTitle.trim() } : d));
      if (selectedDemand?.id === demandId) setSelectedDemand(prev => prev ? { ...prev, title: newTitle.trim() } : null);
    }
    setEditingTitle(false);
  }

  async function handleUpdateDescription(demandId: string, newDesc: string) {
    const { error } = await supabase.from('design_demands').update({ description: newDesc.trim() || null }).eq('id', demandId);
    if (error) { toast.error('Erro ao atualizar briefing'); } else {
      setDemands(prev => prev.map(d => d.id === demandId ? { ...d, description: newDesc.trim() || null } : d));
      if (selectedDemand?.id === demandId) setSelectedDemand(prev => prev ? { ...prev, description: newDesc.trim() || null } : null);
      toast.success('Briefing atualizado');
    }
    setEditingDescription(false);
  }

  async function handleDateChange(demandId: string, newDate: string) {
    const { error } = await supabase.from('design_demands').update({ publish_date: newDate || null }).eq('id', demandId);
    if (error) { toast.error('Erro ao atualizar data'); } else {
      setDemands(prev => prev.map(d => d.id === demandId ? { ...d, publish_date: newDate || null } : d));
      if (selectedDemand?.id === demandId) setSelectedDemand(prev => prev ? { ...prev, publish_date: newDate || null } : null);
    }
  }

  async function handleUploadDelivery(demandId: string, fileList: FileList) {
    setUploadingFile(true);
    const demand = demands.find(d => d.id === demandId);
    const currentAttachments = demand?.attachments || [];
    const newUrls: string[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const path = `${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from('design-attachments').upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from('design-attachments').getPublicUrl(path);
        newUrls.push(data.publicUrl);
      }
    }
    const updatedAttachments = [...currentAttachments, ...newUrls];
    const { error } = await supabase.from('design_demands').update({ attachments: updatedAttachments }).eq('id', demandId);
    if (error) { toast.error('Erro ao fazer upload'); } else {
      setDemands(prev => prev.map(d => d.id === demandId ? { ...d, attachments: updatedAttachments } : d));
      if (selectedDemand?.id === demandId) setSelectedDemand(prev => prev ? { ...prev, attachments: updatedAttachments } : null);
      toast.success(`${newUrls.length} arquivo(s) enviado(s)`);
    }
    setUploadingFile(false);
  }

  async function handleAttachReference(demandId: string, refUrl: string) {
    const demand = demands.find(d => d.id === demandId);
    const currentAttachments = demand?.attachments || [];
    if (currentAttachments.includes(refUrl)) { toast.info('Referência já anexada'); return; }
    const updatedAttachments = [...currentAttachments, refUrl];
    const { error } = await supabase.from('design_demands').update({ attachments: updatedAttachments }).eq('id', demandId);
    if (error) { toast.error('Erro ao anexar referência'); } else {
      setDemands(prev => prev.map(d => d.id === demandId ? { ...d, attachments: updatedAttachments } : d));
      if (selectedDemand?.id === demandId) setSelectedDemand(prev => prev ? { ...prev, attachments: updatedAttachments } : null);
      toast.success('Referência anexada!');
    }
  }

  async function handleDeleteDemand(demandId: string) {
    const { error } = await supabase.from('design_demands').delete().eq('id', demandId);
    if (error) { toast.error('Erro ao excluir'); } else {
      setDemands(prev => prev.filter(d => d.id !== demandId));
      setSelectedDemand(null);
      toast.success('Demanda excluída');
    }
  }

  // Drag handlers
  function handleDragStart(e: DragEvent, demandId: string) {
    draggedId.current = demandId;
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '0.4';
  }
  function handleDragEnd(e: DragEvent) {
    draggedId.current = null; setDragOverCol(null);
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '1';
  }
  function handleDragOver(e: DragEvent, colKey: string) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(colKey); }
  function handleDragLeave() { setDragOverCol(null); }
  function handleDrop(e: DragEvent, colKey: string) {
    e.preventDefault(); setDragOverCol(null);
    const id = draggedId.current;
    if (!id) return;
    const demand = demands.find(d => d.id === id);
    if (demand && (demand.status || 'pendente') !== colKey) handleStatusChange(id, colKey);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" /></div>;

  const demandsByStatus = (status: string) => demands.filter(d => (d.status || 'pendente') === status);
  const getStatusCol = (key: string) => STATUS_COLUMNS.find(c => c.key === key) || STATUS_COLUMNS[0];
  const getPriority = (key: string | null) => PRIORITIES.find(p => p.key === key);

  function openDetail(d: Demand) {
    setSelectedDemand(d);
    setEditTitle(d.title);
    setEditDescription(d.description || '');
    setEditingTitle(false);
    setEditingDescription(false);
  }

  function renderDemandCard(d: Demand) {
    const ev = d.events as EventOption | undefined;
    const pri = getPriority(d.priority);
    const dateClass = getDateUrgencyClass(d.publish_date);
    return (
      <Card
        key={d.id}
        draggable
        onDragStart={e => handleDragStart(e, d.id)}
        onDragEnd={handleDragEnd}
        className="border-0 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all duration-200 rounded-xl bg-white group"
        onClick={() => openDetail(d)}
      >
        <CardContent className="p-3.5">
          <div className="flex items-start gap-2.5">
            <GripVertical size={14} className="text-gray-200 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{d.title}</p>
              {d.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{d.description}</p>}
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                {ev && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 bg-gray-50 rounded-full px-2 py-0.5">
                    <Avatar className="h-4 w-4">
                      {ev.avatar_url ? <AvatarImage src={ev.avatar_url} /> : null}
                      <AvatarFallback className="bg-gray-200 text-[7px] font-bold text-gray-500">{ev.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    {ev.name}
                  </span>
                )}
                {d.publish_date && (
                  <span className={`inline-flex items-center gap-1 text-[11px] ${dateClass}`}>
                    <Calendar size={10} />
                    {new Date(d.publish_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </span>
                )}
                {pri && (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${pri.color} ${pri.bg} rounded-full px-2 py-0.5`}>
                    <Flag size={9} />
                    {pri.label}
                  </span>
                )}
                {d.attachments && d.attachments.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                    <Paperclip size={10} />{d.attachments.length}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/interno')}>
            <ArrowLeft size={16} className="mr-1" /> Home
          </Button>
          <h2 className="text-sm font-semibold text-gray-900">Design</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
              title="Kanban"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
              title="Lista"
            >
              <List size={16} />
            </button>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-pink-600 hover:bg-pink-700 text-white rounded-full px-5">
            <Plus size={16} className="mr-1" /> Nova Demanda
          </Button>
        </div>
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {STATUS_COLUMNS.map(col => {
            const items = demandsByStatus(col.key);
            const isDragOver = dragOverCol === col.key;
            return (
              <div
                key={col.key}
                className="space-y-2"
                onDragOver={e => handleDragOver(e, col.key)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.key)}
              >
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-gray-100 shadow-sm">
                  <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{col.label}</span>
                  <span className="text-[10px] font-bold text-gray-400 ml-auto bg-gray-100 rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
                </div>
                <div className={`space-y-2 min-h-[120px] rounded-xl transition-all duration-200 p-1.5 ${isDragOver ? 'bg-pink-50/50 ring-2 ring-dashed ring-pink-300' : ''}`}>
                  {items.map(d => renderDemandCard(d))}
                  {items.length === 0 && (
                    <div className={`text-center text-xs py-8 rounded-xl ${isDragOver ? 'text-pink-500 bg-pink-50/50' : 'text-gray-300'}`}>
                      {isDragOver ? 'Solte aqui' : 'Nenhuma demanda'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-1 bg-white rounded-xl border border-gray-100 overflow-hidden">
          {/* List header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
            <div className="col-span-4">Tarefa</div>
            <div className="col-span-2">Evento</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Vencimento</div>
            <div className="col-span-1">Prioridade</div>
            <div className="col-span-1">Anexos</div>
          </div>
          {demands.length === 0 && (
            <div className="text-center text-sm text-gray-300 py-12">Nenhuma demanda criada.</div>
          )}
          {demands.map(d => {
            const ev = d.events as EventOption | undefined;
            const statusCol = getStatusCol(d.status || 'pendente');
            const pri = getPriority(d.priority);
            const dateClass = getDateUrgencyClass(d.publish_date);
            return (
              <div
                key={d.id}
                onClick={() => openDetail(d)}
                className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50 cursor-pointer transition-colors duration-150 border-b border-gray-50 last:border-b-0"
              >
                <div className="col-span-4">
                  <p className="text-sm font-medium text-gray-900 truncate">{d.title}</p>
                  {d.description && <p className="text-[11px] text-gray-400 truncate mt-0.5">{d.description}</p>}
                </div>
                <div className="col-span-2">
                  {ev && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                      <Avatar className="h-4 w-4">
                        {ev.avatar_url ? <AvatarImage src={ev.avatar_url} /> : null}
                        <AvatarFallback className="bg-gray-200 text-[7px] font-bold text-gray-500">{ev.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {ev.name}
                    </span>
                  )}
                </div>
                <div className="col-span-2">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${statusCol.bg} ${statusCol.text} rounded-full px-2.5 py-0.5`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${statusCol.color}`} />
                    {statusCol.label}
                  </span>
                </div>
                <div className="col-span-2">
                  {d.publish_date ? (
                    <span className={`text-[11px] ${dateClass}`}>
                      {new Date(d.publish_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  ) : <span className="text-[11px] text-gray-300">—</span>}
                </div>
                <div className="col-span-1">
                  {pri ? (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${pri.color}`}>
                      <Flag size={9} /> {pri.label}
                    </span>
                  ) : <span className="text-[11px] text-gray-300">—</span>}
                </div>
                <div className="col-span-1">
                  {d.attachments?.length ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                      <Paperclip size={10} /> {d.attachments.length}
                    </span>
                  ) : <span className="text-[11px] text-gray-300">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl">
          {/* Gradient header */}
          <div className="relative bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500 px-7 pt-7 pb-6">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+')] opacity-50" />
            <div className="relative space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70 block">✨ Nova Demanda</span>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/30">
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Nome da arte (Virada de Lote, Abertura de Vendas, etc...)"
                  className="border-0 text-lg font-bold px-0 focus-visible:ring-0 placeholder:text-white/60 text-white bg-transparent h-auto py-0"
                />
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Status & Priority row */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3.5 py-2">
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs font-bold text-yellow-700">Pendente</span>
              </div>

              <div className="h-6 w-px bg-gray-200" />

              <div className="flex items-center gap-1.5">
                <Flag size={13} className="text-gray-400" />
                <span className="text-xs text-gray-400 font-medium mr-1">Prioridade:</span>
                {PRIORITIES.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPriority(priority === p.key ? '' : p.key)}
                    className={`px-5 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${
                      priority === p.key
                        ? p.key === 'urgente'
                          ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-105'
                          : 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:scale-105'
                    }`}
                  >
                    {p.key === 'urgente' ? '🔥' : '✅'} {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Event row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 border border-purple-100 rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={14} className="text-purple-500" />
                  <span className="text-xs font-bold text-purple-700">Vencimento</span>
                </div>
                <Input
                  type="date"
                  value={publishDate}
                  onChange={e => setPublishDate(e.target.value)}
                  className="h-9 text-sm rounded-lg border-purple-200 bg-white/80 focus-visible:ring-purple-400"
                />
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={14} className="text-blue-500" />
                  <span className="text-xs font-bold text-blue-700">Evento</span>
                </div>
                {creatingNewEvent ? (
                  <div className="flex items-center gap-2">
                    <Input value={newEventName} onChange={e => setNewEventName(e.target.value)} placeholder="Nome do evento..." className="h-9 text-sm rounded-lg border-blue-200 bg-white/80" autoFocus />
                    <button onClick={() => { setCreatingNewEvent(false); setNewEventName(''); }} className="text-gray-400 hover:text-red-500 transition-colors"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select value={eventId} onChange={e => setEventId(e.target.value)} className="flex h-9 w-full rounded-lg border border-blue-200 bg-white/80 px-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none transition-all">
                      <option value="">Selecione...</option>
                      {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                    </select>
                    <button onClick={() => setCreatingNewEvent(true)} className="text-xs text-pink-500 hover:text-pink-600 font-bold whitespace-nowrap bg-pink-50 hover:bg-pink-100 rounded-lg px-2.5 py-1.5 transition-all">+ Novo</button>
                  </div>
                )}
              </div>
            </div>

            {/* Briefing */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-pink-500 to-violet-500" />
                <h3 className="text-sm font-bold text-gray-800">Briefing</h3>
              </div>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Descreva o briefing, referências, especificações... ✍️"
                rows={5}
                className="resize-none focus-visible:ring-2 focus-visible:ring-pink-400 placeholder:text-gray-300 text-sm rounded-xl border-gray-200 bg-gray-50/50 hover:bg-white transition-colors"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 flex items-center justify-between border-t border-gray-100 bg-gradient-to-r from-gray-50 to-pink-50/30">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 hover:border-pink-400 hover:shadow-md cursor-pointer transition-all text-xs font-medium text-gray-500 hover:text-pink-500 group">
                <Paperclip size={14} className="group-hover:rotate-12 transition-transform" />
                {files.length > 0 ? `${files.length} arquivo(s)` : 'Anexar arquivo'}
                <input type="file" multiple className="hidden" onChange={e => setFiles(Array.from(e.target.files || []))} />
              </label>
              <button
                onClick={() => { setRefPickerTarget('create'); setShowRefPicker(true); }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 hover:border-violet-400 hover:shadow-md transition-all text-xs font-medium text-gray-500 hover:text-violet-500 group"
              >
                <ImageIcon size={14} className="group-hover:scale-110 transition-transform" />
                Referências {selectedRefUrls.length > 0 && <span className="bg-violet-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">{selectedRefUrls.length}</span>}
              </button>
              {(files.length > 0 || selectedRefUrls.length > 0) && (
                <button onClick={() => { setFiles([]); setSelectedRefUrls([]); }} className="text-gray-400 hover:text-red-500 transition-colors"><X size={14} /></button>
              )}
            </div>
            <Button onClick={handleCreate} disabled={saving} className="bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700 text-white rounded-full px-7 shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 transition-all hover:scale-105 font-bold">
              {saving ? '⏳ Salvando...' : '🚀 Criar Demanda'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reference Picker Dialog */}
      <Dialog open={showRefPicker} onOpenChange={setShowRefPicker}>
        <DialogContent className="max-w-xl max-h-[70vh] overflow-hidden rounded-2xl p-0">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Selecionar Referências</h3>
            <p className="text-xs text-gray-400 mt-0.5">Clique nas imagens para selecionar</p>
          </div>
          <div className="p-4 overflow-y-auto max-h-[50vh]">
            {references.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-8">Nenhuma referência encontrada.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {references.map(ref => {
                  const isSelected = refPickerTarget === 'create'
                    ? selectedRefUrls.includes(ref.image_url)
                    : selectedDemand?.attachments?.includes(ref.image_url);
                  return (
                    <button
                      key={ref.id}
                      onClick={() => {
                        if (refPickerTarget === 'create') {
                          setSelectedRefUrls(prev =>
                            prev.includes(ref.image_url)
                              ? prev.filter(u => u !== ref.image_url)
                              : [...prev, ref.image_url]
                          );
                        } else if (selectedDemand) {
                          handleAttachReference(selectedDemand.id, ref.image_url);
                        }
                      }}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                        isSelected ? 'border-pink-500 ring-2 ring-pink-200' : 'border-transparent hover:border-gray-200'
                      }`}
                    >
                      <img src={ref.image_url} alt={ref.observation || ''} className="w-full h-full object-cover" />
                      {isSelected && (
                        <div className="absolute inset-0 bg-pink-500/20 flex items-center justify-center">
                          <CheckCircle2 size={24} className="text-pink-600" />
                        </div>
                      )}
                      {ref.observation && (
                        <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1.5 py-0.5">
                          <p className="text-[9px] text-white truncate">{ref.observation}</p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
            <Button size="sm" onClick={() => setShowRefPicker(false)} className="bg-pink-600 hover:bg-pink-700 text-white rounded-full px-5">
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedDemand} onOpenChange={() => setSelectedDemand(null)}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl">
          {selectedDemand && (() => {
            const ev = selectedDemand.events as EventOption | undefined;
            const dateClass = getDateUrgencyClass(selectedDemand.publish_date);

            return (
              <>
                {/* Breadcrumb */}
                <div className="px-6 pt-4 pb-2 flex items-center gap-2 text-xs text-gray-400">
                  {ev && (
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar className="h-4 w-4">
                        {ev.avatar_url ? <AvatarImage src={ev.avatar_url} /> : null}
                        <AvatarFallback className="bg-gray-200 text-[7px] font-bold text-gray-500">{ev.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {ev.name}
                    </span>
                  )}
                  <span className="text-gray-300">›</span>
                  <span className="text-gray-500 font-medium truncate">{selectedDemand.title}</span>
                </div>

                {/* Title - Editable */}
                <div className="px-6 pb-3">
                  {editingTitle ? (
                    <Input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={() => handleUpdateTitle(selectedDemand.id, editTitle)}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdateTitle(selectedDemand.id, editTitle); if (e.key === 'Escape') setEditingTitle(false); }}
                      className="border-0 text-xl font-bold px-0 focus-visible:ring-0 h-auto py-1"
                      autoFocus
                    />
                  ) : (
                    <h2
                      className="text-xl font-bold text-gray-900 cursor-text hover:bg-gray-50 rounded-lg px-1 -mx-1 py-1 transition-colors"
                      onClick={() => { setEditTitle(selectedDemand.title); setEditingTitle(true); }}
                    >
                      {selectedDemand.title}
                    </h2>
                  )}
                </div>

                {/* Meta fields */}
                <div className="px-6 py-3 border-t border-gray-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                    {/* Status */}
                    <div className="flex items-center gap-3">
                      <Circle size={14} className="text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-400 w-20 shrink-0">Status</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {STATUS_COLUMNS.map(col => {
                          const isActive = (selectedDemand.status || 'pendente') === col.key;
                          return (
                            <button
                              key={col.key}
                              onClick={() => handleStatusChange(selectedDemand.id, col.key)}
                              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                                isActive ? `${col.bg} ${col.text} ring-1 ring-current` : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                              }`}
                            >
                              {col.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Responsável */}
                    <div className="flex items-center gap-3">
                      <User size={14} className="text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-400 w-24 shrink-0">Responsável</span>
                      <span className="text-xs text-gray-300 italic">Em breve</span>
                    </div>

                    {/* Vencimento */}
                    <div className="flex items-center gap-3">
                      <Calendar size={14} className={`shrink-0 ${dateClass || 'text-gray-400'}`} />
                      <span className="text-xs text-gray-400 w-20 shrink-0">Vencimento</span>
                      <Input
                        type="date"
                        value={selectedDemand.publish_date || ''}
                        onChange={e => handleDateChange(selectedDemand.id, e.target.value)}
                        className={`h-7 text-xs w-40 rounded-lg border-gray-200 ${dateClass}`}
                      />
                    </div>

                    {/* Prioridade */}
                    <div className="flex items-center gap-3">
                      <Flag size={14} className="text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-400 w-24 shrink-0">Prioridade</span>
                      <div className="flex gap-1.5">
                        {PRIORITIES.map(p => (
                          <button
                            key={p.key}
                            onClick={() => handlePriorityChange(selectedDemand.id, selectedDemand.priority === p.key ? null : p.key)}
                            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                              selectedDemand.priority === p.key ? `${p.bg} ${p.color} ring-1 ring-current` : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Briefing */}
                <div className="px-6 py-4 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">Briefing ⚡</h3>
                  {editingDescription ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
                        rows={8}
                        className="resize-none focus-visible:ring-1 focus-visible:ring-pink-300 text-sm rounded-xl border-gray-200"
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setEditingDescription(false)} className="text-xs rounded-full">Cancelar</Button>
                        <Button size="sm" onClick={() => handleUpdateDescription(selectedDemand.id, editDescription)} className="bg-pink-600 hover:bg-pink-700 text-white text-xs rounded-full">Salvar</Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="min-h-[80px] p-4 rounded-xl bg-gray-50 hover:bg-gray-100 cursor-text transition-colors text-sm text-gray-700 whitespace-pre-wrap"
                      onClick={() => { setEditDescription(selectedDemand.description || ''); setEditingDescription(true); }}
                    >
                      {selectedDemand.description || <span className="text-gray-300 italic">Clique para adicionar o briefing...</span>}
                    </div>
                  )}
                </div>

                {/* Attachments */}
                <div className="px-6 py-4 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">
                    Arquivos <span className="text-gray-400 font-normal">({selectedDemand.attachments?.length || 0})</span>
                  </h3>
                  {selectedDemand.attachments && selectedDemand.attachments.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {selectedDemand.attachments.map((url, i) => {
                        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
                        const fileName = decodeURIComponent(url.split('/').pop() || '').replace(/^[a-f0-9-]+-/, '');
                        return (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="group relative rounded-xl border border-gray-100 overflow-hidden hover:border-pink-300 transition-all">
                            {isImage ? (
                              <img src={url} alt={fileName} className="w-full h-20 object-cover" />
                            ) : (
                              <div className="w-full h-20 flex flex-col items-center justify-center bg-gray-50 p-2">
                                <Paperclip size={16} className="text-gray-400 mb-1" />
                                <span className="text-[9px] text-gray-400 truncate max-w-full">{fileName}</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <ExternalLink size={14} className="text-white" />
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-gray-200 hover:border-pink-400 cursor-pointer transition-all group flex-1">
                      <Upload size={16} className="text-gray-400 group-hover:text-pink-500" />
                      <span className="text-xs text-gray-400 group-hover:text-pink-500">{uploadingFile ? 'Enviando...' : 'Enviar arquivo'}</span>
                      <input type="file" multiple className="hidden" disabled={uploadingFile} onChange={e => { if (e.target.files?.length) handleUploadDelivery(selectedDemand.id, e.target.files); }} />
                    </label>
                    <button
                      onClick={() => { setRefPickerTarget('detail'); setShowRefPicker(true); }}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-gray-200 hover:border-pink-400 transition-all group"
                    >
                      <ImageIcon size={16} className="text-gray-400 group-hover:text-pink-500" />
                      <span className="text-xs text-gray-400 group-hover:text-pink-500">Anexar referências</span>
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <Clock size={11} />
                    Criada em {new Date(selectedDemand.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 text-xs rounded-full"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: 'Excluir demanda',
                        description: 'Excluir esta demanda?',
                        confirmText: 'Excluir',
                        destructive: true,
                      });
                      if (ok) handleDeleteDemand(selectedDemand.id);
                    }}
                  >
                    Excluir
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
