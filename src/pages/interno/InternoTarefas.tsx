import { useEffect, useState, useCallback, useRef, DragEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, GripVertical, Calendar, Flag, Paperclip, Circle, Loader2, CheckCircle2, Trash2, Upload, X, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface TeamTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  assigned_to: string | null;
  created_by: string | null;
  attachments: string[];
  due_date: string | null;
  created_at: string;
  event_id: string | null;
}

interface ProfileInfo {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface EventInfo {
  id: string;
  name: string;
  avatar_url: string | null;
}

const STATUS_COLUMNS = [
  { key: 'pendente', label: 'Pendente', color: 'bg-yellow-500', bg: 'bg-yellow-500/10', text: 'text-yellow-600', border: 'border-yellow-500/20', icon: Circle },
  { key: 'em andamento', label: 'Em Andamento', color: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-600', border: 'border-blue-500/20', icon: Loader2 },
  { key: 'finalizado', label: 'Finalizado', color: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/20', icon: CheckCircle2 },
];

const PRIORITIES = [
  { key: 'razoavel', label: 'Razoável', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { key: 'urgente', label: 'Urgente', color: 'text-red-500', bg: 'bg-red-500/10' },
];

function getDateUrgencyClass(dateStr: string | null): string {
  if (!dateStr) return 'text-gray-400';
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T12:00:00');
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'text-red-600 font-bold';
  if (diffDays <= 1) return 'text-red-600 font-bold';
  if (diffDays <= 3) return 'text-orange-500 font-semibold';
  if (diffDays <= 7) return 'text-yellow-600';
  return 'text-gray-400';
}

export default function InternoTarefas() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TeamTask | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const draggedId = useRef<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [uploadingFile, setUploadingFile] = useState(false);

  // Create form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [eventId, setEventId] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  // Detail editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState('');

  const load = useCallback(async () => {
    const [taskRes, profileRes, eventRes] = await Promise.all([
      supabase.from('team_tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('user_id, full_name, email'),
      supabase.from('events').select('id, name, avatar_url').order('name'),
    ]);
    setTasks((taskRes.data || []) as TeamTask[]);
    setProfiles(profileRes.data || []);
    setEvents(eventRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getProfileName = (userId: string | null) => {
    if (!userId) return null;
    const p = profiles.find(pr => pr.user_id === userId);
    return p?.full_name || p?.email?.split('@')[0] || null;
  };

  const getEvent = (eId: string | null) => {
    if (!eId) return null;
    return events.find(ev => ev.id === eId) || null;
  };

  async function handleCreate() {
    if (!title.trim()) { toast.error('Título é obrigatório'); return; }
    setSaving(true);

    const attachmentUrls: string[] = [];
    for (const file of files) {
      const path = `tasks/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from('design-attachments').upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from('design-attachments').getPublicUrl(path);
        attachmentUrls.push(data.publicUrl);
      }
    }

    const { error } = await supabase.from('team_tasks').insert({
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      priority: priority || null,
      assigned_to: assignedTo || null,
      event_id: eventId || null,
      created_by: user?.id || null,
      attachments: attachmentUrls,
    });

    if (error) { toast.error('Erro ao criar tarefa'); }
    else {
      toast.success('Tarefa criada!');
      setShowCreate(false);
      setTitle(''); setDescription(''); setDueDate(''); setPriority(''); setAssignedTo(''); setEventId(''); setFiles([]);
      load();
    }
    setSaving(false);
  }

  async function handleStatusChange(taskId: string, newStatus: string) {
    const { error } = await supabase.from('team_tasks').update({ status: newStatus }).eq('id', taskId);
    if (error) { toast.error('Erro ao atualizar status'); } else {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null);
    }
  }

  async function handlePriorityChange(taskId: string, newPriority: string | null) {
    const { error } = await supabase.from('team_tasks').update({ priority: newPriority }).eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority: newPriority } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, priority: newPriority } : null);
    }
  }

  async function handleEventChange(taskId: string, newEventId: string | null) {
    const { error } = await supabase.from('team_tasks').update({ event_id: newEventId }).eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, event_id: newEventId } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, event_id: newEventId } : null);
    }
  }

  async function handleUpdateTitle(taskId: string, newTitle: string) {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from('team_tasks').update({ title: newTitle.trim() }).eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, title: newTitle.trim() } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, title: newTitle.trim() } : null);
    }
    setEditingTitle(false);
  }

  async function handleUpdateDescription(taskId: string, newDesc: string) {
    const { error } = await supabase.from('team_tasks').update({ description: newDesc.trim() || null }).eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, description: newDesc.trim() || null } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, description: newDesc.trim() || null } : null);
      toast.success('Descrição atualizada');
    }
    setEditingDescription(false);
  }

  async function handleDateChange(taskId: string, newDate: string) {
    const { error } = await supabase.from('team_tasks').update({ due_date: newDate || null }).eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, due_date: newDate || null } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, due_date: newDate || null } : null);
    }
  }

  async function handleAssignChange(taskId: string, userId: string) {
    const { error } = await supabase.from('team_tasks').update({ assigned_to: userId || null }).eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assigned_to: userId || null } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, assigned_to: userId || null } : null);
    }
  }

  async function handleUploadAttachment(taskId: string, fileList: FileList) {
    setUploadingFile(true);
    const task = tasks.find(t => t.id === taskId);
    const current = task?.attachments || [];
    const newUrls: string[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const path = `tasks/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from('design-attachments').upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from('design-attachments').getPublicUrl(path);
        newUrls.push(data.publicUrl);
      }
    }
    const updated = [...current, ...newUrls];
    const { error } = await supabase.from('team_tasks').update({ attachments: updated }).eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, attachments: updated } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, attachments: updated } : null);
      toast.success(`${newUrls.length} arquivo(s) enviado(s)`);
    }
    setUploadingFile(false);
  }

  async function handleDeleteTask(taskId: string) {
    const { error } = await supabase.from('team_tasks').delete().eq('id', taskId);
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setSelectedTask(null);
      toast.success('Tarefa excluída');
    }
  }

  // Drag handlers
  function handleDragStart(e: DragEvent, id: string) {
    draggedId.current = id;
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
    const task = tasks.find(t => t.id === id);
    if (task && task.status !== colKey) handleStatusChange(id, colKey);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  const tasksByStatus = (status: string) => tasks.filter(t => t.status === status);
  const getPriority = (key: string | null) => PRIORITIES.find(p => p.key === key);

  function openDetail(t: TeamTask) {
    setSelectedTask(t);
    setEditTitle(t.title);
    setEditDescription(t.description || '');
    setEditingTitle(false);
    setEditingDescription(false);
  }

  function renderTaskCard(t: TeamTask) {
    const pri = getPriority(t.priority);
    const dateClass = getDateUrgencyClass(t.due_date);
    const assignedName = getProfileName(t.assigned_to);
    const event = getEvent(t.event_id);
    return (
      <Card
        key={t.id}
        draggable
        onDragStart={e => handleDragStart(e, t.id)}
        onDragEnd={handleDragEnd}
        className="border-0 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all duration-200 rounded-xl bg-white dark:bg-gray-900 group"
        onClick={() => openDetail(t)}
      >
        <CardContent className="p-3.5">
          <div className="flex items-start gap-2.5">
            <GripVertical size={14} className="text-gray-200 dark:text-gray-700 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{t.title}</p>
              {t.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{t.description}</p>}
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                {event && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-full px-2 py-0.5">
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={event.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[7px] bg-gradient-to-br from-pink-500 to-orange-400 text-white font-bold">
                        {event.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    {event.name}
                  </span>
                )}
                {assignedName && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-full px-2 py-0.5">
                    <div className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[7px] text-white font-bold">
                      {assignedName.charAt(0).toUpperCase()}
                    </div>
                    {assignedName}
                  </span>
                )}
                {t.due_date && (
                  <span className={`inline-flex items-center gap-1 text-[11px] ${dateClass}`}>
                    <Calendar size={10} />
                    {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </span>
                )}
                {pri && (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${pri.color} ${pri.bg} rounded-full px-2 py-0.5`}>
                    <Flag size={9} />
                    {pri.label}
                  </span>
                )}
                {t.attachments && t.attachments.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                    <Paperclip size={10} />{t.attachments.length}
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
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tarefas</h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button onClick={() => setViewMode('kanban')} className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600'}`}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600'}`}>
              <List size={16} />
            </button>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-5">
            <Plus size={16} className="mr-1" /> Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {STATUS_COLUMNS.map(col => {
            const items = tasksByStatus(col.key);
            const isDragOver = dragOverCol === col.key;
            return (
              <div key={col.key} className="space-y-2"
                onDragOver={e => handleDragOver(e, col.key)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.key)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`h-2 w-2 rounded-full ${col.color}`} />
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{col.label}</span>
                  <span className="text-[10px] font-medium text-gray-300 dark:text-gray-600">{items.length}</span>
                </div>
                <div className={`min-h-[120px] rounded-xl p-2 space-y-2 transition-colors ${isDragOver ? `${col.bg} ring-2 ring-inset ${col.border}` : 'bg-gray-50/50 dark:bg-gray-900/50'}`}>
                  {items.map(t => renderTaskCard(t))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-1.5">
          {tasks.map(t => {
            const col = STATUS_COLUMNS.find(c => c.key === t.status) || STATUS_COLUMNS[0];
            const pri = getPriority(t.priority);
            const dateClass = getDateUrgencyClass(t.due_date);
            const assignedName = getProfileName(t.assigned_to);
            const event = getEvent(t.event_id);
            return (
              <div key={t.id} onClick={() => openDetail(t)} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-900 hover:shadow-sm cursor-pointer transition-all border border-transparent hover:border-gray-100 dark:hover:border-gray-800">
                <div className={`h-2 w-2 rounded-full shrink-0 ${col.color}`} />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1 truncate">{t.title}</span>
                {event && (
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={event.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[8px] bg-gradient-to-br from-pink-500 to-orange-400 text-white font-bold">{event.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
                {assignedName && <span className="text-[11px] text-gray-400">{assignedName}</span>}
                {t.due_date && <span className={`text-[11px] ${dateClass}`}>{new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                {pri && <span className={`text-[11px] font-medium ${pri.color}`}>{pri.label}</span>}
              </div>
            );
          })}
          {tasks.length === 0 && <p className="text-center text-sm text-gray-400 py-10">Nenhuma tarefa ainda</p>}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl border-0">
          <div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 p-5">
            <h3 className="text-lg font-bold text-white">Nova Tarefa</h3>
            <p className="text-blue-100 text-xs mt-1">Crie uma tarefa para o time</p>
          </div>
          <div className="p-5 space-y-4">
            <Input placeholder="Título da tarefa" value={title} onChange={e => setTitle(e.target.value)} className="rounded-xl border-gray-200 dark:border-gray-700" />
            <Textarea placeholder="Descrição (opcional)" value={description} onChange={e => setDescription(e.target.value)} className="rounded-xl border-gray-200 dark:border-gray-700 min-h-[80px]" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Prazo</label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="rounded-xl border-gray-200 dark:border-gray-700" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Responsável</label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger className="rounded-xl border-gray-200 dark:border-gray-700">
                    <SelectValue placeholder="Ninguém" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguém</SelectItem>
                    {profiles.map(p => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.full_name || p.email?.split('@')[0]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Prioridade</label>
                <div className="flex gap-2">
                  {PRIORITIES.map(p => (
                    <button key={p.key} onClick={() => setPriority(priority === p.key ? '' : p.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${priority === p.key ? `${p.bg} ${p.color} border-current` : 'border-gray-200 dark:border-gray-700 text-gray-400'}`}>
                      <Flag size={10} /> {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Evento</label>
                <Select value={eventId} onValueChange={setEventId}>
                  <SelectTrigger className="rounded-xl border-gray-200 dark:border-gray-700">
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {events.map(ev => (
                      <SelectItem key={ev.id} value={ev.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-4 w-4">
                            <AvatarImage src={ev.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[7px] bg-gradient-to-br from-pink-500 to-orange-400 text-white font-bold">{ev.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          {ev.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">Anexos</label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 cursor-pointer hover:border-blue-400 transition-colors">
                <Upload size={14} className="text-gray-400" />
                <span className="text-xs text-gray-400">{files.length > 0 ? `${files.length} arquivo(s)` : 'Anexar arquivos'}</span>
                <input type="file" multiple className="hidden" onChange={e => setFiles(Array.from(e.target.files || []))} />
              </label>
            </div>
            <Button onClick={handleCreate} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
              {saving ? 'Criando...' : 'Criar Tarefa'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl border-0">
          {selectedTask && (
            <>
              <div className="p-5 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {editingTitle ? (
                      <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={() => handleUpdateTitle(selectedTask.id, editTitle)} onKeyDown={e => e.key === 'Enter' && handleUpdateTitle(selectedTask.id, editTitle)} autoFocus className="text-lg font-bold border-0 p-0 h-auto focus-visible:ring-0" />
                    ) : (
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setEditingTitle(true)}>{selectedTask.title}</h3>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1">
                      Criada em {new Date(selectedTask.created_at).toLocaleDateString('pt-BR')}
                      {getProfileName(selectedTask.created_by) && ` por ${getProfileName(selectedTask.created_by)}`}
                    </p>
                  </div>
                  <button onClick={() => handleDeleteTask(selectedTask.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Status */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Status</label>
                  <div className="flex gap-1.5">
                    {STATUS_COLUMNS.map(col => (
                      <button key={col.key} onClick={() => handleStatusChange(selectedTask.id, col.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${selectedTask.status === col.key ? `${col.bg} ${col.text} border-current` : 'border-gray-200 dark:border-gray-700 text-gray-400'}`}>
                        <col.icon size={10} /> {col.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Priority */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-2 block">Prioridade</label>
                    <div className="flex gap-1.5">
                      {PRIORITIES.map(p => (
                        <button key={p.key} onClick={() => handlePriorityChange(selectedTask.id, selectedTask.priority === p.key ? null : p.key)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${selectedTask.priority === p.key ? `${p.bg} ${p.color} border-current` : 'border-gray-200 dark:border-gray-700 text-gray-400'}`}>
                          <Flag size={10} /> {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Event */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-2 block">Evento</label>
                    <Select value={selectedTask.event_id || 'none'} onValueChange={v => handleEventChange(selectedTask.id, v === 'none' ? null : v)}>
                      <SelectTrigger className="rounded-xl border-gray-200 dark:border-gray-700 h-8 text-xs">
                        <SelectValue placeholder="Nenhum" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {events.map(ev => (
                          <SelectItem key={ev.id} value={ev.id}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={ev.avatar_url ?? undefined} />
                                <AvatarFallback className="text-[7px] bg-gradient-to-br from-pink-500 to-orange-400 text-white font-bold">{ev.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              {ev.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Assigned */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Responsável</label>
                  <Select value={selectedTask.assigned_to || 'none'} onValueChange={v => handleAssignChange(selectedTask.id, v === 'none' ? '' : v)}>
                    <SelectTrigger className="rounded-xl border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Ninguém" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ninguém</SelectItem>
                      {profiles.map(p => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          {p.full_name || p.email?.split('@')[0]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Due date */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Prazo</label>
                  <Input type="date" value={selectedTask.due_date || ''} onChange={e => handleDateChange(selectedTask.id, e.target.value)} className="rounded-xl border-gray-200 dark:border-gray-700" />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Descrição</label>
                  {editingDescription ? (
                    <div className="space-y-2">
                      <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} className="rounded-xl border-gray-200 dark:border-gray-700 min-h-[80px]" autoFocus />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdateDescription(selectedTask.id, editDescription)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs">Salvar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingDescription(false)} className="text-xs">Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-600 transition-colors min-h-[40px] p-2 rounded-xl bg-gray-50 dark:bg-gray-900"
                      onClick={() => { setEditDescription(selectedTask.description || ''); setEditingDescription(true); }}>
                      {selectedTask.description || 'Clique para adicionar descrição...'}
                    </p>
                  )}
                </div>

                {/* Attachments */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Anexos</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTask.attachments?.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="h-16 w-16 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 hover:ring-2 ring-blue-500 transition-all">
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </a>
                    ))}
                    <label className="h-16 w-16 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors">
                      {uploadingFile ? <Loader2 size={16} className="animate-spin text-gray-400" /> : <Upload size={16} className="text-gray-300" />}
                      <input type="file" multiple className="hidden" onChange={e => e.target.files && handleUploadAttachment(selectedTask.id, e.target.files)} />
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
