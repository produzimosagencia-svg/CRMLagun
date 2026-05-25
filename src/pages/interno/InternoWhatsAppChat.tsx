import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, ArrowLeft, Send, Clock, Check, CheckCheck, Bot, UserRound, DollarSign, Loader2, UserCircle, MapPin, Phone, ShoppingCart, AlertTriangle, Power, Smartphone, BrainCircuit, Plus, Trash2, Calendar, MapPinned, Music, ShieldAlert, FileText, Link as LinkIcon, Pencil, Instagram, RefreshCw, ChevronDown, Armchair } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatPhone } from '@/lib/formatPhone';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface Message {
  id: string;
  phone: string;
  contact_name: string | null;
  direction: string;
  message_type: string;
  message_text: string | null;
  media_url: string | null;
  timestamp: string;
  status: string | null;
  wamid: string | null;
  channel?: string;
}

interface Conversation {
  phone: string;
  contact_name: string | null;
  last_message: string | null;
  last_timestamp: string;
  unread_count: number;
  needs_support: boolean;
  last_direction: string;
  last_status: string | null;
}

interface EventBreakdown {
  event_name: string;
  total: number;
}

interface AbandonedCart {
  event_name: string;
  timestamp: string;
  amount: number;
}

interface CustomerProfile {
  full_name: string;
  phone: string | null;
  city: string | null;
  neighborhood: string | null;
  ltv: number | null;
  events: EventBreakdown[];
  abandonedCarts: AbandonedCart[];
  found: boolean;
}

interface EventKnowledge {
  id: string;
  event_name: string;
  event_date: string | null;
  event_location: string | null;
  attractions: string | null;
  age_rating: string | null;
  observations: string | null;
  ticket_link: string | null;
}

interface ApiPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
}

interface OpenEvent {
  id: string;
  nome: string;
  tag: string | null;
}

const LOUNGE_NAMES = ['Lounge 1', 'Lounge 2', 'Lounge 3', 'Lounge 4', 'Lounge 5', 'Lounge 6'];

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const AGE_RATING_OPTIONS = [
  'Só 18 anos',
  '18 anos. 16 e 17 anos podem ir com acompanhamento do responsável',
  'Aberto ao público',
];

const StatusIcon = ({ status }: { status: string | null }) => {
  switch (status) {
    case 'sent': return <Check className="w-3.5 h-3.5 text-muted-foreground" />;
    case 'delivered': return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" />;
    case 'read': return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
    default: return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const formatTimestamp = (ts: string) => {
  const date = new Date(ts);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Ontem ' + format(date, 'HH:mm');
  return format(date, "dd/MM HH:mm", { locale: ptBR });
};

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-9);
}

