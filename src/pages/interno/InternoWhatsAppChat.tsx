import { useState, useEffect, useRef, useMemo, useCallback, memo, Fragment } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callWhatsappApi } from '@/lib/whatsappApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, ArrowLeft, Send, Clock, Check, CheckCheck, Bot, UserRound, DollarSign, Loader2, UserCircle, MapPin, Phone, ShoppingCart, AlertTriangle, Power, Smartphone, BrainCircuit, Plus, Trash2, Calendar, MapPinned, Music, ShieldAlert, FileText, Link as LinkIcon, Pencil, Instagram, RefreshCw, ChevronDown, UserCheck, Megaphone, TicketCheck, Armchair } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { confirmDialog } from '@/components/ConfirmDialog';
import { formatPhone } from '@/lib/formatPhone';
import { useAppMobile } from '@/hooks/useAppMobile';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface Message {
  id: string;
  phone: string;
  contact_name: string | null;
  contact_avatar?: string | null;
  contact_username?: string | null;
  direction: string;
  message_type: string;
  message_text: string | null;
  media_url: string | null;
  timestamp: string;
  status: string | null;
  wamid: string | null;
  channel?: string;
  raw_payload?: Record<string, any> | null;
  // Campos achatados pela consulta enxuta da lista (ver CONVERSATION_SELECT).
  // Evitam trazer o raw_payload inteiro de mil mensagens só para descobrir
  // o canal e a API de origem.
  wa_phone_id?: string | null;
  wa_meta_phone_id?: string | null;
  wa_display_phone?: string | null;
  wa_contact_id?: string | null;
  ig_sender_id?: string | null;
  ig_recipient_id?: string | null;
}

