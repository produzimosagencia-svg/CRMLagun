import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, Sparkles, Loader2, Trash2, Paperclip, X,
  Image as ImageIcon, Video, ChevronDown, User, ArrowLeft,
  Plus, MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeft,
} from 'lucide-react';
import { Check, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';

type Msg = { role: 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> };

interface ActiveJob {
  id: string;
  progress: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  label: string;
}

interface ParsedOption {
  number: string;
  emoji: string;
  label: string;
  full: string;
}

const KEY_QUESTION_PATTERNS = [
  /qual página do facebook/i,
  /qual o objetivo da campanha/i,
  /qual o orçamento/i,
  /qual público-alvo/i,
  /quanto tempo a campanha deve rodar/i,
  /já tem o criativo pronto/i,
  /posso criar\?/i,
];

const CUSTOM_OPTION_PATTERNS = [
  /\boutro\b/i,
  /personalizado/i,
  /datas específicas/i,
  /me diga/i,
  /me descreva/i,
  /outro valor/i,
];

const CONFIRMATION_PATTERN = /posso criar\?\s*\(?\s*sim\s*\/?\s*n[aã]o\s*\)?/i;

function isConfirmationMessage(text: string) {
  return CONFIRMATION_PATTERN.test(text);
}

function shouldRenderChoiceButtons(text: string) {
  return KEY_QUESTION_PATTERNS.some((pattern) => pattern.test(text));
}

function shouldShowCustomOption(options: ParsedOption[]) {
  return options.some((option) => CUSTOM_OPTION_PATTERNS.some((pattern) => pattern.test(option.label)));
}

/** Parses numbered option lines like "1. 📢 Reconhecimento de marca" from markdown */
function parseOptionsFromText(text: string): { textBefore: string; options: ParsedOption[]; textAfter: string } | null {
  const lines = text.split('\n');
  const optionRegex = /^>\s*(\d+)\.\s*(.+)$|^(\d+)\.\s*(.+)$/;
  
  let firstOptionIdx = -1;
  let lastOptionIdx = -1;
  const options: ParsedOption[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].trim().match(optionRegex);
    if (match) {
      const num = match[1] || match[3];
      const rest = (match[2] || match[4]).trim();
      // Extract emoji if present
      const emojiMatch = rest.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u);
      const emoji = emojiMatch ? emojiMatch[1] : '';
      const label = emojiMatch ? rest.slice(emojiMatch[0].length) : rest;
      options.push({ number: num, emoji, label, full: rest });
      if (firstOptionIdx === -1) firstOptionIdx = i;
      lastOptionIdx = i;
    } else if (firstOptionIdx !== -1 && lines[i].trim() !== '' && lines[i].trim() !== '>') {
      // Non-option line after options started — break
      break;
    }
  }

  if (options.length < 2) return null;

  const textBefore = lines.slice(0, firstOptionIdx).join('\n').trim();
  const textAfter = lines.slice(lastOptionIdx + 1).join('\n').trim();
  return { textBefore, options, textAfter };
}

interface Conversation {
  id: string;
  title: string;
  messages: Msg[];
  event_name: string | null;
  campaign_type: string | null;
  updated_at: string;
}

const CAMPAIGN_TYPES = [
  { value: 'awareness', label: 'Reconhecimento', emoji: '📢' },
  { value: 'traffic', label: 'Tráfego', emoji: '🚀' },
  { value: 'engagement', label: 'Engajamento', emoji: '❤️' },
  { value: 'leads', label: 'Geração de Leads', emoji: '📋' },
  { value: 'conversions', label: 'Vendas', emoji: '🛒' },
  { value: 'retargeting', label: 'Retargeting', emoji: '🎯' },
];