export default function InternoWhatsAppChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [botEnabled, setBotEnabled] = useState<Record<string, boolean>>({});
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [globalAiEnabled, setGlobalAiEnabled] = useState(true);
  const [togglingGlobal, setTogglingGlobal] = useState(false);
  const [selectedApiPhone, setSelectedApiPhone] = useState('');
  const [apiPhones, setApiPhones] = useState<ApiPhoneNumber[]>([]);
  const [loadingApiPhones, setLoadingApiPhones] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [eventKnowledge, setEventKnowledge] = useState<EventKnowledge[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({ event_name: '', event_date: '', event_location: '', attractions: '', age_rating: '', observations: '', ticket_link: '' });
  const [savingEvent, setSavingEvent] = useState(false);

  // Channel tabs
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'instagram'>('whatsapp');
  const [syncingInstagram, setSyncingInstagram] = useState(false);
  const [igAccounts, setIgAccounts] = useState<{ id: string; username: string; profile_picture_url?: string; name?: string }[]>([]);
  const [selectedIgAccount, setSelectedIgAccount] = useState<{ id: string; username: string; profile_picture_url?: string; name?: string } | null>(null);

  // Lounges
  const [openEvents, setOpenEvents] = useState<OpenEvent[]>([]);
  const [loungesData, setLoungesData] = useState<Record<string, number[]>>({}); // event_id -> sold lounge numbers
  const [loadingLounges, setLoadingLounges] = useState(false);
  const [togglingLounge, setTogglingLounge] = useState<string | null>(null); // `${eventId}-${loungeNum}`

  // Load API phone numbers
  const loadApiPhones = async () => {
    setLoadingApiPhones(true);
    try {
      const base = `https://${PROJECT_ID}.supabase.co/functions/v1/whatsapp-api`;
      const resp = await fetch(`${base}?action=phone_numbers`, {
        headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
      });
      const result = await resp.json();
      if (result.data && Array.isArray(result.data)) {
        setApiPhones(result.data.map((p: any) => ({
          id: p.id,
          display_phone_number: p.display_phone_number,
          verified_name: p.verified_name || '',
        })));
        // Default to the DDD 11 phone
        if (!selectedApiPhone && result.data.length > 0) {
          const preferred = result.data.find((p: any) => p.display_phone_number?.includes('96591-8862'));
          setSelectedApiPhone(preferred?.id || result.data[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading API phones:', err);
    }
    setLoadingApiPhones(false);
  };

  // Load lounges data
  const loadLounges = async () => {
    setLoadingLounges(true);
    const { data: events } = await supabase
      .from('lagun_events')
      .select('id, nome, tag')
      .eq('show_on_landing', true)
      .order('display_order', { ascending: true });
    if (events) setOpenEvents(events as OpenEvent[]);

    const { data: lounges } = await supabase
      .from('event_lounges')
      .select('event_id, lounge_number, is_sold');
    if (lounges) {
      const map: Record<string, number[]> = {};
      lounges.forEach((l: any) => {
        if (l.is_sold) {
          if (!map[l.event_id]) map[l.event_id] = [];
          map[l.event_id].push(l.lounge_number);
        }
      });
      setLoungesData(map);
    }
    setLoadingLounges(false);
  };

  const toggleLounge = async (eventId: string, loungeNum: number) => {
    const key = `${eventId}-${loungeNum}`;
    setTogglingLounge(key);
    const currentSold = loungesData[eventId] || [];
    const isSold = currentSold.includes(loungeNum);
    const newSold = isSold ? currentSold.filter(n => n !== loungeNum) : [...currentSold, loungeNum];
    setLoungesData(prev => ({ ...prev, [eventId]: newSold }));

    const { error } = await supabase
      .from('event_lounges')
      .upsert({ event_id: eventId, lounge_number: loungeNum, is_sold: !isSold }, { onConflict: 'event_id,lounge_number' });

    if (error) {
      toast.error('Erro ao atualizar lounge');
      setLoungesData(prev => ({ ...prev, [eventId]: currentSold }));
    }
    setTogglingLounge(null);
  };

  // Load Instagram accounts
  const loadIgAccounts = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || ANON_KEY;
      const base = `https://${PROJECT_ID}.supabase.co/functions/v1/instagram-api`;
      const resp = await fetch(`${base}?action=accounts`, {
        headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
      });
      const data = await resp.json();
      const accounts: { id: string; username: string; profile_picture_url?: string; name?: string }[] = [];
      if (data.data) {
        for (const page of data.data) {
          if (page.instagram_business_account) {
            accounts.push({
              id: page.instagram_business_account.id,
              username: page.instagram_business_account.username || page.name,
              profile_picture_url: page.instagram_business_account.profile_picture_url,
              name: page.instagram_business_account.name || page.name,
            });
          }
        }
      }
      setIgAccounts(accounts);
      const lagunvixFallback = { id: '17841436376156784', username: 'lagunvix', name: 'Lagun' };
      if (accounts.length > 0 && !selectedIgAccount) {
        const preferred = accounts.find(a => a.username === 'lagunvix') || accounts.find(a => a.username === 'triade.ent') || accounts[0];
        setSelectedIgAccount(preferred);
      } else if (accounts.length === 0 && !selectedIgAccount) {
        // Fallback: lagunvix sempre disponível mesmo se a API não retornar contas
        setSelectedIgAccount(lagunvixFallback);
      }
    } catch (err) {
      console.error('Error loading IG accounts:', err);
    }
  };

  // Sync Instagram DMs into local DB
  const syncInstagramDMs = async () => {
    if (!selectedIgAccount) {
      toast.error('Nenhuma conta Instagram encontrada');
      return;
    }
    setSyncingInstagram(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || ANON_KEY;
      const base = `https://${PROJECT_ID}.supabase.co/functions/v1/instagram-api`;
      const resp = await fetch(`${base}?action=dm_sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ig_id: selectedIgAccount.id, ig_username: selectedIgAccount.username }),
      });
      const result = await resp.json();
      if (result.error) {
        toast.error(typeof result.error === 'object' ? result.error.message : result.error);
      } else {
        toast.success(`${result.synced} novas mensagens sincronizadas`);
        // Reload conversations
        loadConversationsForChannel('instagram');
      }
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Erro ao sincronizar DMs');
    }
    setSyncingInstagram(false);
  };

  const loadConversationsForChannel = async (channel: string) => {
    setLoading(true);
    // For whatsapp: include messages with channel='whatsapp' OR channel=null (legacy Meta API messages)
    const query = supabase.from('whatsapp_messages').select('*').order('timestamp', { ascending: false }).limit(1000);
    const { data, error } = channel === 'whatsapp'
      ? await query.or('channel.eq.whatsapp,channel.is.null')
      : await query.eq('channel', channel);

    if (error) { console.error('Error loading messages:', error); setLoading(false); return; }

    const convMap = new Map<string, Conversation>();
    for (const msg of (data || [])) {
      const existing = convMap.get(msg.phone);
      const needsSupport = msg.status === 'need_support';
      if (!existing) {
        convMap.set(msg.phone, {
          phone: msg.phone, contact_name: msg.contact_name,
          last_message: msg.message_text, last_timestamp: msg.timestamp,
          unread_count: msg.direction === 'incoming' ? 1 : 0,
          needs_support: needsSupport,
          last_direction: msg.direction,
          last_status: msg.status,
        });
      } else {
        if (msg.direction === 'incoming') existing.unread_count++;
        if (!existing.contact_name && msg.contact_name) existing.contact_name = msg.contact_name;
        if (needsSupport) existing.needs_support = true;
      }
    }

    setConversations(
      Array.from(convMap.values()).sort((a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime())
    );
    setLoading(false);
  };

  // Load IG accounts on mount  
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        loadIgAccounts();
      }
    };
    init();
  }, []);

  // Load conversations when channel changes
  useEffect(() => {
    loadConversationsForChannel(activeChannel);
    setSelectedPhone(null);
  }, [activeChannel]);

  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' }, (payload) => {
        const newMsg = payload.new as Message & { channel?: string };
        const msgChannel = newMsg.channel || 'whatsapp';
        
        // Only add to conversation list if it matches the active channel
        if (msgChannel === activeChannel) {
          const needsSupport = newMsg.status === 'need_support';
          setConversations(prev => {
            const existing = prev.find(c => c.phone === newMsg.phone);
            if (existing) {
              return prev.map(c => c.phone === newMsg.phone ? {
                ...c, last_message: newMsg.message_text, last_timestamp: newMsg.timestamp,
                unread_count: newMsg.direction === 'incoming' ? c.unread_count + 1 : c.unread_count,
                contact_name: c.contact_name || newMsg.contact_name,
                needs_support: needsSupport ? true : c.needs_support,
                last_direction: newMsg.direction,
                last_status: newMsg.status,
              } : c).sort((a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime());
            }
            return [{ phone: newMsg.phone, contact_name: newMsg.contact_name, last_message: newMsg.message_text, last_timestamp: newMsg.timestamp, unread_count: newMsg.direction === 'incoming' ? 1 : 0, needs_support: needsSupport, last_direction: newMsg.direction, last_status: newMsg.status }, ...prev];
          });
        }
        
        if (newMsg.phone === selectedPhone) {
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id || (m.wamid && m.wamid === newMsg.wamid))) return prev;
            return [...prev, newMsg];
          });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_messages' }, (payload) => {
        const updated = payload.new as Message;
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, status: updated.status } : m));
        setConversations(prev => prev.map(c => {
          if (c.phone === updated.phone) {
            return { ...c, last_status: updated.status };
          }
          return c;
        }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedPhone, activeChannel]);

  useEffect(() => {
    const loadBotSettings = async () => {
      const { data } = await supabase.from('whatsapp_bot_settings').select('phone, bot_enabled');
      if (data) {
        const map: Record<string, boolean> = {};
        let allEnabled = true;
        data.forEach((s: { phone: string; bot_enabled: boolean }) => {
          map[s.phone] = s.bot_enabled;
          if (!s.bot_enabled) allEnabled = false;
        });
        setBotEnabled(map);
        if (data.length > 0) setGlobalAiEnabled(allEnabled);
      }
    };
    loadBotSettings();
  }, []);

  useEffect(() => {
    if (!selectedPhone) { setProfile(null); return; }

    // Clear needs_support when opening conversation
    setConversations(prev => prev.map(c => c.phone === selectedPhone ? { ...c, needs_support: false } : c));

    const loadMessages = async () => {
      const msgQuery = supabase.from('whatsapp_messages').select('*')
        .eq('phone', selectedPhone)
        .order('timestamp', { ascending: true }).limit(200);
      const { data } = activeChannel === 'whatsapp'
        ? await msgQuery.or('channel.eq.whatsapp,channel.is.null')
        : await msgQuery.eq('channel', activeChannel);
      // Filter out system messages
      setMessages(((data || []) as Message[]).filter(m => m.message_type !== 'system'));
    };

    const loadProfile = async () => {
      setProfileLoading(true);
      setProfile(null);

      const needle = normalizePhone(selectedPhone);

      const { data: customers } = await supabase
        .from('crm_customers')
        .select('id, full_name, phone, ltv, city, neighborhood');

      const match = (customers || []).find(c => {
        if (!c.phone) return false;
        return normalizePhone(c.phone) === needle;
      });

      if (match) {
        const { data: purchases } = await supabase
          .from('crm_purchases')
          .select('event_name, total_value')
          .eq('customer_id', match.id);

        const eventMap = new Map<string, number>();
        (purchases || []).forEach(p => {
          eventMap.set(p.event_name, (eventMap.get(p.event_name) || 0) + (p.total_value || 0));
        });
        const eventBreakdown: EventBreakdown[] = Array.from(eventMap.entries()).map(([event_name, total]) => ({ event_name, total }));

        const { data: webhookLogs } = await supabase
          .from('webhook_logs')
          .select('payload, received_at')
          .eq('source', 'blueticket')
          .limit(1000);

        const abandonedCarts: AbandonedCart[] = [];
        const phoneNeedle = selectedPhone.replace(/\D/g, '').slice(-9);

        (webhookLogs || []).forEach(log => {
          const p = log.payload as any;
          if (p?.payload?.type === 'abandoned_cart') {
            const custPhone = (p?.payload?.customer?.phone || '').replace(/\D/g, '');
            if (custPhone.slice(-9) === phoneNeedle) {
              abandonedCarts.push({
                event_name: p?.payload?.event?.name || 'Evento desconhecido',
                timestamp: p?.timestamp || log.received_at,
                amount: p?.payload?.order?.amount || 0,
              });
            }
          }
        });

        setProfile({
          full_name: match.full_name, phone: match.phone, ltv: match.ltv,
          city: match.city, neighborhood: match.neighborhood,
          events: eventBreakdown, abandonedCarts, found: true,
        });
      } else {
        const conv = conversations.find(c => c.phone === selectedPhone);
        const contactName = conv?.contact_name || formatPhone(selectedPhone);

        const { data: newCustomer } = await supabase
          .from('crm_customers')
          .insert({ full_name: contactName, phone: selectedPhone })
          .select('id, full_name, phone, ltv, city, neighborhood')
          .single();

        if (newCustomer) {
          const { data: webhookLogs2 } = await supabase
            .from('webhook_logs')
            .select('payload, received_at')
            .eq('source', 'blueticket')
            .limit(1000);

          const abandonedCarts2: AbandonedCart[] = [];
          const pDigits = selectedPhone.replace(/\D/g, '').slice(-9);
          (webhookLogs2 || []).forEach(log => {
            const p = log.payload as any;
            if (p?.payload?.type === 'abandoned_cart') {
              const custPhone = (p?.payload?.customer?.phone || '').replace(/\D/g, '');
              if (custPhone.slice(-9) === pDigits) {
                abandonedCarts2.push({
                  event_name: p?.payload?.event?.name || 'Evento desconhecido',
                  timestamp: p?.timestamp || log.received_at,
                  amount: p?.payload?.order?.amount || 0,
                });
              }
            }
          });

          setProfile({
            full_name: newCustomer.full_name, phone: newCustomer.phone, ltv: newCustomer.ltv,
            city: newCustomer.city, neighborhood: newCustomer.neighborhood,
            events: [], abandonedCarts: abandonedCarts2, found: true,
          });
        } else {
          setProfile({
            full_name: contactName, phone: selectedPhone, ltv: 0,
            city: null, neighborhood: null, events: [], abandonedCarts: [], found: true,
          });
        }
      }
      setProfileLoading(false);
    };

    loadMessages();
    loadProfile();
  }, [selectedPhone]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const toggleBot = async (phone: string) => {
    const current = botEnabled[phone] !== false;
    const newVal = !current;
    setBotEnabled(prev => ({ ...prev, [phone]: newVal }));
    await supabase.from('whatsapp_bot_settings')
      .upsert({ phone, bot_enabled: newVal, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
  };

  const toggleGlobalAi = async () => {
    setTogglingGlobal(true);
    const newVal = !globalAiEnabled;
    setGlobalAiEnabled(newVal);

    const phones = conversations.map(c => c.phone);
    const newMap: Record<string, boolean> = {};

    for (const phone of phones) {
      newMap[phone] = newVal;
      await supabase.from('whatsapp_bot_settings')
        .upsert({ phone, bot_enabled: newVal, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
    }

    setBotEnabled(prev => ({ ...prev, ...newMap }));
    toast.success(newVal ? 'IA ativada em todas as conversas' : 'IA desativada em todas as conversas');
    setTogglingGlobal(false);
  };

  const loadKnowledge = async () => {
    setKnowledgeLoading(true);
    const { data } = await supabase
      .from('chatbot_event_knowledge')
      .select('*')
      .order('event_date', { ascending: true });
    setEventKnowledge((data || []) as EventKnowledge[]);
    setKnowledgeLoading(false);
  };

  const openKnowledge = () => {
    setKnowledgeOpen(true);
    loadKnowledge();
  };

  const handleSaveEvent = async () => {
    if (!newEvent.event_name.trim()) { toast.error('Nome do evento é obrigatório'); return; }
    setSavingEvent(true);
    const payload = {
      event_name: newEvent.event_name,
      event_date: newEvent.event_date || null,
      event_location: newEvent.event_location || null,
      attractions: newEvent.attractions || null,
      age_rating: newEvent.age_rating || null,
      observations: newEvent.observations || null,
      ticket_link: newEvent.ticket_link || null,
    };
    const { error } = editingEventId
      ? await supabase.from('chatbot_event_knowledge').update(payload).eq('id', editingEventId)
      : await supabase.from('chatbot_event_knowledge').insert(payload);
    if (error) { toast.error('Erro ao salvar evento'); console.error(error); }
    else {
      toast.success(editingEventId ? 'Evento atualizado' : 'Evento adicionado à memória da IA');
      setNewEvent({ event_name: '', event_date: '', event_location: '', attractions: '', age_rating: '', observations: '', ticket_link: '' });
      setEditingEventId(null);
      setAddEventOpen(false);
      loadKnowledge();
    }
    setSavingEvent(false);
  };

  const handleEditEvent = (ev: EventKnowledge) => {
    setEditingEventId(ev.id);
    setNewEvent({
      event_name: ev.event_name,
      event_date: ev.event_date || '',
      event_location: ev.event_location || '',
      attractions: ev.attractions || '',
      age_rating: ev.age_rating || '',
      observations: ev.observations || '',
      ticket_link: ev.ticket_link || '',
    });
    setAddEventOpen(true);
  };

  const handleDeleteEvent = async (id: string) => {
    const { error } = await supabase.from('chatbot_event_knowledge').delete().eq('id', id);
    if (error) { toast.error('Erro ao remover evento'); console.error(error); }
    else { toast.success('Evento removido'); loadKnowledge(); }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedPhone || sending) return;

    // Instagram DM send
    if (activeChannel === 'instagram') {
      // Always fallback to lagunvix if no account selected
      const igAccount = selectedIgAccount ?? { id: '17841436376156784', username: 'lagunvix' };
      setSending(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || ANON_KEY;
        const base = `https://${PROJECT_ID}.supabase.co/functions/v1/instagram-api`;
        const sentAt = new Date().toISOString();
        const contactName = conversations.find(c => c.phone === selectedPhone)?.contact_name || null;
        const resp = await fetch(`${base}?action=dm_send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ig_id: igAccount.id,
            recipient_id: selectedPhone,
            message: replyText,
            contact_name: contactName,
          }),
        });
        const result = await resp.json();
        if (result.error) {
          toast.error(typeof result.error === 'object' ? result.error.message : String(result.error));
        } else {
          const optimisticMsg: Message = {
            id: crypto.randomUUID(), phone: selectedPhone, contact_name: null,
            direction: 'outgoing', message_type: 'text', message_text: replyText,
            media_url: null, timestamp: sentAt, status: 'sent', wamid: result.message_id || null,
          };
          setMessages(prev => [...prev, optimisticMsg]);
          setReplyText('');
        }
      } catch (err) { console.error('IG send error:', err); toast.error('Erro ao enviar DM'); }
      finally { setSending(false); }
      return;
    }

    // ── WhatsApp via Meta API oficial ──────────────────────────────────
    setSending(true);
    try {
      const base = `https://${PROJECT_ID}.supabase.co/functions/v1/whatsapp-api`;
      const sentAt = new Date().toISOString();
      const contactName = conversations.find(c => c.phone === selectedPhone)?.contact_name || null;
      const resp = await fetch(`${base}?action=send_text`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedPhone, text: replyText,
          phone_number_id: selectedApiPhone || undefined, contact_name: contactName,
        }),
      });
      const result = await resp.json();
      if (result.error) {
        console.error('Send error:', result.error);
        toast.error(typeof result.error === 'string' ? result.error : 'Não foi possível enviar a mensagem');
      } else {
        const wamid = result.messages?.[0]?.id || null;
        const optimisticMsg: Message = {
          id: crypto.randomUUID(), phone: selectedPhone, contact_name: contactName,
          direction: 'outgoing', message_type: 'text', message_text: replyText,
          media_url: null, timestamp: sentAt, status: 'sent', wamid,
        };
        setMessages(prev => [...prev, optimisticMsg]);
        setConversations(prev => {
          const updated = prev.some(c => c.phone === selectedPhone)
            ? prev.map(c => c.phone === selectedPhone ? {
                ...c, contact_name: c.contact_name || contactName,
                last_message: replyText, last_timestamp: sentAt,
                last_direction: 'outgoing', last_status: 'sent',
              } : c)
            : [{ phone: selectedPhone, contact_name: contactName, last_message: replyText,
                 last_timestamp: sentAt, unread_count: 0, needs_support: false,
                 last_direction: 'outgoing', last_status: 'sent' }, ...prev];
          return updated.sort((a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime());
        });
        setReplyText('');
        if (result.persisted === false) toast.error('Mensagem enviada mas não salva no histórico.');
        if (botEnabled[selectedPhone] !== false) {
          setBotEnabled(prev => ({ ...prev, [selectedPhone]: false }));
          await supabase.from('whatsapp_bot_settings')
            .upsert({ phone: selectedPhone, bot_enabled: false, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
        }
      }
    } catch (err) { console.error('Send error:', err); }
    finally { setSending(false); }
  };

  const selectedConv = conversations.find(c => c.phone === selectedPhone);
  const latestIncomingMessage = [...messages].reverse().find((message) => message.direction === 'incoming');
  const is24hWindowOpen = latestIncomingMessage
    ? Date.now() - new Date(latestIncomingMessage.timestamp).getTime() <= WHATSAPP_WINDOW_MS
    : false;

  return (
    <div className="flex h-[calc(100vh-120px)] bg-background rounded-xl border overflow-hidden">
      <div className={`w-full md:w-80 border-r flex flex-col shrink-0 ${selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        <div className="border-b">
          <div className="flex">
            <button
              onClick={() => setActiveChannel('whatsapp')}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                activeChannel === 'whatsapp'
                  ? 'border-[#25D366] text-[#25D366]'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </div>
            </button>
            <button
              onClick={() => setActiveChannel('instagram')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeChannel === 'instagram'
                  ? 'border-[#E4405F] text-[#E4405F]'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Instagram className="w-4 h-4" />
              Instagram
            </button>
          </div>
          {activeChannel === 'instagram' && selectedIgAccount && (
            <div className="px-3 py-2 border-b flex items-center gap-2">
              {selectedIgAccount.profile_picture_url ? (
                <img src={selectedIgAccount.profile_picture_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <Instagram className="w-4 h-4 shrink-0 text-[#E4405F]" />
              )}
              <span className="text-xs font-medium text-muted-foreground">@{selectedIgAccount.username}</span>
              <span className="ml-auto text-[10px] text-emerald-500 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Automático
              </span>
            </div>
          )}
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Nenhuma conversa ainda</p>
            </div>
          ) : conversations.map(conv => (
            <button
              key={conv.phone}
              onClick={() => setSelectedPhone(conv.phone)}
              className={`w-full text-left p-4 border-b hover:bg-muted/50 transition-colors ${selectedPhone === conv.phone ? 'bg-muted' : ''}`}
            >
              <div className="flex items-center gap-3">
                {activeChannel === 'instagram' && selectedIgAccount?.profile_picture_url ? (
                  <img src={selectedIgAccount.profile_picture_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${
                    activeChannel === 'instagram' ? 'bg-[#E4405F]/20 text-[#E4405F]' : 'bg-[#25D366]/20 text-[#25D366]'
                  }`}>
                    {(conv.contact_name || conv.phone || '').slice(0, 2).toUpperCase() || (activeChannel === 'instagram' ? <Instagram className="w-5 h-5" /> : 'WA')}
                  </div>
                )}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{activeChannel === 'instagram' ? `@${conv.contact_name || conv.phone}` : (conv.contact_name || formatPhone(conv.phone))}</p>
                      {conv.needs_support && (
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 animate-pulse" title="Precisa de suporte humano" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{formatTimestamp(conv.last_timestamp)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5 pr-2 flex items-center gap-1">
                    {conv.last_direction === 'outgoing' && <StatusIcon status={conv.last_status} />}
                    <span className="truncate">{conv.last_message && conv.last_message.trim() !== '' ? conv.last_message : '📸 Mencionou no story'}</span>
                  </p>
                </div>
              </div>
            </button>
          ))}
        </ScrollArea>

        {activeChannel === 'whatsapp' && (
          <div className="border-t p-2 grid grid-cols-2 gap-1">
            <Button
              variant={globalAiEnabled ? "default" : "outline"}
              size="sm"
              onClick={toggleGlobalAi}
              disabled={togglingGlobal}
              className={`gap-1.5 text-xs ${globalAiEnabled ? 'bg-[#25D366] hover:bg-[#20BD5A] text-white' : ''}`}
              title={globalAiEnabled ? 'IA ativa em todas as conversas' : 'IA desativada globalmente'}
            >
              <Power className="w-3.5 h-3.5 shrink-0" />
              {togglingGlobal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (globalAiEnabled ? 'IA On' : 'IA Off')}
            </Button>

            <Popover onOpenChange={(open) => { if (open) loadApiPhones(); }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  API
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <p className="text-xs font-semibold mb-2">Número da API</p>
                {loadingApiPhones ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : apiPhones.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum número encontrado na API</p>
                ) : (
                  <RadioGroup value={selectedApiPhone} onValueChange={setSelectedApiPhone} className="space-y-2">
                    {apiPhones.map(p => (
                      <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 cursor-pointer">
                        <RadioGroupItem value={p.id} id={`phone-${p.id}`} />
                        <label htmlFor={`phone-${p.id}`} className="flex-1 cursor-pointer">
                          <p className="text-xs font-mono font-medium">{p.display_phone_number}</p>
                          {p.verified_name && <p className="text-[10px] text-muted-foreground">{p.verified_name}</p>}
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="sm"
              onClick={openKnowledge}
              className="gap-1.5 text-xs"
              title="Memória da IA"
            >
              <BrainCircuit className="w-3.5 h-3.5 shrink-0" />
              Memória
            </Button>

            <Popover onOpenChange={(open) => { if (open) loadLounges(); }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Armchair className="w-3.5 h-3.5 shrink-0" />
                  Lounge
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="start" side="top">
                <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <Armchair className="w-3.5 h-3.5" />
                  Lounges por Evento
                </p>
                {loadingLounges ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : openEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhum evento aberto na Landing Page</p>
                ) : (
                  <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                    {openEvents.map(event => {
                      const soldLounges = loungesData[event.id] || [];
                      return (
                        <div key={event.id}>
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 truncate">{event.nome}</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {LOUNGE_NAMES.map((name, idx) => {
                              const num = idx + 1;
                              const sold = soldLounges.includes(num);
                              const loading = togglingLounge === `${event.id}-${num}`;
                              return (
                                <button
                                  key={num}
                                  onClick={() => toggleLounge(event.id, num)}
                                  disabled={!!loading}
                                  className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg text-[11px] font-medium border transition-all ${
                                    sold
                                      ? 'bg-red-50 border-red-300 text-red-600 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400'
                                      : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400'
                                  }`}
                                  title={sold ? 'Vendido — clique para liberar' : 'Disponível — clique para marcar como vendido'}
                                >
                                  {loading
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <Armchair className="w-3.5 h-3.5" />
                                  }
                                  {name}
                                  <span className={`text-[9px] font-bold ${sold ? 'text-red-500' : 'text-emerald-600'}`}>
                                    {sold ? 'Vendido' : 'Livre'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <div className={`flex-1 flex flex-col min-w-0 ${!selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        {!selectedPhone ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-muted-foreground">Selecione uma conversa</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b flex items-center gap-3">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedPhone(null)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              {activeChannel === 'instagram' && selectedIgAccount?.profile_picture_url ? (
                <img src={selectedIgAccount.profile_picture_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                  activeChannel === 'instagram' ? 'bg-[#E4405F]/20 text-[#E4405F]' : 'bg-[#25D366]/20 text-[#25D366]'
                }`}>
                  {(selectedConv?.contact_name || selectedPhone || '').slice(0, 2).toUpperCase() || (activeChannel === 'instagram' ? <Instagram className="w-5 h-5" /> : 'WA')}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{activeChannel === 'instagram' ? `@${selectedConv?.contact_name || selectedPhone}` : (selectedConv?.contact_name || formatPhone(selectedPhone))}</p>
                <p className="text-xs text-muted-foreground truncate">{activeChannel === 'instagram' ? `@${selectedIgAccount?.username || 'Instagram'}` : formatPhone(selectedPhone)}</p>
              </div>
              {activeChannel === 'whatsapp' && (
                <Button
                  variant={botEnabled[selectedPhone] !== false ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleBot(selectedPhone)}
                  className={botEnabled[selectedPhone] !== false
                    ? "bg-[#25D366] hover:bg-[#20BD5A] text-white gap-1.5"
                    : "gap-1.5"
                  }
                >
                  {botEnabled[selectedPhone] !== false ? (
                    <><Bot className="w-4 h-4" /> IA Ativa</>
                  ) : (
                    <><UserRound className="w-4 h-4" /> Humano</>
                  )}
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-2 max-w-2xl mx-auto">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-xl px-3 py-2 ${
                      msg.direction === 'outgoing'
                        ? (activeChannel === 'instagram' ? 'bg-gradient-to-r from-[#833AB4] via-[#E4405F] to-[#FCAF45] text-white rounded-br-sm' : 'bg-[#25D366] text-white rounded-br-sm')
                        : 'bg-muted rounded-bl-sm'
                    }`}>
                      {msg.media_url && (msg.message_type === 'image' || msg.message_type === 'sticker') && (
                        <img
                          src={msg.media_url.startsWith('http') ? msg.media_url : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-api?action=get_media&media_id=${msg.media_url}`}
                          alt="Mídia"
                          className="rounded-lg max-w-full max-h-64 mb-1 cursor-pointer"
                          onClick={() => window.open(msg.media_url!.startsWith('http') ? msg.media_url! : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-api?action=get_media&media_id=${msg.media_url}`, '_blank')}
                          loading="lazy"
                        />
                      )}
                      {msg.media_url && msg.message_type === 'video' && (
                        <video
                          src={msg.media_url.startsWith('http') ? msg.media_url : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-api?action=get_media&media_id=${msg.media_url}`}
                          controls
                          className="rounded-lg max-w-full max-h-64 mb-1"
                        />
                      )}
                      {msg.media_url && msg.message_type === 'audio' && (
                        <audio
                          src={msg.media_url.startsWith('http') ? msg.media_url : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-api?action=get_media&media_id=${msg.media_url}`}
                          controls
                          className="mb-1 max-w-full"
                        />
                      )}
                      {msg.message_text && msg.message_text.trim() !== '' && msg.message_text !== `[${msg.message_type}]` ? (
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.message_text}</p>
                      ) : (
                        <p className="text-sm italic opacity-70">
                          {msg.message_type === 'story_mention' || msg.message_type === 'story_reply'
                            ? '📸 Mencionou no story'
                            : msg.message_type === 'share' || msg.message_type === 'media_share' ? '🔗 Compartilhou um post'
                            : msg.message_type === 'reel' || msg.message_type === 'ig_reel' ? '🎬 Enviou um reel'
                            : msg.message_type === 'clip' ? '🎥 Enviou um clip'
                            : msg.message_type === 'image' ? '📷 Enviou uma foto'
                            : msg.message_type === 'video' ? '🎬 Enviou um vídeo'
                            : msg.message_type === 'audio' ? '🎤 Enviou um áudio'
                            : msg.message_type === 'attachment' ? '📎 Anexo'
                            : (!msg.message_text || msg.message_text.trim() === '') ? '📸 Mencionou no story'
                            : `[${msg.message_type}]`}
                        </p>
                      )}
                      <div className={`flex items-center gap-1 justify-end mt-1 ${msg.direction === 'outgoing' ? 'text-white/70' : 'text-muted-foreground'}`}>
                        <span className="text-[10px]">{formatTimestamp(msg.timestamp)}</span>
                        {msg.direction === 'outgoing' && <StatusIcon status={msg.status} />}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t">
              <div className="flex gap-2 max-w-2xl mx-auto">
                <Input
                  value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendReply()}
                  placeholder={activeChannel === 'instagram' ? 'Enviar mensagem no Instagram...' : 'Digite uma mensagem...'}
                  className="flex-1"
                  disabled={sending}
                />
                <Button
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || sending}
                  className={activeChannel === 'instagram'
                    ? 'bg-gradient-to-r from-[#833AB4] via-[#E4405F] to-[#FCAF45] hover:opacity-90 text-white'
                    : 'bg-[#25D366] hover:bg-[#20BD5A] text-white'
                  }
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedPhone && activeChannel === 'whatsapp' && (
        <div className="hidden lg:flex w-80 border-l flex-col shrink-0">
          <div className="p-4 border-b">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <UserCircle className="w-4 h-4 text-muted-foreground" />
              Perfil do Cliente
            </h3>
          </div>

          <ScrollArea className="flex-1">
            {profileLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : profile?.found ? (
              <div className="p-4 space-y-1">
                <Accordion type="multiple" defaultValue={["dados", "ltv", "registros"]}>
                  <AccordionItem value="dados">
                    <AccordionTrigger className="text-xs font-semibold uppercase text-muted-foreground py-2 hover:no-underline">
                      <span className="flex items-center gap-1.5"><UserCircle className="w-3.5 h-3.5" /> Dados Pessoais</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2.5">
                        <div className="flex flex-col items-center text-center mb-3">
                          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg mb-1.5">
                            {profile.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <p className="font-semibold text-sm">{profile.full_name}</p>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-mono">{formatPhone(selectedPhone)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>
                              {(profile.city || profile.neighborhood)
                                ? [profile.neighborhood, profile.city].filter(Boolean).join(', ')
                                : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="ltv">
                    <AccordionTrigger className="text-xs font-semibold uppercase text-muted-foreground py-2 hover:no-underline">
                      <span className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> LTV</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        <div className="bg-muted/50 rounded-xl p-3">
                          <p className="text-xs text-muted-foreground mb-0.5">Total</p>
                          <p className="text-xl font-bold">
                            {(profile.ltv ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </div>
                        {profile.events.length > 0 ? (
                          <div className="space-y-1.5">
                            {profile.events.map(ev => (
                              <div key={ev.event_name} className="flex items-center justify-between bg-muted px-3 py-2 rounded-lg">
                                <span className="text-xs truncate mr-2">{ev.event_name}</span>
                                <span className="text-xs font-semibold whitespace-nowrap">
                                  {ev.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground/60">Nenhum evento registrado</p>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="registros">
                    <AccordionTrigger className="text-xs font-semibold uppercase text-muted-foreground py-2 hover:no-underline">
                      <span className="flex items-center gap-1.5">
                        <ShoppingCart className="w-3.5 h-3.5" /> Registros
                        {profile.abandonedCarts.length > 0 && (
                          <span className="ml-1 bg-destructive/10 text-destructive text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {profile.abandonedCarts.length}
                          </span>
                        )}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {profile.abandonedCarts.length > 0 ? (
                        <div className="space-y-2">
                          {profile.abandonedCarts.map((cart, i) => (
                            <div key={i} className="bg-destructive/5 border border-destructive/10 rounded-lg p-2.5">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{cart.event_name}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {formatTimestamp(cart.timestamp)} • {cart.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground/60">Nenhum carrinho abandonado</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            ) : profile ? (
              <div className="flex-1 flex items-center justify-center p-4 py-12">
                <div className="text-center">
                  <UserCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Carregando perfil...</p>
                </div>
              </div>
            ) : null}
          </ScrollArea>
        </div>
      )}

      <Dialog open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5" />
              Memória da IA — Eventos
            </DialogTitle>
            <DialogDescription>
              Adicione informações sobre eventos para a IA usar nas conversas.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            {knowledgeLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : eventKnowledge.length === 0 ? (
              <div className="text-center py-8">
                <BrainCircuit className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum evento cadastrado na memória</p>
              </div>
            ) : (
              <div className="space-y-3 pr-2">
                {eventKnowledge.map(ev => (
                  <div key={ev.id} className="border rounded-lg p-3 space-y-1.5 relative group">
                    <div className="flex items-start justify-between">
                      <p className="font-semibold text-sm">{ev.event_name}</p>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7"
                          onClick={() => handleEditEvent(ev)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteEvent(ev.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {ev.event_date && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" /> {new Date(ev.event_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    )}
                    {ev.event_location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <MapPinned className="w-3 h-3" /> {ev.event_location}
                      </p>
                    )}
                    {ev.attractions && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Music className="w-3 h-3" /> {ev.attractions}
                      </p>
                    )}
                    {ev.age_rating && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <ShieldAlert className="w-3 h-3" /> {ev.age_rating}
                      </p>
                    )}
                    {ev.ticket_link && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <LinkIcon className="w-3 h-3" /> <a href={ev.ticket_link} target="_blank" rel="noopener noreferrer" className="underline truncate">{ev.ticket_link}</a>
                      </p>
                    )}
                    {ev.observations && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <FileText className="w-3 h-3" /> {ev.observations}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button onClick={() => { setEditingEventId(null); setNewEvent({ event_name: '', event_date: '', event_location: '', attractions: '', age_rating: '', observations: '', ticket_link: '' }); setAddEventOpen(true); }} className="gap-1.5">
              <Plus className="w-4 h-4" /> Adicionar Evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addEventOpen} onOpenChange={(open) => { setAddEventOpen(open); if (!open) { setEditingEventId(null); setNewEvent({ event_name: '', event_date: '', event_location: '', attractions: '', age_rating: '', observations: '', ticket_link: '' }); } }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEventId ? 'Editar Evento' : 'Novo Evento'}</DialogTitle>
            <DialogDescription>Preencha as informações para ensinar a IA sobre este evento.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome do Evento *</Label>
              <Input value={newEvent.event_name} onChange={e => setNewEvent(p => ({ ...p, event_name: e.target.value }))} placeholder="Ex: Maestria" />
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={newEvent.event_date} onChange={e => setNewEvent(p => ({ ...p, event_date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Local</Label>
              <Input value={newEvent.event_location} onChange={e => setNewEvent(p => ({ ...p, event_location: e.target.value }))} placeholder="Ex: Estádio Kleber Andrade — Cariacica, ES" />
            </div>
            <div>
              <Label className="text-xs">Atrações</Label>
              <Textarea value={newEvent.attractions} onChange={e => setNewEvent(p => ({ ...p, attractions: e.target.value }))} placeholder="Ex: Matuê, Filipe RET, Orochi" rows={2} />
            </div>
            <div>
              <Label className="text-xs">Classificação Etária</Label>
              <RadioGroup value={newEvent.age_rating} onValueChange={v => setNewEvent(p => ({ ...p, age_rating: v }))} className="mt-1.5 space-y-2">
                {AGE_RATING_OPTIONS.map(opt => (
                  <div key={opt} className="flex items-start gap-2">
                    <RadioGroupItem value={opt} id={`age-${opt}`} className="mt-0.5" />
                    <label htmlFor={`age-${opt}`} className="text-xs cursor-pointer leading-snug">{opt}</label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div>
              <Label className="text-xs">Link de compra</Label>
              <Input value={newEvent.ticket_link} onChange={e => setNewEvent(p => ({ ...p, ticket_link: e.target.value }))} placeholder="https://..." />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea value={newEvent.observations} onChange={e => setNewEvent(p => ({ ...p, observations: e.target.value }))} placeholder="Regras especiais, setores..." rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEventOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEvent} disabled={savingEvent} className="gap-1.5">
              {savingEvent && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingEventId ? 'Atualizar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