interface Conversation {
  phone: string;
  contact_name: string | null;
  contact_avatar: string | null;
  contact_username: string | null;
  last_message: string | null;
  last_timestamp: string;
  unread_count: number;
  needs_support: boolean;
  support_requested_at: string | null;
  last_direction: string;
  last_status: string | null;
  has_incoming: boolean;
  latest_incoming_timestamp: string | null;
  started_by_broadcast: boolean;
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

interface CustomerRegistration {
  type: 'divulgador' | 'creator' | 'prevenda';
  label: string;
  registered_at: string | null;
  detail?: string | null;
}

interface CustomerProfile {
  full_name: string;
  phone: string | null;
  city: string | null;
  neighborhood: string | null;
  ltv: number | null;
  events: EventBreakdown[];
  abandonedCarts: AbandonedCart[];
  registrations: CustomerRegistration[];
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

// Deriva o project ref da URL do Supabase se VITE_SUPABASE_PROJECT_ID não estiver
// definido (ex.: produção onde só VITE_SUPABASE_URL foi configurado). Evita montar
// URLs `https://undefined.supabase.co/...` que quebram as chamadas às functions.
interface OpenEvent {
  id: string;
  nome: string;
  tag: string | null;
}

const LOUNGE_NAMES = ['Lounge 1', 'Lounge 2', 'Lounge 3', 'Lounge 4', 'Lounge 5', 'Lounge 6'];

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID
  || (import.meta.env.VITE_SUPABASE_URL || '').match(/https?:\/\/([^.]+)\./)?.[1];
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

function phoneSearchVariants(phone: string): string[] {
  const original = phone.trim();
  const digits = original.replace(/\D/g, '');
  const national = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  const variants = new Set([original, digits, national, `55${national}`, `+55${national}`]);

  if (national.length === 11) {
    const ddd = national.slice(0, 2);
    const first = national.slice(2, 7);
    const last = national.slice(7);
    variants.add(`(${ddd}) ${first}-${last}`);
    variants.add(`(${ddd})${first}-${last}`);
    variants.add(`${ddd} ${first}-${last}`);
    variants.add(`+55 ${ddd} ${first}-${last}`);
  }

  return Array.from(variants).filter(Boolean);
}

/** Id da API do WhatsApp que originou a mensagem, venha ela da consulta
 *  enxuta (campos achatados) ou do raw_payload completo. */
function messageApiPhoneIdRaw(message: Message | Record<string, any>): string {
  const payload = (message as Message).raw_payload as Record<string, any> | null | undefined;
  return (message as Message).wa_phone_id
    || (message as Message).wa_meta_phone_id
    || payload?.phone_number_id
    || payload?.metadata?.phone_number_id
    || '';
}

function inferMessageChannel(message: Message): 'whatsapp' | 'instagram' {
  if (message.channel === 'instagram') return 'instagram';
  if (message.channel === 'whatsapp') return 'whatsapp';

  const payload = message.raw_payload as Record<string, any> | null | undefined;
  const hasWhatsappMetadata = Boolean(
    messageApiPhoneIdRaw(message)
    || message.wa_display_phone
    || message.wa_contact_id
    || payload?.metadata?.display_phone_number
    || payload?.contacts
  );
  if (hasWhatsappMetadata) return 'whatsapp';

  // Antes de `channel` existir, as DMs do Instagram já salvavam username/avatar
  // e usavam o ID numérico longo do usuário como `phone`.
  if (
    message.contact_username
    || message.contact_avatar
    || /^\d{16,}$/.test(message.phone || '')
    || message.ig_sender_id
    || message.ig_recipient_id
    || payload?.sender?.id
    || payload?.recipient?.id
  ) {
    return 'instagram';
  }

  return 'whatsapp';
}


/**
 * Avatar de contato à prova de link quebrado.
 *
 * As fotos do Instagram vêm do CDN da Meta e expiram em poucos dias — quando
 * isso acontece o <img> falha e aparecia um ícone de imagem quebrada. Aqui, em
 * vez disso, cai para um círculo colorido: a cor é derivada do id, então cada
 * pessoa fica com uma cor estável e as conversas continuam distinguíveis mesmo
 * sem foto nem @ (o que acontece enquanto o Instagram Login não estiver
 * conectado — a Meta não libera perfil de terceiros sem acesso avançado).
 */
function hueFromId(id: string) {
  return [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
}
function ContactAvatar({ src, name, id, channel, size = 40 }: { src?: string | null; name?: string | null; id: string; channel: 'whatsapp' | 'instagram'; size?: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const px = { width: size, height: size };
  if (src && !broken) {
    return <img src={src} alt="" onError={() => setBroken(true)} style={px} className="rounded-full object-cover shrink-0" />;
  }
  // Nome real → iniciais; só o id numérico → glifo do Instagram.
  const isNumeric = !name || /^\d+$/.test(name);
  const initials = isNumeric ? null : name!.trim().slice(0, 2).toUpperCase();
  const hue = hueFromId(id || 'x');
  return (
    <span
      style={{ ...px, background: channel === 'instagram'
        ? `radial-gradient(circle at 30% 30%, oklch(.70 .15 ${hue}), oklch(.42 .17 ${hue}) 70%)`
        : 'rgba(37,211,102,.2)' }}
      className="grid place-items-center rounded-full shrink-0 font-bold text-white"
    >
      {initials
        ? <span style={{ fontSize: Math.round(size * 0.34) }}>{initials}</span>
        : channel === 'instagram'
          ? <Instagram style={{ width: size * 0.45, height: size * 0.45 }} />
          : <span style={{ fontSize: Math.round(size * 0.3) }} className="text-[#25D366]">WA</span>}
    </span>
  );
}
/**
 * Rótulo de quem está falando.
 *
 * No Instagram o @ só existe quando a pessoa já comentou em algum post (o
 * webhook de comentário traz o username) ou quando o Instagram Login está
 * conectado. Sem isso mostramos o id cru — do mesmo jeito que o WhatsApp
 * mostra o número quando não há contato salvo. Nada de rótulo inventado.
 */
function contactLabel(channel: 'whatsapp' | 'instagram', name?: string | null, username?: string | null, id?: string | null) {
  if (channel === 'whatsapp') return name || formatPhone(id || '');
  if (username) return `@${username}`;
  if (name && !/^\d+$/.test(name)) return name;
  return id || '';
}

// Colunas da lista de conversas. Em vez do raw_payload inteiro (que em mil
// mensagens vira megabytes e travava a troca de aba), o Postgres devolve só
// os quatro campos que a tela usa para saber canal e API de origem. Se o banco
// recusar essa sintaxe, a consulta cai no select('*') de antes.
const CONVERSATION_SELECT = [
  'id', 'phone', 'contact_name', 'contact_avatar', 'contact_username',
  'direction', 'message_type', 'message_text', 'media_url', 'timestamp',
  'status', 'wamid', 'channel',
  'wa_phone_id:raw_payload->>phone_number_id',
  'wa_meta_phone_id:raw_payload->metadata->>phone_number_id',
  'wa_display_phone:raw_payload->metadata->>display_phone_number',
  'ig_sender_id:raw_payload->sender->>id',
  'ig_recipient_id:raw_payload->recipient->>id',
].join(',');

// A lista começa curta e cresce sozinha em blocos, quadro a quadro. A primeira
// pintura sai leve mesmo com mil conversas e nenhuma some do histórico.
const CONVERSATION_PAGE = 40;

const ConversationRow = memo(function ConversationRow({
  conv, channel, selected, onSelect, app = false,
}: {
  conv: Conversation;
  channel: 'whatsapp' | 'instagram';
  selected: boolean;
  onSelect: (conv: Conversation) => void;
  /** No celular a linha vira item de lista de aplicativo: foto maior, nome
   *  em cima, prévia embaixo, divisória começando depois da foto. */
  app?: boolean;
}) {
  const rotulo = contactLabel(channel, conv.contact_name, conv.contact_username, conv.phone);
  // Quando não há @ nem nome, o rótulo é um id: mostra em fonte mono e
  // apagada, para não parecer um nome quebrado.
  const soId = channel === 'instagram' && /^\d+$/.test(rotulo);
  const unread = conv.unread_count > 0;
  const cor = channel === 'instagram' ? '#E4405F' : '#25D366';
  return (
    <button
      onClick={() => onSelect(conv)}
      className={`relative w-full text-left transition-colors duration-150 ${
        app
          ? `app-lista-linha px-4 py-3 active:bg-muted/70 ${unread ? 'bg-muted/25' : ''}`
          : `p-4 border-b ${
            selected
              ? 'bg-muted'
              : unread
                ? channel === 'instagram' ? 'bg-[#E4405F]/10 hover:bg-[#E4405F]/15' : 'bg-[#25D366]/10 hover:bg-[#25D366]/15'
                : 'hover:bg-muted/50'
          }`
      }`}
    >
      <div className={`flex items-center ${app ? 'gap-3.5' : 'gap-3'}`}>
        <ContactAvatar src={conv.contact_avatar} name={conv.contact_name} id={conv.phone} channel={channel} size={app ? 52 : 40} />
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <p className={`truncate ${app ? 'text-[15px]' : 'text-sm'} ${unread ? 'font-extrabold text-foreground' : app ? 'font-medium' : 'font-semibold'} ${soId ? 'font-mono text-xs font-normal text-muted-foreground' : ''}`}>
                {soId ? <><span className="mr-1 not-italic">Sem nome</span><span className="opacity-50">#{rotulo.slice(-6)}</span></> : rotulo}
              </p>
              {conv.needs_support && (
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 animate-pulse" title="Precisa de suporte humano" />
              )}
            </div>
            <div className={`flex items-center shrink-0 ml-2 ${app ? 'flex-col items-end gap-1' : 'gap-2'}`}>
              <span
                className={`text-xs ${unread ? 'font-bold' : 'text-muted-foreground'}`}
                style={unread ? { color: cor } : undefined}
              >
                {formatTimestamp(conv.last_timestamp)}
              </span>
              {unread && (
                <span
                  className="min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                  style={{ background: cor }}
                  title={`${conv.unread_count} mensagem${conv.unread_count === 1 ? '' : 's'} não lida${conv.unread_count === 1 ? '' : 's'}`}
                >
                  {conv.unread_count > 99 ? '99+' : conv.unread_count}
                </span>
              )}
            </div>
          </div>
          <p className={`truncate mt-0.5 pr-2 flex items-center gap-1 ${app ? 'text-[13px]' : 'text-xs'} ${unread ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
            {conv.last_direction === 'outgoing' && <StatusIcon status={conv.last_status} />}
            <span className="truncate">{conv.last_message && conv.last_message.trim() !== '' ? conv.last_message : '📸 Mencionou no story'}</span>
          </p>
        </div>
      </div>
    </button>
  );
});

/** Etiqueta de dia entre as mensagens, como em aplicativo de mensagem. */
function dayLabel(ts: string) {
  const date = new Date(ts);
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "d 'de' MMMM", { locale: ptBR });
}

const DaySeparator = memo(function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="rounded-full bg-muted/70 px-3 py-1 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
    </div>
  );
});

const MessageBubble = memo(function MessageBubble({
  msg, channel, isLast,
}: {
  msg: Message;
  channel: 'whatsapp' | 'instagram';
  isLast: boolean;
}) {
  const mediaSrc = msg.media_url
    ? (msg.media_url.startsWith('http')
      ? msg.media_url
      : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-api?action=get_media&media_id=${msg.media_url}`)
    : null;
  const isStory = msg.message_type === 'story_mention' || msg.message_type === 'story_reply';
  return (
    <div className={`flex ${isLast ? (msg.direction === 'outgoing' ? 'chat-message-out' : 'chat-message-in') : ''} ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] max-md:max-w-[84%] rounded-2xl border px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.08)] ${
        msg.direction === 'outgoing'
          ? (channel === 'instagram' ? 'border-[#E4405F]/20 bg-[#E4405F]/15 text-foreground rounded-br-md' : 'border-[#25D366]/20 bg-[#25D366]/15 text-foreground rounded-br-md')
          : 'border-border/60 bg-card/80 text-foreground rounded-bl-md'
      }`}>
        {mediaSrc && (msg.message_type === 'image' || msg.message_type === 'sticker' || isStory) && (
          <div className="mb-1">
            {isStory && (
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">Story mencionado</p>
            )}
            <img
              src={mediaSrc}
              alt={isStory ? 'Conteúdo do story mencionado' : ''}
              className={`rounded-lg max-w-full cursor-pointer ${msg.message_type === 'sticker' ? 'max-h-32 w-auto' : 'max-h-64'}`}
              onClick={() => window.open(mediaSrc, '_blank')}
              loading="lazy"
              decoding="async"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
        {mediaSrc && msg.message_type === 'video' && (
          <video src={mediaSrc} controls preload="none" className="rounded-lg max-w-full max-h-64 mb-1" />
        )}
        {mediaSrc && msg.message_type === 'audio' && (
          <audio src={mediaSrc} controls preload="none" className="mb-1 max-w-full" />
        )}
        {msg.message_text && msg.message_text.trim() !== '' && msg.message_text !== `[${msg.message_type}]` ? (
          <p className="text-sm max-md:text-[15px] max-md:leading-snug whitespace-pre-wrap break-words">{msg.message_text}</p>
        ) : (
          <p className="text-sm italic opacity-70">
            {isStory
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
        <div className="mt-1.5 flex items-center justify-end gap-1 text-muted-foreground/80">
          <span className="text-[10px]">{formatTimestamp(msg.timestamp)}</span>
          {msg.direction === 'outgoing' && <StatusIcon status={msg.status} />}
        </div>
      </div>
    </div>
  );
});

/**
 * Caixa de escrita com estado próprio.
 *
 * Antes o texto morava no componente da página inteira: cada letra digitada
 * repintava a lista de conversas e todas as mensagens abertas, e era isso que
 * deixava a digitação travada. Aqui a letra só mexe na própria caixa.
 */
const Composer = memo(function Composer({
  channel, sending, onSend,
}: {
  channel: 'whatsapp' | 'instagram';
  sending: boolean;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const value = text.trim();
    if (!value || sending) return;
    const ok = await onSend(value);
    if (ok) setText('');
    inputRef.current?.focus();
  };

  // app-composer (index.css): só no celular, acrescenta embaixo a margem
  // segura do aparelho, para a caixa não cair sob a barra de gestos.
  return (
    <div className="app-composer border-t border-border/60 bg-background/80 px-4 py-3 max-md:px-3 max-md:py-2 backdrop-blur-sm">
      <div className={`flex gap-2 max-w-2xl mx-auto rounded-2xl border border-border/70 bg-card/70 p-1.5 shadow-sm transition-colors ${channel === 'instagram' ? 'focus-within:border-[#E4405F]/60' : 'focus-within:border-[#25D366]/40'}`}>
        <Input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            // nativeEvent.isComposing: teclado de acento/emoji ainda montando a
            // palavra — Enter aqui confirma a letra, não envia a mensagem.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={channel === 'instagram' ? 'Enviar mensagem no Instagram...' : 'Digite uma mensagem...'}
          className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <Button
          onClick={() => void submit()}
          disabled={!text.trim() || sending}
          size="icon"
          aria-label={sending ? 'Enviando mensagem' : 'Enviar mensagem'}
          className={`h-9 w-9 shrink-0 rounded-xl shadow-none transition-all duration-150 active:scale-95 ${channel === 'instagram'
            ? 'bg-[#E4405F] hover:bg-[#D93654] text-white'
            : 'bg-[#25D366] hover:bg-[#20BD5A] text-white'
          }`}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
});

export default function InternoWhatsAppChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [botEnabled, setBotEnabled] = useState<Record<string, boolean>>({});
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const conversationLoadIdRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);
  // Celular (abaixo de 768px): o chat vira tela de aplicativo de mensagem.
  const app = useAppMobile();
  const [fechando, setFechando] = useState(false);
  // Quantas conversas já foram pintadas (a lista cresce em blocos).
  const [visibleCount, setVisibleCount] = useState(CONVERSATION_PAGE);

  const [globalAiEnabled, setGlobalAiEnabled] = useState(false);
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
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'instagram'>('instagram');
  const [activeWhatsappInbox, setActiveWhatsappInbox] = useState<'chat' | 'window24h' | 'help' | 'broadcasts'>('chat');
  const [inboxNow, setInboxNow] = useState(Date.now());
  const [syncingInstagram, setSyncingInstagram] = useState(false);
  const [igAccounts, setIgAccounts] = useState<{ id: string; username: string; profile_picture_url?: string; name?: string }[]>([]);
  const [selectedIgAccount, setSelectedIgAccount] = useState<{ id: string; username: string; profile_picture_url?: string; name?: string } | null>(null);
  const [igAutoReply, setIgAutoReply] = useState(false);
  // Sem o token do Instagram Login a Meta não devolve nome/@/foto de quem
  // manda DM — o aviso abaixo some sozinho quando a conta é conectada.
  const [igConectado, setIgConectado] = useState<boolean | null>(null);
  const [togglingIgAi, setTogglingIgAi] = useState(false);

  // Recurso próprio do Lagun: gestão dos lounges dos eventos publicados.
  const [openEvents, setOpenEvents] = useState<OpenEvent[]>([]);
  const [loungesData, setLoungesData] = useState<Record<string, number[]>>({});
  const [loadingLounges, setLoadingLounges] = useState(false);
  const [togglingLounge, setTogglingLounge] = useState<string | null>(null);

  useEffect(() => {
    (supabase as any).rpc('ig_connection_status').then(({ data }: any) => {
      setIgConectado(Boolean(data?.[0]?.connected));
    }).catch(() => setIgConectado(null));
  }, []);

  const getAccountScope = (channel: 'whatsapp' | 'instagram' = activeChannel) =>
    channel === 'whatsapp' ? (selectedApiPhone || 'default') : (selectedIgAccount?.id || 'default');

  const markConversationRead = async (phone: string, readAt = new Date().toISOString()) => {
    const channel = activeChannel;
    const accountScope = getAccountScope(channel);

    // Atualização otimista: o destaque some no mesmo clique.
    setConversations(prev => prev.some(conv => conv.phone === phone && conv.unread_count > 0)
      ? prev.map(conv => (conv.phone === phone ? { ...conv, unread_count: 0 } : conv))
      : prev);

    // O id do usuário vem da sessão já guardada no navegador. Buscar o usuário
    // no servidor a cada clique atrasava a abertura da conversa.
    if (!currentUserIdRef.current) {
      const { data: { session } } = await supabase.auth.getSession();
      currentUserIdRef.current = session?.user?.id || null;
    }
    const user = { id: currentUserIdRef.current };
    const { error } = await supabase
      .from('chat_conversation_reads')
      .upsert({
        channel,
        account_scope: accountScope,
        contact_id: phone,
        last_read_at: readAt,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      }, { onConflict: 'channel,account_scope,contact_id' });

    if (error) console.error('Error marking conversation as read:', error);
  };

  const handleConversationSelect = useCallback((conv: Conversation) => {
    setSelectedPhone(prev => (prev === conv.phone ? prev : conv.phone));
    void markConversationRead(conv.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel, selectedApiPhone, selectedIgAccount?.id]);

  const messageApiPhoneId = (message: any) =>
    messageApiPhoneIdRaw(message)
    // Mensagens antigas não guardavam a API de origem. Elas pertencem ao
    // primeiro número que já era usado antes da inclusão do seletor.
    || apiPhones[0]?.id
    || '';

  // Atualiza a classificação automaticamente quando uma janela completa 24h,
  // mesmo que nenhuma mensagem nova seja recebida naquele momento.
  useEffect(() => {
    if (activeChannel !== 'whatsapp') return;
    setInboxNow(Date.now());
    const interval = window.setInterval(() => setInboxNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [activeChannel]);

  // Load API phone numbers
  const loadApiPhones = async () => {
    setLoadingApiPhones(true);
    try {
      const result = await callWhatsappApi('phone_numbers');
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

  const loadLounges = async () => {
    setLoadingLounges(true);
    const { data: events } = await supabase
      .from('lagun_events')
      .select('id, nome, tag')
      .eq('show_on_landing', true)
      .order('display_order', { ascending: true });
    if (events) setOpenEvents(events as OpenEvent[]);

    const { data: lounges } = await supabase.from('event_lounges').select('event_id, lounge_number, is_sold');
    if (lounges) {
      const map: Record<string, number[]> = {};
      lounges.forEach((l: any) => {
        if (!l.is_sold) return;
        if (!map[l.event_id]) map[l.event_id] = [];
        map[l.event_id].push(l.lounge_number);
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
    const nextSold = isSold ? currentSold.filter((number) => number !== loungeNum) : [...currentSold, loungeNum];
    setLoungesData((previous) => ({ ...previous, [eventId]: nextSold }));
    const { error } = await supabase.from('event_lounges').upsert(
      { event_id: eventId, lounge_number: loungeNum, is_sold: !isSold },
      { onConflict: 'event_id,lounge_number' },
    );
    if (error) {
      toast.error('Erro ao atualizar lounge');
      setLoungesData((previous) => ({ ...previous, [eventId]: currentSold }));
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
      const lagunvixFallback = { id: '17841436376156784', username: 'lagunvix', name: 'Lagun' };
      if (accounts.length > 0 && !selectedIgAccount) {
        const preferred = accounts.find(a => a.username === 'lagunvix') || accounts.find(a => a.username === 'triade.ent') || accounts[0];
        setSelectedIgAccount(preferred);
      } else if (accounts.length === 0 && !selectedIgAccount) {
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
    const loadId = ++conversationLoadIdRef.current;
    setLoading(true);

    // For whatsapp: include messages with channel='whatsapp' OR channel=null (legacy Meta API messages)
    const fetchPage = async (columns: string) => {
      const query = (supabase as any).from('whatsapp_messages')
        .select(columns).order('timestamp', { ascending: false }).limit(1000);
      return channel === 'whatsapp'
        ? await query.or('channel.eq.whatsapp,channel.is.null')
        : await query.eq('channel', channel);
    };

    let { data, error } = await fetchPage(CONVERSATION_SELECT);
    // Banco que não aceite os atalhos de JSON (erro, ou resposta sem os campos
    // pedidos): repete do jeito antigo, trazendo o raw_payload inteiro. Sem
    // esta conferência, mensagem antiga do WhatsApp poderia ser lida como
    // Instagram e sumir da caixa.
    const gotFlattenedFields = !data?.length || 'wa_phone_id' in (data[0] as Record<string, unknown>);
    if (error || !gotFlattenedFields) {
      if (error) console.warn('Consulta enxuta recusada, repetindo completa:', error.message);
      ({ data, error } = await fetchPage('*'));
    }

    if (loadId !== conversationLoadIdRef.current) return;
    if (error) { console.error('Error loading messages:', error); setLoading(false); return; }

    const accountScope = channel === 'whatsapp'
      ? (selectedApiPhone || 'default')
      : (selectedIgAccount?.id || 'default');
    const { data: readReceipts, error: receiptError } = await supabase
      .from('chat_conversation_reads')
      .select('contact_id, last_read_at')
      .eq('channel', channel)
      .eq('account_scope', accountScope);
    if (receiptError) console.error('Error loading conversation read receipts:', receiptError);
    const lastReadByContact = new Map(
      (readReceipts || []).map(receipt => [receipt.contact_id, new Date(receipt.last_read_at).getTime()])
    );

    const channelMessages = (data || []).filter((msg: any) => inferMessageChannel(msg as Message) === channel);
    const scopedMessages = channel === 'whatsapp' && selectedApiPhone
      ? channelMessages.filter((msg: any) => messageApiPhoneId(msg) === selectedApiPhone)
      : channelMessages;

    const convMap = new Map<string, Conversation>();
    for (const msg of scopedMessages) {
      const existing = convMap.get(msg.phone);
      const needsSupport = msg.status === 'need_support';
      const isBroadcast = msg.direction === 'outgoing' && msg.message_type === 'template';
      if (!existing) {
        convMap.set(msg.phone, {
          phone: msg.phone, contact_name: msg.contact_name,
          contact_avatar: (msg as Message).contact_avatar ?? null,
          contact_username: (msg as Message).contact_username ?? null,
          last_message: msg.message_text, last_timestamp: msg.timestamp,
          unread_count: msg.direction === 'incoming'
            && new Date(msg.timestamp).getTime() > (lastReadByContact.get(msg.phone) || 0) ? 1 : 0,
          needs_support: needsSupport,
          support_requested_at: needsSupport ? msg.timestamp : null,
          last_direction: msg.direction,
          last_status: msg.status,
          has_incoming: msg.direction === 'incoming',
          latest_incoming_timestamp: msg.direction === 'incoming' ? msg.timestamp : null,
          started_by_broadcast: isBroadcast,
        });
      } else {
        if (
          msg.direction === 'incoming'
          && new Date(msg.timestamp).getTime() > (lastReadByContact.get(msg.phone) || 0)
        ) existing.unread_count++;
        if (msg.direction === 'incoming') {
          existing.has_incoming = true;
          if (!existing.latest_incoming_timestamp) existing.latest_incoming_timestamp = msg.timestamp;
        }
        if (isBroadcast) existing.started_by_broadcast = true;
        if (!existing.contact_name && msg.contact_name) existing.contact_name = msg.contact_name;
        if (!existing.contact_avatar && (msg as Message).contact_avatar) existing.contact_avatar = (msg as Message).contact_avatar ?? null;
        if (!existing.contact_username && (msg as Message).contact_username) existing.contact_username = (msg as Message).contact_username ?? null;
        if (needsSupport) existing.needs_support = true;
        if (needsSupport && !existing.support_requested_at) existing.support_requested_at = msg.timestamp;
      }
    }

    // Uma solicitação de ajuda permanece na fila até o cliente responder
    // novamente. Apenas abrir a conversa não altera seu estado.
    for (const conversation of convMap.values()) {
      if (
        conversation.support_requested_at
        && conversation.latest_incoming_timestamp
        && new Date(conversation.latest_incoming_timestamp).getTime() > new Date(conversation.support_requested_at).getTime()
      ) {
        conversation.needs_support = false;
      }
    }

    setVisibleCount(CONVERSATION_PAGE);
    setConversations(
      Array.from(convMap.values()).sort((a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime())
    );
    if (loadId === conversationLoadIdRef.current) setLoading(false);
  };

  const toggleIgAutoReply = async () => {
    const newVal = !igAutoReply;
    // Ativar exige confirmação — evita ligar a resposta automática sem querer.
    if (newVal) {
      const ok = await confirmDialog({
        title: 'Ativar IA no Instagram?',
        description: 'A IA passará a responder AUTOMATICAMENTE todos os DMs do Instagram, sem revisão humana. Só ative quando o atendimento automático estiver liberado.',
        confirmText: 'Ativar IA',
        cancelText: 'Cancelar',
        destructive: true,
      });
      if (!ok) return;
    }
    setTogglingIgAi(true);
    setIgAutoReply(newVal);
    await supabase.from('whatsapp_bot_settings')
      .upsert({ phone: 'ig_auto_reply_global', bot_enabled: newVal, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
    toast.success(newVal ? 'IA do Instagram ativada' : 'IA do Instagram desativada');
    setTogglingIgAi(false);
  };

  // Load IG accounts on mount
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        loadIgAccounts();
      }
      // Load IG auto-reply setting
      const { data: igSetting } = await supabase
        .from('whatsapp_bot_settings')
        .select('bot_enabled')
        .eq('phone', 'ig_auto_reply_global')
        .maybeSingle();
      setIgAutoReply(igSetting?.bot_enabled === true);
      // O seletor de número não precisa ser aberto para a caixa do WhatsApp carregar.
      await loadApiPhones();
    };
    init();
  }, []);

  // Cada número da API possui sua própria caixa de entrada. Ao trocar de
  // número, limpa a conversa aberta e recarrega somente o histórico daquela API.
  useEffect(() => {
    if (activeChannel === 'whatsapp' && !selectedApiPhone) {
      if (!loadingApiPhones) setLoading(false);
      return;
    }
    loadConversationsForChannel(activeChannel);
    setSelectedPhone(null);
    setMessages([]);
  }, [activeChannel, selectedApiPhone, selectedIgAccount?.id]);

  const handleChannelChange = (channel: 'whatsapp' | 'instagram') => {
    if (channel === activeChannel) return;
    // Invalida imediatamente qualquer consulta anterior e remove o conteúdo da
    // outra aba no mesmo clique, antes do próximo frame ser renderizado.
    conversationLoadIdRef.current += 1;
    setConversations([]);
    setSelectedPhone(null);
    setMessages([]);
    setLoading(true);
    setActiveChannel(channel);
  };

  const handleApiPhoneChange = (phoneId: string) => {
    if (phoneId === selectedApiPhone) return;
    conversationLoadIdRef.current += 1;
    setConversations([]);
    setSelectedPhone(null);
    setMessages([]);
    setLoading(true);
    setSelectedApiPhone(phoneId);
  };

  // O que os avisos do tempo real precisam saber sobre a tela agora. Fica em
  // ref, não em dependência: assim a assinatura é criada uma única vez.
  const liveRef = useRef({ activeChannel, selectedPhone, selectedApiPhone, apiPhones, markConversationRead });
  liveRef.current = { activeChannel, selectedPhone, selectedApiPhone, apiPhones, markConversationRead };

  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' }, (payload) => {
        const newMsg = payload.new as Message & { channel?: string };
        const msgChannel = inferMessageChannel(newMsg);
        const { activeChannel, selectedPhone, selectedApiPhone, apiPhones } = liveRef.current;
        const messageApiPhoneId = (message: any) => messageApiPhoneIdRaw(message) || apiPhones[0]?.id || '';

        // Only add to conversation list if it matches the active channel
        const belongsToSelectedApi = msgChannel !== 'whatsapp'
          || !selectedApiPhone
          || messageApiPhoneId(newMsg) === selectedApiPhone;

        if (msgChannel === activeChannel && belongsToSelectedApi) {
          const needsSupport = newMsg.status === 'need_support';
          setConversations(prev => {
            const existing = prev.find(c => c.phone === newMsg.phone);
            if (existing) {
              return prev.map(c => c.phone === newMsg.phone ? {
                ...c, last_message: newMsg.message_text, last_timestamp: newMsg.timestamp,
                unread_count: newMsg.direction === 'incoming' && newMsg.phone !== selectedPhone ? c.unread_count + 1 : c.unread_count,
                contact_name: c.contact_name || newMsg.contact_name,
                contact_avatar: c.contact_avatar || newMsg.contact_avatar || null,
                contact_username: c.contact_username || newMsg.contact_username || null,
                needs_support: needsSupport ? true : (newMsg.direction === 'incoming' ? false : c.needs_support),
                support_requested_at: needsSupport ? newMsg.timestamp : c.support_requested_at,
                last_direction: newMsg.direction,
                last_status: newMsg.status,
                has_incoming: c.has_incoming || newMsg.direction === 'incoming',
                latest_incoming_timestamp: newMsg.direction === 'incoming' ? newMsg.timestamp : c.latest_incoming_timestamp,
                started_by_broadcast: c.started_by_broadcast || (newMsg.direction === 'outgoing' && newMsg.message_type === 'template'),
              } : c).sort((a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime());
            }
            return [{ phone: newMsg.phone, contact_name: newMsg.contact_name, contact_avatar: newMsg.contact_avatar || null, contact_username: newMsg.contact_username || null, last_message: newMsg.message_text, last_timestamp: newMsg.timestamp, unread_count: newMsg.direction === 'incoming' ? 1 : 0, needs_support: needsSupport, support_requested_at: needsSupport ? newMsg.timestamp : null, last_direction: newMsg.direction, last_status: newMsg.status, has_incoming: newMsg.direction === 'incoming', latest_incoming_timestamp: newMsg.direction === 'incoming' ? newMsg.timestamp : null, started_by_broadcast: newMsg.direction === 'outgoing' && newMsg.message_type === 'template' }, ...prev];
          });
        }
        
        if (msgChannel === activeChannel && newMsg.phone === selectedPhone && belongsToSelectedApi) {
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id || (m.wamid && m.wamid === newMsg.wamid))) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.direction === 'incoming') void liveRef.current.markConversationRead(newMsg.phone, newMsg.timestamp);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_messages' }, (payload) => {
        const updated = payload.new as Message;
        const { activeChannel, selectedApiPhone, apiPhones } = liveRef.current;
        const messageApiPhoneId = (message: any) => messageApiPhoneIdRaw(message) || apiPhones[0]?.id || '';
        if (inferMessageChannel(updated) !== activeChannel) return;
        if (activeChannel === 'whatsapp' && selectedApiPhone && messageApiPhoneId(updated) !== selectedApiPhone) return;
        // Casa também pelo wamid: a mensagem que acabou de sair daqui ainda tem
        // o id provisório do navegador, e sem isso o "entregue/lido" dela nunca
        // aparecia.
        setMessages(prev => prev.map(m => (
          m.id === updated.id || (m.wamid && updated.wamid && m.wamid === updated.wamid)
            ? { ...m, id: updated.id || m.id, status: updated.status }
            : m
        )));
        setConversations(prev => prev.map(c => {
          if (c.phone === updated.phone) {
            return { ...c, last_status: updated.status };
          }
          return c;
        }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const loadBotSettings = async () => {
      const { data } = await supabase.from('whatsapp_bot_settings').select('phone, bot_enabled');
      if (data) {
        const map: Record<string, boolean> = {};
        data.forEach((s: { phone: string; bot_enabled: boolean }) => {
          map[s.phone] = s.bot_enabled;
        });
        setBotEnabled(map);
        // Interruptor global (desligado por padrão): lê o registro dedicado
        // 'wa_ai_global'. Sem registro = IA desligada.
        const global = data.find((s: { phone: string }) => s.phone === 'wa_ai_global');
        setGlobalAiEnabled(global?.bot_enabled === true);
      }
    };
    loadBotSettings();
  }, []);

  useEffect(() => {
    if (!selectedPhone) { setProfile(null); return; }

    const loadMessages = async () => {
      // Ordem decrescente + reverse: traz as 200 mensagens MAIS RECENTES.
      // Em ordem crescente o limite pegava as 200 mais antigas, e conversa
      // longa abria no começo do histórico, sem as mensagens de hoje.
      const msgQuery = supabase.from('whatsapp_messages').select('*')
        .eq('phone', selectedPhone)
        .order('timestamp', { ascending: false }).limit(200);
      const { data } = activeChannel === 'whatsapp'
        ? await msgQuery.or('channel.eq.whatsapp,channel.is.null')
        : await msgQuery.eq('channel', activeChannel);
      // Filter out system messages
      setMessages(((data || []) as Message[]).filter(m =>
        m.message_type !== 'system'
        && inferMessageChannel(m) === activeChannel
        && (activeChannel !== 'whatsapp' || !selectedApiPhone || messageApiPhoneId(m) === selectedApiPhone)
      ).reverse());
    };

    const loadProfile = async () => {
      setProfileLoading(true);
      setProfile(null);

      const needle = normalizePhone(selectedPhone);
      const phoneVariants = phoneSearchVariants(selectedPhone);

      // Cadastros (divulgador, creator, pré-venda) ainda não são buscados aqui.
      const registrations: CustomerRegistration[] = [];

      // Antes esta tela baixava a tabela inteira de clientes a cada conversa
      // aberta e procurava o telefone no navegador. Agora o banco procura:
      // primeiro pelas grafias exatas do número, depois pelos 9 dígitos finais.
      const findCustomer = async () => {
        const { data: exact } = await supabase
          .from('crm_customers')
          .select('id, full_name, phone, ltv, city, neighborhood')
          .in('phone', phoneVariants)
          .limit(20);
        const exactMatch = (exact || []).find(c => c.phone && normalizePhone(c.phone) === needle);
        if (exactMatch) return exactMatch;

        // O telefone pode estar salvo com pontuação, então a busca por trecho
        // cobre tanto "27999998862" quanto "(27) 99999-8862".
        const dashed = needle.length === 9 ? `${needle.slice(0, 5)}-${needle.slice(5)}` : needle;
        const { data: similar } = await supabase
          .from('crm_customers')
          .select('id, full_name, phone, ltv, city, neighborhood')
          .or(`phone.ilike.%${needle}%,phone.ilike.%${dashed}%`)
          .limit(50);
        return (similar || []).find(c => c.phone && normalizePhone(c.phone) === needle) || null;
      };

      // Só os carrinhos abandonados, filtrados no banco. Antes vinham mil
      // webhooks inteiros para o navegador peneirar.
      const loadAbandonedCarts = async (): Promise<AbandonedCart[]> => {
        const base = () => supabase
          .from('webhook_logs')
          .select('payload, received_at')
          .eq('source', 'blueticket')
          .order('received_at', { ascending: false })
          .limit(500);
        type WebhookRow = { payload: unknown; received_at: string };
        const filtered = await (base() as unknown as {
          filter: (column: string, operator: string, value: string) => Promise<{ data: WebhookRow[] | null; error: unknown }>;
        }).filter('payload->payload->>type', 'eq', 'abandoned_cart');
        // Banco que não aceite o filtro dentro do JSON: peneira aqui mesmo.
        const rows: WebhookRow[] = (filtered.error ? (await base()).data : filtered.data) || [];

        const carts: AbandonedCart[] = [];
        const phoneNeedle = selectedPhone.replace(/\D/g, '').slice(-9);
        rows.forEach((log) => {
          const p = log.payload as Record<string, any> | null;
          if (p?.payload?.type !== 'abandoned_cart') return;
          const custPhone = (p?.payload?.customer?.phone || '').replace(/\D/g, '');
          if (custPhone.slice(-9) !== phoneNeedle) return;
          carts.push({
            event_name: p?.payload?.event?.name || 'Evento desconhecido',
            timestamp: p?.timestamp || log.received_at,
            amount: p?.payload?.order?.amount || 0,
          });
        });
        return carts;
      };

      const match = await findCustomer();

      if (match) {
        const [{ data: purchases }, abandonedCarts] = await Promise.all([
          supabase
            .from('crm_purchases')
            .select('event_name, total_value')
            .eq('customer_id', match.id),
          loadAbandonedCarts(),
        ]);

        const eventMap = new Map<string, number>();
        (purchases || []).forEach(p => {
          eventMap.set(p.event_name, (eventMap.get(p.event_name) || 0) + (p.total_value || 0));
        });
        const eventBreakdown: EventBreakdown[] = Array.from(eventMap.entries()).map(([event_name, total]) => ({ event_name, total }));

        setProfile({
          full_name: match.full_name, phone: match.phone, ltv: match.ltv,
          city: match.city, neighborhood: match.neighborhood,
          events: eventBreakdown, abandonedCarts, registrations, found: true,
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
          const abandonedCarts2 = await loadAbandonedCarts();

          setProfile({
            full_name: newCustomer.full_name, phone: newCustomer.phone, ltv: newCustomer.ltv,
            city: newCustomer.city, neighborhood: newCustomer.neighborhood,
            events: [], abandonedCarts: abandonedCarts2, registrations, found: true,
          });
        } else {
          setProfile({
            full_name: contactName, phone: selectedPhone, ltv: 0,
            city: null, neighborhood: null, events: [], abandonedCarts: [], registrations, found: true,
          });
        }
      }
      setProfileLoading(false);
    };

    loadMessages();
    // O painel de perfil só existe no WhatsApp, e o "telefone" de uma DM é o id
    // numérico do Instagram. Rodar isto no Instagram cadastrava um cliente novo
    // no CRM com o id no lugar do telefone a cada DM aberta.
    if (activeChannel === 'whatsapp') loadProfile();
    else { setProfile(null); setProfileLoading(false); }
  }, [selectedPhone, selectedApiPhone, activeChannel]);

  // Ao abrir uma conversa, vai direto para o fim, sem animar o caminho inteiro.
  // Depois disso, mensagem nova só puxa a rolagem se a pessoa já estiver perto
  // do fim: quem está lendo o histórico não é mais arrancado de lá.
  useEffect(() => {
    if (!selectedPhone) return;
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [selectedPhone, activeChannel]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceFromBottom < 240) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length]);

  const toggleBot = async (phone: string) => {
    const current = botEnabled[phone] === true;
    const newVal = !current;
    setBotEnabled(prev => ({ ...prev, [phone]: newVal }));
    await supabase.from('whatsapp_bot_settings')
      .upsert({ phone, bot_enabled: newVal, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
  };

  const toggleGlobalAi = async () => {
    const newVal = !globalAiEnabled;
    // Ativar exige confirmação — a IA responderá automaticamente no WhatsApp.
    if (newVal) {
      const ok = await confirmDialog({
        title: 'Ativar IA no WhatsApp?',
        description: 'A IA passará a responder AUTOMATICAMENTE as mensagens recebidas no WhatsApp, sem revisão humana. Só ative quando o atendimento automático estiver liberado.',
        confirmText: 'Ativar IA',
        cancelText: 'Cancelar',
        destructive: true,
      });
      if (!ok) return;
    }
    setTogglingGlobal(true);
    setGlobalAiEnabled(newVal);
    // Interruptor global (desligado por padrão). O webhook só aciona a IA se
    // este registro estiver explicitamente ligado.
    await supabase.from('whatsapp_bot_settings')
      .upsert({ phone: 'wa_ai_global', bot_enabled: newVal, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
    toast.success(newVal ? 'IA do WhatsApp ativada' : 'IA do WhatsApp desativada');
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

  // Devolve true quando a mensagem saiu — só então a caixa de escrita se limpa.
  const handleSendReply = useCallback(async (replyText: string): Promise<boolean> => {
    if (!replyText.trim() || !selectedPhone || sending) return false;

    // Instagram DM send
    if (activeChannel === 'instagram') {
      const igAccount = selectedIgAccount ?? { id: '17841436376156784', username: 'lagunvix' };
      setSending(true);
      let sent = false;
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
            channel: 'instagram',
          };
          setMessages(prev => [...prev, optimisticMsg]);
          // A DM enviada também vira a última linha da conversa na lista.
          setConversations(prev => prev.map(c => c.phone === selectedPhone
            ? { ...c, last_message: replyText, last_timestamp: sentAt, last_direction: 'outgoing', last_status: 'sent' }
            : c).sort((a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime()));
          // Uma resposta manual assume o atendimento e pausa a IA somente
          // para este contato, mesmo que o interruptor global volte a ser ligado.
          await supabase.from('whatsapp_bot_settings')
            .upsert({ phone: `ig:${selectedPhone}`, bot_enabled: false, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
          sent = true;
        }
      } catch (err) { console.error('IG send error:', err); toast.error('Erro ao enviar DM'); }
      finally { setSending(false); }
      return sent;
    }

    // ── WhatsApp via Meta API oficial ──────────────────────────────────
    setSending(true);
    let sent = false;
    try {
      const sentAt = new Date().toISOString();
      const contactName = conversations.find(c => c.phone === selectedPhone)?.contact_name || null;
      const result = await callWhatsappApi('send_text', {
        to: selectedPhone, text: replyText,
        phone_number_id: selectedApiPhone || undefined, contact_name: contactName,
      });
      if (result.error) {
        console.error('Send error:', result.error);
        toast.error(typeof result.error === 'string' ? result.error : 'Não foi possível enviar a mensagem');
      } else {
        const wamid = result.messages?.[0]?.id || null;
        const optimisticMsg: Message = {
          id: crypto.randomUUID(), phone: selectedPhone, contact_name: contactName,
          direction: 'outgoing', message_type: 'text', message_text: replyText,
          media_url: null, timestamp: sentAt, status: 'sent', wamid,
          channel: 'whatsapp', raw_payload: { phone_number_id: selectedApiPhone },
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
                 last_timestamp: sentAt, unread_count: 0, needs_support: false, support_requested_at: null,
                 last_direction: 'outgoing', last_status: 'sent',
                 has_incoming: false, latest_incoming_timestamp: null, started_by_broadcast: false }, ...prev];
          return updated.sort((a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime());
        });
        sent = true;
        if (result.persisted === false) toast.error('Mensagem enviada mas não salva no histórico.');
        if (botEnabled[selectedPhone] !== false) {
          setBotEnabled(prev => ({ ...prev, [selectedPhone]: false }));
          await supabase.from('whatsapp_bot_settings')
            .upsert({ phone: selectedPhone, bot_enabled: false, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
        }
      }
    } catch (err) { console.error('Send error:', err); toast.error('Não foi possível enviar a mensagem'); }
    finally { setSending(false); }
    return sent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhone, sending, activeChannel, selectedApiPhone, selectedIgAccount?.id, conversations, botEnabled]);

  const selectedConv = useMemo(
    () => conversations.find(c => c.phone === selectedPhone),
    [conversations, selectedPhone],
  );

  // Uma passada só pela lista: separa as quatro caixas do WhatsApp e já conta
  // cada uma. Antes eram cinco varreduras completas a cada repintura.
  const { visibleConversations, whatsappInboxCounts } = useMemo(() => {
    if (activeChannel !== 'whatsapp') {
      return { visibleConversations: conversations, whatsappInboxCounts: { chat: 0, window24h: 0, help: 0, broadcasts: 0 } };
    }
    const buckets = { chat: [] as Conversation[], window24h: [] as Conversation[], help: [] as Conversation[], broadcasts: [] as Conversation[] };
    for (const conversation of conversations) {
      if (conversation.needs_support) { buckets.help.push(conversation); continue; }
      if (conversation.started_by_broadcast && !conversation.has_incoming) { buckets.broadcasts.push(conversation); continue; }
      const windowOpen = Boolean(
        conversation.latest_incoming_timestamp
        && inboxNow - new Date(conversation.latest_incoming_timestamp).getTime() <= WHATSAPP_WINDOW_MS
      );
      (windowOpen ? buckets.window24h : buckets.chat).push(conversation);
    }
    return {
      visibleConversations: buckets[activeWhatsappInbox],
      whatsappInboxCounts: {
        chat: buckets.chat.length,
        window24h: buckets.window24h.length,
        help: buckets.help.length,
        broadcasts: buckets.broadcasts.length,
      },
    };
  }, [conversations, activeChannel, activeWhatsappInbox, inboxNow]);

  // A lista entra em blocos: a primeira pintura sai leve e o resto aparece nos
  // quadros seguintes, sem bloquear o clique nem a rolagem.
  const shownConversations = useMemo(
    () => visibleConversations.slice(0, visibleCount),
    [visibleConversations, visibleCount],
  );
  useEffect(() => {
    if (visibleCount >= visibleConversations.length) return;
    const id = window.requestAnimationFrame(() => setVisibleCount(count => count + CONVERSATION_PAGE));
    return () => window.cancelAnimationFrame(id);
  }, [visibleCount, visibleConversations.length]);
  useEffect(() => { setVisibleCount(CONVERSATION_PAGE); }, [activeWhatsappInbox, activeChannel]);

  // ── Celular: a conversa é uma tela inteira que entra por cima da lista ──
  // Enquanto ela está aberta, a barra de abas do app sai da frente e a caixa
  // de escrita acompanha o teclado. A versão web não passa por nada disto.
  useEffect(() => {
    if (!app || !selectedPhone) return;
    document.body.classList.add('app-chat-cheio');
    return () => document.body.classList.remove('app-chat-cheio');
  }, [app, selectedPhone]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!app || !selectedPhone || !vv) return;
    const raiz = document.documentElement;
    const medir = () => {
      const teclado = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      raiz.style.setProperty('--kb', `${Math.round(teclado)}px`);
    };
    medir();
    vv.addEventListener('resize', medir);
    vv.addEventListener('scroll', medir);
    return () => {
      vv.removeEventListener('resize', medir);
      vv.removeEventListener('scroll', medir);
      raiz.style.removeProperty('--kb');
    };
  }, [app, selectedPhone]);

  // Voltar para a lista: a tela sai deslizando antes de desmontar.
  const fecharConversa = useCallback(() => {
    if (!app) { setSelectedPhone(null); return; }
    setFechando(true);
    window.setTimeout(() => { setSelectedPhone(null); setFechando(false); }, 170);
  }, [app]);

  const raizClasse = app
    ? (selectedPhone
      ? `app-chat-tela ${fechando ? 'app-chat-saindo' : ''} flex overflow-hidden bg-background`
      : 'app-chat-lista flex overflow-hidden bg-background')
    : 'flex h-[calc(100vh-120px)] overflow-hidden rounded-xl border bg-background lg:h-[calc(100vh-60px)]';

  return (
    <div className={raizClasse}>
      <div className={`w-full md:w-80 border-r max-md:border-r-0 flex flex-col shrink-0 ${selectedPhone ? 'hidden md:flex' : 'flex'}`}>
        <div className={`border-b ${app ? 'order-[-2]' : ''}`}>
          <div className="flex">
            <button
              onClick={() => handleChannelChange('instagram')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeChannel === 'instagram'
                  ? 'border-[#E4405F] text-[#E4405F]'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Instagram className="w-4 h-4" />
              Instagram
            </button>
            <button
              onClick={() => handleChannelChange('whatsapp')}
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
          </div>
          {activeChannel === 'instagram' && igConectado === false && (
            <div className="px-3 py-2.5 border-b bg-[#FFE14D]/[0.07] space-y-1.5">
              <p className="text-[11px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">Nomes e fotos indisponíveis.</span>{' '}
                A Meta só libera o perfil de quem manda DM com a conta conectada pelo Instagram Login.
              </p>
              <a
                href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ig-oauth`}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#FFE14D] px-2.5 text-[11px] font-semibold text-black hover:brightness-95"
              >
                <Instagram className="w-3 h-3" /> Conectar Instagram
              </a>
            </div>
          )}
          {activeChannel === 'instagram' && selectedIgAccount && (
            <div className="px-3 py-2 border-b flex items-center gap-2">
              <ContactAvatar src={selectedIgAccount.profile_picture_url} name={selectedIgAccount.username} id={selectedIgAccount.id} channel="instagram" size={24} />
              <span className="text-xs font-medium text-muted-foreground">@{selectedIgAccount.username}</span>
              <span className="ml-auto text-[10px] text-emerald-500 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Automático
              </span>
            </div>
          )}
          {activeChannel === 'whatsapp' && (
            <div className="flex px-2 pt-2 gap-1">
              <button
                onClick={() => { setActiveWhatsappInbox('chat'); setSelectedPhone(null); }}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                  activeWhatsappInbox === 'chat' ? 'bg-[#25D366]/15 text-[#25D366]' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                Chat <span className="ml-1 opacity-70">{whatsappInboxCounts.chat}</span>
              </button>
              <button
                onClick={() => { setActiveWhatsappInbox('window24h'); setSelectedPhone(null); }}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                  activeWhatsappInbox === 'window24h' ? 'bg-[#25D366]/15 text-[#25D366]' : 'text-muted-foreground hover:bg-muted'
                }`}
                title="Conversas com janela de atendimento aberta nas últimas 24 horas"
              >
                24h <span className="ml-1 opacity-70">{whatsappInboxCounts.window24h}</span>
              </button>
              <button
                onClick={() => { setActiveWhatsappInbox('help'); setSelectedPhone(null); }}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                  activeWhatsappInbox === 'help' ? 'bg-red-500/15 text-red-400' : 'text-muted-foreground hover:bg-muted'
                }`}
                title="Conversas que precisam de intervenção humana"
              >
                Help <span className="ml-1 opacity-70">{whatsappInboxCounts.help}</span>
              </button>
              <button
                onClick={() => { setActiveWhatsappInbox('broadcasts'); setSelectedPhone(null); }}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                  activeWhatsappInbox === 'broadcasts' ? 'bg-[#25D366]/15 text-[#25D366]' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                Disparos <span className="ml-1 opacity-70">{whatsappInboxCounts.broadcasts}</span>
              </button>
            </div>
          )}
        </div>
        <ScrollArea className="flex-1 max-md:[&>[data-radix-scroll-area-viewport]>div]:!block">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : visibleConversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                {activeChannel === 'whatsapp' && activeWhatsappInbox === 'broadcasts'
                  ? 'Nenhum disparo sem resposta'
                  : activeChannel === 'whatsapp' && activeWhatsappInbox === 'help'
                    ? 'Nenhuma conversa aguardando ajuda humana'
                  : activeChannel === 'whatsapp' && activeWhatsappInbox === 'window24h'
                    ? 'Nenhuma janela de 24h aberta'
                    : 'Nenhuma conversa no histórico'}
              </p>
            </div>
          ) : (
            <>
              {shownConversations.map(conv => (
                <ConversationRow
                  key={`${activeChannel}:${selectedApiPhone}:${conv.phone}`}
                  conv={conv}
                  channel={activeChannel}
                  selected={selectedPhone === conv.phone}
                  onSelect={handleConversationSelect}
                  app={app}
                />
              ))}
            </>
          )}
        </ScrollArea>

        {activeChannel === 'instagram' && (
          <div className={`p-2 ${app ? 'order-[-1] border-b' : 'border-t'}`}>
            <Button
              variant={igAutoReply ? 'default' : 'outline'}
              size="sm"
              onClick={toggleIgAutoReply}
              disabled={togglingIgAi}
              className={`w-full gap-1.5 text-xs ${igAutoReply ? 'bg-[#E4405F] hover:bg-[#d03050] text-white border-0' : ''}`}
              title={igAutoReply ? 'IA ativa — responde automaticamente no Instagram' : 'IA desativada no Instagram'}
            >
              <Bot className="w-3.5 h-3.5 shrink-0" />
              {togglingIgAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (igAutoReply ? 'IA On' : 'IA Off')}
            </Button>
          </div>
        )}

        {activeChannel === 'whatsapp' && (
          <div className={`p-2 grid gap-1 ${app ? 'order-[-1] border-b grid-cols-4' : 'border-t grid-cols-2'}`}>
            <Button
              variant="outline"
              size="sm"
              disabled
              className="gap-1.5 text-xs opacity-70"
              title="IA do WhatsApp temporariamente desativada"
            >
              <Power className="w-3.5 h-3.5 shrink-0" />
              IA Off
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
                  <RadioGroup value={selectedApiPhone} onValueChange={handleApiPhoneChange} className="space-y-2">
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

            <Popover onOpenChange={(open) => { if (open) void loadLounges(); }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Armchair className="w-3.5 h-3.5 shrink-0" /> Lounge
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="start" side="top">
                <p className="text-xs font-semibold mb-3 flex items-center gap-1.5"><Armchair className="w-3.5 h-3.5" /> Lounges por Evento</p>
                {loadingLounges ? <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                  : openEvents.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum evento aberto na Landing Page</p>
                  : <div className="space-y-4 max-h-72 overflow-y-auto pr-1">{openEvents.map((event) => {
                    const soldLounges = loungesData[event.id] || [];
                    return <div key={event.id}><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 truncate">{event.nome}</p>
                      <div className="grid grid-cols-3 gap-1.5">{LOUNGE_NAMES.map((name, index) => {
                        const number = index + 1;
                        const sold = soldLounges.includes(number);
                        const isSaving = togglingLounge === `${event.id}-${number}`;
                        return <button key={number} onClick={() => void toggleLounge(event.id, number)} disabled={isSaving}
                          className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg text-[11px] font-medium border transition-all ${sold ? 'bg-red-50 border-red-300 text-red-600 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400' : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400'}`}>
                          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Armchair className="w-3.5 h-3.5" />}{name}<span className="text-[9px] font-bold">{sold ? 'Vendido' : 'Livre'}</span>
                        </button>;
                      })}</div></div>;
                  })}</div>}
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
            <div className="p-4 max-md:px-3 max-md:py-2.5 border-b flex items-center gap-3 max-md:gap-2.5 max-md:bg-background/95 max-md:backdrop-blur-sm">
              <Button variant="ghost" size="icon" className="md:hidden -ml-1.5" onClick={fecharConversa}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <ContactAvatar src={selectedConv?.contact_avatar} name={selectedConv?.contact_name} id={selectedPhone || ''} channel={activeChannel} />
              <div className="flex-1 min-w-0">
                {(() => {
                  const rotulo = contactLabel(activeChannel, selectedConv?.contact_name, selectedConv?.contact_username, selectedPhone);
                  const soId = activeChannel === 'instagram' && /^\d+$/.test(rotulo);
                  return <p className="truncate text-sm font-bold">{soId ? 'Sem nome' : rotulo}</p>;
                })()}
                <p className="text-xs text-muted-foreground truncate">{activeChannel === 'instagram' ? (selectedConv?.contact_username ? `@${selectedConv.contact_username}` : `#${selectedPhone}`) : formatPhone(selectedPhone)}</p>
              </div>
              {activeChannel === 'whatsapp' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="gap-1.5 opacity-70"
                >
                  <><UserRound className="w-4 h-4" /> Humano</>
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1 px-4 py-5" viewportRef={messagesViewportRef}>
              <div className="space-y-1.5 max-w-2xl mx-auto">
                {messages.map((msg, i) => {
                  // Etiqueta de dia sempre que a data muda (só no celular, para
                  // a versão web continuar exatamente como está).
                  const dia = app && (i === 0 || new Date(msg.timestamp).toDateString() !== new Date(messages[i - 1].timestamp).toDateString())
                    ? dayLabel(msg.timestamp)
                    : null;
                  return (
                    <Fragment key={msg.id}>
                      {dia && <DaySeparator label={dia} />}
                      <MessageBubble
                        msg={msg}
                        channel={activeChannel}
                        isLast={i === messages.length - 1}
                      />
                    </Fragment>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <Composer
              // Uma caixa por conversa: o rascunho não escorrega para o
              // próximo contato quando se troca de conversa.
              key={`${activeChannel}:${selectedPhone}`}
              channel={activeChannel}
              sending={sending}
              onSend={handleSendReply}
            />
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
                        {(profile.registrations.length + profile.abandonedCarts.length) > 0 && (
                          <span className="ml-1 bg-destructive/10 text-destructive text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {profile.registrations.length + profile.abandonedCarts.length}
                          </span>
                        )}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {(profile.registrations.length > 0 || profile.abandonedCarts.length > 0) ? (
                        <div className="space-y-2.5">
                          {profile.registrations.map(registration => {
                            const config = registration.type === 'divulgador'
                              ? { Icon: Megaphone, className: 'bg-sky-500/10 border-sky-500/20 text-sky-300' }
                              : registration.type === 'creator'
                                ? { Icon: UserCheck, className: 'bg-violet-500/10 border-violet-500/20 text-violet-300' }
                                : { Icon: TicketCheck, className: 'bg-amber-500/10 border-amber-500/20 text-amber-300' };
                            return (
                              <div key={registration.type} className={`rounded-lg border p-2.5 ${config.className}`}>
                                <div className="flex items-start gap-2">
                                  <config.Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-foreground">{registration.label}</p>
                                    {(registration.detail || registration.registered_at) && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {[registration.detail, registration.registered_at ? `Cadastro: ${new Date(registration.registered_at).toLocaleDateString('pt-BR')}` : null].filter(Boolean).join(' • ')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
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
                        <p className="text-xs text-muted-foreground/60">Nenhum cadastro ou carrinho abandonado</p>
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