const FB_PAGES = [
  { id: '111995833759317', name: 'Tríade Entretenimento', emoji: '🎪' },
  { id: '104943821682952', name: 'Pagodear', emoji: '🎵' },
  { id: '100615512537933', name: 'Vitória Festival', emoji: '🎉' },
  { id: '224775547376642', name: 'BoomRAP Festival', emoji: '🎤' },
  { id: '314002121786668', name: 'Maestria', emoji: '🎶' },
];

const QUICK_PROMPTS = [
  '📊 Relatório de performance',
  '💡 Sugira criativos',
  '🎯 Analise o público-alvo',
  '💰 Otimizar orçamento',
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trafego-gpt`;

export default function InternoTrafegoGPT() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [eventName, setEventName] = useState('');
  const [campaignType, setCampaignType] = useState('');
  const [pageName, setPageName] = useState('');
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [attachedImages, setAttachedImages] = useState<{ file: File; preview: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileAccept, setFileAccept] = useState('image/*,video/*');
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load events
  useEffect(() => {
    supabase.from('events').select('id, name').order('event_date', { ascending: false }).then(({ data }) => {
      if (data) setEvents(data);
    });
  }, []);

  // Load conversations
  useEffect(() => {
    if (!user) return;
    supabase
      .from('trafego_gpt_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) setConversations(data as unknown as Conversation[]);
      });
  }, [user]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 50);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Auto-save conversation
  const saveConversation = useCallback(async (msgs: Msg[], convId: string | null) => {
    if (!user || msgs.length === 0) return;

    const firstUserMsg = msgs.find(m => m.role === 'user');
    let title = 'Nova conversa';
    if (firstUserMsg) {
      const text = typeof firstUserMsg.content === 'string' ? firstUserMsg.content : firstUserMsg.content.find(p => p.type === 'text')?.text || '';
      title = text.slice(0, 60) || 'Nova conversa';
    }

    if (convId) {
      const { error } = await supabase
        .from('trafego_gpt_conversations')
        .update({ messages: JSON.parse(JSON.stringify(msgs)), title, event_name: eventName || null, campaign_type: campaignType || null, updated_at: new Date().toISOString() })
        .eq('id', convId);
      if (!error) {
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: msgs, title, updated_at: new Date().toISOString() } : c));
      }
    } else {
      const { data, error } = await supabase
        .from('trafego_gpt_conversations')
        .insert([{ user_id: user.id, title, messages: JSON.parse(JSON.stringify(msgs)), event_name: eventName || null, campaign_type: campaignType || null }])
        .select()
        .single();
      if (!error && data) {
        const conv = data as unknown as Conversation;
        setActiveConversationId(conv.id);
        setConversations(prev => [conv, ...prev]);
      }
    }
  }, [user, eventName, campaignType]);

  const debouncedSave = useCallback((msgs: Msg[], convId: string | null) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveConversation(msgs, convId), 1500);
  }, [saveConversation]);

  // Poll active job for progress
  useEffect(() => {
    if (!activeJob || activeJob.status === 'completed' || activeJob.status === 'failed') return;

    const PROGRESS_LABELS: Record<number, string> = {
      0: 'Preparando...',
      10: 'Iniciando processamento...',
      30: 'Enviando criativo ao Meta Ads...',
      50: 'Aguardando resposta...',
      70: 'Processando resultado...',
      80: 'Gerando resposta...',
      100: 'Concluído!',
    };

    const getLabel = (progress: number) => {
      const keys = Object.keys(PROGRESS_LABELS).map(Number).sort((a, b) => b - a);
      for (const k of keys) {
        if (progress >= k) return PROGRESS_LABELS[k];
      }
      return 'Processando...';
    };

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('meta_ads_jobs')
        .select('status, progress, result, error_message')
        .eq('id', activeJob.id)
        .single();

      if (!data) return;

      const result = data.result as any;
      const stageLabel = result?.workflow?.stage_label;

      setActiveJob(prev => prev ? {
        ...prev,
        progress: data.progress as number,
        status: data.status as ActiveJob['status'],
        label: stageLabel || getLabel(data.progress as number),
      } : null);

      if (data.status === 'completed') {
        const finalStatus = result?.workflow?.final_status;
        const aiResponse = result?.ai_response || (finalStatus === 'campaign_created'
          ? '✅ Ação concluída com sucesso!'
          : finalStatus === 'failed'
            ? `❌ ${data.error_message || 'O processo foi encerrado com erro.'}`
            : '⚠️ Processo concluído parcialmente.');
        setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
        setActiveJob(null);
        setIsLoading(false);
        setMessages(prev => {
          debouncedSave(prev, activeConversationId);
          return prev;
        });
      } else if (data.status === 'failed') {
        setMessages(prev => [...prev, { role: 'assistant', content: `❌ Erro: ${data.error_message || 'Erro desconhecido'}` }]);
        setActiveJob(null);
        setIsLoading(false);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJob, debouncedSave, activeConversationId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const maxSizeImage = 20 * 1024 * 1024;
    const maxSizeVideo = 100 * 1024 * 1024;
    const newImages: { file: File; preview: string }[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        toast.error(`${file.name} não é uma imagem ou vídeo`);
        continue;
      }
      const isVideo = file.type.startsWith('video/');
      const limit = isVideo ? maxSizeVideo : maxSizeImage;
      if (file.size > limit) {
        toast.error(`${file.name} é maior que ${isVideo ? '100MB' : '20MB'}`);
        continue;
      }
      newImages.push({ file, preview: URL.createObjectURL(file) });
    }
    setAttachedImages(prev => [...prev, ...newImages].slice(0, 4));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setAttachedImages(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `trafego-gpt/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('temp-uploads').upload(path, file);
    if (error) { console.error('Upload error:', error); return null; }
    const { data: { publicUrl } } = supabase.storage.from('temp-uploads').getPublicUrl(path);
    return publicUrl;
  };

  const getDisplayContent = (msg: Msg): string => {
    if (typeof msg.content === 'string') return msg.content;
    return msg.content.filter(p => p.type === 'text').map(p => p.text).join('') || '';
  };

  const getImageUrls = (msg: Msg): string[] => {
    if (typeof msg.content === 'string') return [];
    return msg.content.filter(p => p.type === 'image_url').map(p => p.image_url?.url || '').filter(Boolean);
  };

  const sendMessage = async (text: string) => {
    if ((!text.trim() && attachedImages.length === 0) || isLoading) return;
    setIsLoading(true);
    setLoadingPhase('Pensando...');

    let imageUrls: string[] = [];
    if (attachedImages.length > 0) {
      setIsUploading(true);
      const uploads = await Promise.all(attachedImages.map(img => uploadImage(img.file)));
      imageUrls = uploads.filter(Boolean) as string[];
      setIsUploading(false);
      attachedImages.forEach(img => URL.revokeObjectURL(img.preview));
      setAttachedImages([]);
    }

    let userContent: Msg['content'];
    if (imageUrls.length > 0) {
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      if (text.trim()) parts.push({ type: 'text', text: text.trim() });
      for (const url of imageUrls) parts.push({ type: 'image_url', image_url: { url } });
      userContent = parts;
    } else {
      userContent = text.trim();
    }

    const userMsg: Msg = { role: 'user', content: userContent };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    let assistantSoFar = '';
    const currentConvId = activeConversationId;
    let jobStarted = false;

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setLoadingPhase('');
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: newMessages, event_name: eventName, campaign_type: campaignType, page_id: pageName, page_name: selectedPage?.name || '' }),
      });

      if (!resp.ok || !resp.body) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${resp.status}`);
      }

      // Detect if response is taking long (tool calls happening server-side)
      let phaseTimer: ReturnType<typeof setTimeout> | null = null;
      let phaseIdx = 0;
      const phases = ['Processando...', 'Verificando ação...', 'Subindo campanha...', 'Quase lá...'];
      const startPhaseRotation = () => {
        phaseTimer = setInterval(() => {
          phaseIdx = (phaseIdx + 1) % phases.length;
          setLoadingPhase(phases[phaseIdx]);
        }, 4000);
      };

      // Start rotating phases after 3 seconds of no content
      const phaseStart = setTimeout(() => {
        setLoadingPhase(phases[0]);
        startPhaseRotation();
      }, 3000);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            // Check for job event (async processing)
            if (parsed.job_id) {
              clearTimeout(phaseStart);
              if (phaseTimer) clearInterval(phaseTimer);
              setLoadingPhase('');
              setActiveJob({ id: parsed.job_id, progress: 0, status: 'pending', label: 'Preparando...' });
              // Fire the process-meta-job function (fire-and-forget)
              const { data: { session: jobSession } } = await supabase.auth.getSession();
              fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-meta-job`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${jobSession?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                },
                body: JSON.stringify({ job_id: parsed.job_id }),
              }).catch(err => console.error('process-meta-job fire error:', err));
              // Don't set isLoading false — the job polling will handle that
              jobStarted = true;
              debouncedSave(newMessages, currentConvId);
              continue;
            }
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { textBuffer = line + '\n' + textBuffer; break; }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
      // Cleanup phase timers
      clearTimeout(phaseStart);
      if (phaseTimer) clearInterval(phaseTimer);
      setLoadingPhase('');
    } catch (e: any) {
      console.error('TráfegoGPT error:', e);
      upsertAssistant(`❌ Erro: ${e.message}`);
    } finally {
      if (!jobStarted) {
        setIsLoading(false);
      }
      // Save after response completes
      setMessages(prev => {
        debouncedSave(prev, currentConvId);
        return prev;
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const newConversation = () => {
    setMessages([]);
    setActiveConversationId(null);
    setEventName('');
    setCampaignType('');
  };

  const loadConversation = (conv: Conversation) => {
    setMessages(conv.messages);
    setActiveConversationId(conv.id);
    setEventName(conv.event_name || '');
    setCampaignType(conv.campaign_type || '');
  };

  const deleteConversation = async (id: string) => {
    await supabase.from('trafego_gpt_conversations').delete().eq('id', id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversationId === id) newConversation();
  };

  const renameConversation = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    await supabase.from('trafego_gpt_conversations').update({ title: newTitle.trim() }).eq('id', id);
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: newTitle.trim() } : c));
    setEditingTitle(null);
  };

  const selectedEventLabel = events.find(ev => ev.name === eventName)?.name;
  const selectedCampaign = CAMPAIGN_TYPES.find(c => c.value === campaignType);
  const selectedPage = FB_PAGES.find(p => p.id === pageName);
  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="h-full border-r border-border bg-card flex flex-col overflow-hidden"
          >
            {/* Sidebar header */}
            <div className="flex items-center gap-2 p-3 border-b border-border">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigate('/interno')}
                title="Voltar"
              >
                <ArrowLeft size={16} />
              </Button>
              <span className="text-sm font-semibold text-foreground flex-1">TráfegoGPT</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={newConversation}
                title="Nova conversa"
              >
                <Plus size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSidebarOpen(false)}
                title="Fechar sidebar"
              >
                <PanelLeftClose size={16} />
              </Button>
            </div>

            {/* Conversations list */}
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
              {conversations.length === 0 && (
                <p className="text-xs text-muted-foreground text-center mt-8 px-4">
                  Suas conversas aparecerão aqui
                </p>
              )}
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-1.5 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors ${
                    activeConversationId === conv.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  }`}
                  onClick={() => loadConversation(conv)}
                >
                  <MessageSquare size={14} className="flex-shrink-0 opacity-60" />
                  {editingTitle === conv.id ? (
                    <input
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onBlur={() => renameConversation(conv.id, editTitleValue)}
                      onKeyDown={(e) => { if (e.key === 'Enter') renameConversation(conv.id, editTitleValue); }}
                      className="flex-1 bg-transparent border-b border-foreground/30 outline-none text-sm"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 truncate">{conv.title}</span>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-36 p-1" align="start" side="right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTitle(conv.id);
                          setEditTitleValue(conv.title);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent"
                      >
                        Renomear
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-destructive/10 text-destructive"
                      >
                        Excluir
                      </button>
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(true)}>
              <PanelLeft size={16} />
            </Button>
          )}
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={newConversation} title="Nova conversa">
              <Plus size={16} />
            </Button>
          )}
          <div className="flex-1" />
          <span className="text-sm font-medium text-foreground">TráfegoGPT</span>
          <div className="flex-1" />
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {!hasMessages ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="flex flex-col items-center justify-center h-full px-4"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                  className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-6"
                >
                  <Sparkles size={24} className="text-white" />
                </motion.div>
                <motion.h1
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="text-2xl sm:text-3xl font-bold text-foreground mb-10 text-center"
                >
                  Vamos subir qual anúncio hoje?
                </motion.h1>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.4 }}
                  className="flex flex-wrap justify-center gap-2 mb-8 max-w-lg"
                >
                  {QUICK_PROMPTS.map((prompt, i) => (
                    <motion.button
                      key={prompt}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6 + i * 0.08 }}
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => sendMessage(prompt)}
                      className="px-4 py-2.5 rounded-full border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:shadow-md transition-colors"
                    >
                      {prompt}
                    </motion.button>
                  ))}
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="messages"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-3xl mx-auto py-4 px-4 space-y-1"
              >
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                  >
                    {msg.role === 'assistant' && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mt-1"
                      >
                        <Sparkles size={14} className="text-white" />
                      </motion.div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-foreground text-background rounded-br-sm'
                          : 'bg-card border border-border text-foreground rounded-bl-sm'
                      }`}
                    >
                      {msg.role === 'user' && getImageUrls(msg).length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {getImageUrls(msg).map((url, idx) => (
                            <img key={idx} src={url} alt="Criativo" className="max-w-[200px] max-h-[150px] rounded-lg object-cover" />
                          ))}
                        </div>
                      )}
                      {msg.role === 'assistant' ? (() => {
                        const text = getDisplayContent(msg);
                        const isLastMsg = i === messages.length - 1;
                        const showConfirmation = !isLoading && isLastMsg && isConfirmationMessage(text);
                        const parsed = !isLoading || !isLastMsg ? parseOptionsFromText(text) : null;

                        if (showConfirmation) {
                          // Remove "(Sim/Não)" from displayed text
                          const cleanText = text.replace(/\(?\s*Sim\s*\/?\s*Não\s*\)?/gi, '').trim();
                          return (
                            <div>
                              <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 mb-4">
                                <ReactMarkdown>{cleanText}</ReactMarkdown>
                              </div>
                              <div className="flex gap-3">
                                <motion.button
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.92 }}
                                  onClick={() => sendMessage('Sim')}
                                  disabled={isLoading}
                                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 transition-colors disabled:opacity-50"
                                >
                                  <Check size={18} strokeWidth={3} />
                                  Sim, criar!
                                </motion.button>
                                <motion.button
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.92 }}
                                  onClick={() => sendMessage('Não')}
                                  disabled={isLoading}
                                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm shadow-lg shadow-red-500/25 transition-colors disabled:opacity-50"
                                >
                                  <XCircle size={18} strokeWidth={2.5} />
                                  Não
                                </motion.button>
                              </div>
                            </div>
                          );
                        }

                        if (parsed && parsed.options.length >= 2 && shouldRenderChoiceButtons(text)) {
                          const showCustomHint = shouldShowCustomOption(parsed.options);
                          return (
                            <div>
                              {parsed.textBefore && (
                                <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 mb-3">
                                  <ReactMarkdown>{parsed.textBefore}</ReactMarkdown>
                                </div>
                              )}
                              <div className="my-3 space-y-2">
                                {parsed.options.map((opt, oi) => (
                                  <motion.button
                                    key={oi}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: oi * 0.05 }}
                                    whileHover={{ scale: 1.01, x: 2 }}
                                    whileTap={{ scale: 0.96 }}
                                    onClick={() => sendMessage(opt.full)}
                                    disabled={isLoading}
                                    className="w-full text-left px-4 py-3 rounded-2xl border border-border bg-background text-sm text-foreground hover:border-primary/60 hover:bg-accent transition-all shadow-sm disabled:opacity-50"
                                  >
                                    <span className="flex items-center gap-2.5">
                                      {opt.emoji && <span>{opt.emoji}</span>}
                                      <span className="font-medium">{opt.label}</span>
                                    </span>
                                  </motion.button>
                                ))}
                              </div>
                              {showCustomHint && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Se nenhuma opção servir, digite sua resposta no campo abaixo.
                                </p>
                              )}
                              {parsed.textAfter && (
                                <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 mt-3">
                                  <ReactMarkdown>{parsed.textAfter}</ReactMarkdown>
                                </div>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                            <ReactMarkdown>{text}</ReactMarkdown>
                          </div>
                        );
                      })() : (
                        <span className="whitespace-pre-wrap">{getDisplayContent(msg)}</span>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground flex items-center justify-center mt-1"
                      >
                        <User size={14} className="text-background" />
                      </motion.div>
                    )}
                  </motion.div>
                ))}
                {/* Progress bar for active jobs - NOT a chat bubble */}
                {activeJob && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-md mx-auto my-4"
                  >
                    <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-5 shadow-lg">
                      <div className="flex items-center gap-3 mb-3">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                          className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent"
                        />
                        <span className="text-sm font-medium text-foreground">
                          {activeJob.label}
                        </span>
                      </div>
                      <div className="relative w-full h-2.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-purple-500 rounded-full"
                          initial={{ width: '0%' }}
                          animate={{ width: `${activeJob.progress}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 text-right">
                        {activeJob.progress}%
                      </p>
                    </div>
                  </motion.div>
                )}
                {/* Normal loading indicator (only when no active job) */}
                {isLoading && !activeJob && (messages[messages.length - 1]?.role !== 'assistant' || loadingPhase) && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Sparkles size={14} className="text-white" />
                    </div>
                    {loadingPhase ? (
                      <motion.div
                        key={loadingPhase}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3"
                      >
                        <span className="text-sm text-muted-foreground italic">{loadingPhase}</span>
                      </motion.div>
                    ) : (
                      <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                        <div className="flex gap-1.5">
                          {[0, 1, 2].map(j => (
                            <motion.div
                              key={j}
                              className="w-2 h-2 rounded-full bg-primary"
                              animate={{ y: [0, -6, 0] }}
                              transition={{ duration: 0.6, repeat: Infinity, delay: j * 0.15 }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Attached images preview */}
        <AnimatePresence>
          {attachedImages.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-border bg-card"
            >
              <div className="px-3 py-2 max-w-3xl mx-auto flex gap-2 flex-wrap">
                {attachedImages.map((img, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="relative group"
                  >
                    {img.file.type.startsWith('video/') ? (
                      <div className="w-16 h-16 rounded-lg border border-border bg-muted flex items-center justify-center">
                        <Video size={20} className="text-muted-foreground" />
                      </div>
                    ) : (
                      <img src={img.preview} alt="" className="w-16 h-16 rounded-lg object-cover border border-border" />
                    )}
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input area */}
        <div className="border-t border-border bg-card p-3">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-border bg-muted/50 overflow-hidden focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre campanhas, criativos, relatórios..."
                className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm text-foreground placeholder:text-muted-foreground outline-none min-h-[44px] max-h-[120px]"
                rows={1}
                disabled={isLoading}
              />

              {/* Bottom toolbar */}
              <div className="flex items-center gap-1 px-2 pb-2">
                {/* Clip menu */}
                <Popover open={showMediaMenu} onOpenChange={setShowMediaMenu}>
                  <PopoverTrigger asChild>
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                      <Paperclip size={16} />
                    </motion.button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1.5" align="start" side="top">
                    <button
                      onClick={() => { setFileAccept('image/*'); setShowMediaMenu(false); setTimeout(() => fileInputRef.current?.click(), 100); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors"
                    >
                      <ImageIcon size={16} className="text-blue-500" /> <span>Foto ou Imagem</span>
                    </button>
                    <button
                      onClick={() => { setFileAccept('video/*'); setShowMediaMenu(false); setTimeout(() => fileInputRef.current?.click(), 100); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors"
                    >
                      <Video size={16} className="text-pink-500" /> <span>Vídeo</span>
                    </button>
                  </PopoverContent>
                </Popover>

                <div className="h-5 w-px bg-border mx-0.5" />

                {/* Event selector */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                      <Sparkles size={12} className="text-primary" />
                      {selectedEventLabel ? (
                        <span className="max-w-[100px] truncate text-primary">{selectedEventLabel}</span>
                      ) : (
                        <span>Evento</span>
                      )}
                      <ChevronDown size={10} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start" side="top">
                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Selecione o evento</div>
                    <button
                      onClick={() => setEventName('')}
                      className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${!eventName ? 'text-primary font-medium' : 'text-foreground'}`}
                    >
                      Nenhum (geral)
                    </button>
                    {events.map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => setEventName(ev.name)}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${eventName === ev.name ? 'text-primary font-medium' : 'text-foreground'}`}
                      >
                        {ev.name}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                <div className="h-5 w-px bg-border mx-0.5" />

                {/* Campaign type */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                      {selectedCampaign ? (
                        <span className="text-primary">{selectedCampaign.emoji} {selectedCampaign.label}</span>
                      ) : (
                        <span>Campanha</span>
                      )}
                      <ChevronDown size={10} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="start" side="top">
                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Tipo de campanha</div>
                    <button
                      onClick={() => setCampaignType('')}
                      className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${!campaignType ? 'text-primary font-medium' : 'text-foreground'}`}
                    >
                      Nenhum
                    </button>
                    {CAMPAIGN_TYPES.map((ct) => (
                      <button
                        key={ct.value}
                        onClick={() => setCampaignType(ct.value)}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${campaignType === ct.value ? 'text-primary font-medium' : 'text-foreground'}`}
                      >
                        {ct.emoji} {ct.label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                <div className="h-5 w-px bg-border mx-0.5" />

                {/* Facebook Page selector */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                      {selectedPage ? (
                        <span className="text-primary">{selectedPage.emoji} {selectedPage.name}</span>
                      ) : (
                        <span>📄 Página</span>
                      )}
                      <ChevronDown size={10} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2 max-h-[280px] overflow-y-auto" align="start" side="top">
                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Página do Facebook</div>
                    <button
                      onClick={() => setPageName('')}
                      className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${!pageName ? 'text-primary font-medium' : 'text-foreground'}`}
                    >
                      Nenhuma
                    </button>
                    {FB_PAGES.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => setPageName(page.id)}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${pageName === page.id ? 'text-primary font-medium' : 'text-foreground'}`}
                      >
                        {page.emoji} {page.name}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                {/* Right side */}
                <div className="ml-auto flex items-center gap-1">
                  {hasMessages && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => { newConversation(); }}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Limpar conversa"
                    >
                      <Trash2 size={14} />
                    </motion.button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => sendMessage(input)}
                    disabled={(!input.trim() && attachedImages.length === 0) || isLoading}
                    className="p-2 rounded-lg bg-foreground text-background disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80 transition-all"
                  >
                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept={fileAccept} multiple className="hidden" onChange={handleFileSelect} />
      </div>
    </div>
  );
}
