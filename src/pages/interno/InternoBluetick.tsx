import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Check, Download, Ticket, DollarSign, ShoppingCart, Crown, CalendarCheck, Calendar, ChevronDown, ChevronUp, Radio, Send, Loader2, TrendingUp, RefreshCw, Pencil, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { toast } from 'sonner';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface WebhookLog {
  id: string;
  source: string;
  payload: any;
  received_at: string;
}

interface ParsedData {
  type: string;
  event: { id: number; name: string };
  order: { id: number; amount: number; status: string; customer?: CustomerData };
  customer?: CustomerData;
  tickets?: { price: number; quantity: number; product_name: string; product_category: string }[];
  payments?: { amount: number; method: string; status: string; installments: number }[];
}

interface CustomerData {
  name: string;
  email: string;
  phone: string;
  country: string;
  zipcode: string;
  document: string;
}

interface WhatsAppMessageRecord {
  id: string;
  phone: string;
  contact_name: string | null;
  direction: string;
  message_type: string;
  message_text: string | null;
  status: string | null;
  wamid: string | null;
  created_at: string;
}

interface EventRecord {
  id: string;
  name: string;
  event_date: string | null;
  platform: string | null;
  status: string | null;
  updated_at: string;
  official_tickets?: number | null;
  official_revenue?: number | null;
}

interface CrmPurchaseData {
  totalTickets: number;
  totalRevenue: number;
  todayTickets: number;
  firstSaleDate: string | null;
  lastSaleDate: string | null;
  dailySales: Map<string, number>;
  eventName: string;
}

const BLUETICKET_EVENT_NAMES: Record<string, string[]> = {
  '40359': ['Fantástico Mundo do Lukão', 'Fantástico Mundo de Lukão'],
  'lebai': ["Le'Bai - Rodrigo Do CN", "Le'Bai", 'Le Bai'],
  '40935': ["Le'Bai - Rodrigo Do CN", "Le'Bai", 'Le Bai'],
  '40943': ['Aura Black', 'AURA BLACK', 'Aura'],
};

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return `5527${digits}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatShortDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Event Selection Screen ───
function EventSelector() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<{ id: number; name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);

  const webhookBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/blueticket-webhook`;

  const predefinedEvents = [
    { id: 99901, name: 'Sambinha' },
  ];

  useEffect(() => {
    async function load() {
      // Fetch all webhook logs using pagination to avoid the 1000-row limit
      const allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('webhook_logs')
          .select('payload')
          .eq('source', 'blueticket')
          .range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        allData.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const eventMap = new Map<number, { name: string; count: number }>();
      (allData || []).forEach(log => {
        const p = (log.payload as any)?.payload;
        if (p?.event?.id) {
          const existing = eventMap.get(p.event.id);
          if (existing) existing.count++;
          else eventMap.set(p.event.id, { name: p.event.name, count: 1 });
        }
      });

      const dynamicEvents = [...eventMap.entries()].map(([id, v]) => ({ id, ...v }));
      predefinedEvents.forEach(pe => {
        if (!dynamicEvents.find(e => e.name.toLowerCase() === pe.name.toLowerCase())) {
          dynamicEvents.push({ ...pe, count: 0 });
        }
      });

      setEvents(dynamicEvents);
      setLoading(false);
    }
    load();
  }, []);

  function copyWebhookLink(eventName: string) {
    navigator.clipboard.writeText(webhookBaseUrl);
    setCopiedWebhook(eventName);
    toast.success(`Link do webhook copiado para ${eventName}!`);
    setTimeout(() => setCopiedWebhook(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-gray-400 dark:text-gray-500" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/interno')} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
          <ArrowLeft size={16} className="mr-1" /> Home
        </Button>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Blueticket</h2>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">Selecione o evento para ver o dashboard</p>

      {events.length === 0 ? (
        <div className="text-center py-16">
          <Radio size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum evento encontrado</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Configure o webhook na Blueticket para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map(event => (
            <div
              key={event.id}
              className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all"
            >
              <button onClick={() => navigate(`/interno/blueticket/${event.id}`)} className="w-full text-left">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-500 mb-3">
                  <Ticket size={18} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{event.name}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">{event.count} registro(s) recebidos</p>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); copyWebhookLink(event.name); }}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
              >
                {copiedWebhook === event.name ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> Copiar link webhook</>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Event Dashboard ───
export function EventDashboard({ eventId, autoDispatchSlot, eventDate: eventDateProp }: { eventId: string; autoDispatchSlot?: ReactNode; eventDate?: string }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateLang, setTemplateLang] = useState<string>('pt_BR');
  const [apiPhones, setApiPhones] = useState<any[]>([]);
  const [selectedPhoneId, setSelectedPhoneId] = useState<string>('');
  const [eventRecord, setEventRecord] = useState<EventRecord | null>(null);
  const [crmData, setCrmData] = useState<CrmPurchaseData | null>(null);
  const [lastWebhookAt, setLastWebhookAt] = useState<string | null>(null);
  // phone (com 55) → timestamp do último disparo
  const [dispatchedPhones, setDispatchedPhones] = useState<Map<string, string>>(new Map());
  const [editingTickets, setEditingTickets] = useState(false);
  const [ticketEditValue, setTicketEditValue] = useState('');
  const [savingTickets, setSavingTickets] = useState(false);

  async function loadEventContext(discoveredEventName?: string, webhookTimestamp?: string | null) {
    const candidateNames = [...new Set([...(BLUETICKET_EVENT_NAMES[eventId] || []), discoveredEventName].filter(Boolean) as string[])];

    setLastWebhookAt(webhookTimestamp || null);

    if (candidateNames.length === 0) {
      setEventRecord(null);
      setCrmData(null);
      return;
    }

    const [{ data: eventRows }, { data: purchases }] = await Promise.all([
      supabase
        .from('lagun_events')
        .select('id, nome, data, status, official_tickets, official_revenue')
        .in('nome', candidateNames)
        .limit(1),
      supabase
        .from('crm_purchases')
        .select('purchase_date, ticket_price, total_value, quantity, event_name')
        .in('event_name', candidateNames)
        .order('purchase_date', { ascending: true }),
    ]);

    const rawEvent = eventRows?.[0] as any;
    setEventRecord(rawEvent ? {
      id: rawEvent.id,
      name: rawEvent.nome,
      event_date: rawEvent.data ?? null,
      platform: null,
      status: rawEvent.status ?? null,
      updated_at: '',
      official_tickets: rawEvent.official_tickets ?? null,
      official_revenue: rawEvent.official_revenue ?? null,
    } : null);

    if (!purchases || purchases.length === 0) {
      setCrmData(null);
      return;
    }

    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    let totalTickets = 0;
    let totalRevenue = 0;
    let todayTickets = 0;
    const dailySales = new Map<string, number>();

    purchases.forEach((purchase) => {
      const qty = Number(purchase.quantity) || 1;
      const revenue = Number(purchase.total_value ?? purchase.ticket_price ?? 0);
      const purchaseDate = purchase.purchase_date?.split('T')[0] || '';

      totalTickets += qty;
      totalRevenue += revenue;
      if (purchaseDate) {
        dailySales.set(purchaseDate, (dailySales.get(purchaseDate) || 0) + qty);
        if (purchaseDate === todayKey) todayTickets += qty;
      }
    });

    setCrmData({
      totalTickets,
      totalRevenue,
      todayTickets,
      firstSaleDate: purchases[0]?.purchase_date?.split('T')[0] || null,
      lastSaleDate: purchases[purchases.length - 1]?.purchase_date?.split('T')[0] || null,
      dailySales,
      eventName: eventRows?.[0]?.name || purchases[0]?.event_name || candidateNames[0],
    });
  }

  useEffect(() => {
    async function loadTemplatesAndPhones() {
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-api?action=templates`,
          { headers: { 'Content-Type': 'application/json' } }
        );
        const result = await resp.json();
        if (result?.data) {
          const approved = result.data.filter((t: any) => t.status === 'APPROVED');
          setTemplates(approved);
          if (approved.length > 0) {
            setSelectedTemplate(approved[0].name);
            setTemplateLang(approved[0].language || 'pt_BR');
          }
        }
        const phonesResp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-api?action=phone_numbers`,
          { headers: { 'Content-Type': 'application/json' } }
        );
        const phonesData = await phonesResp.json();
        if (phonesData?.data) {
          const cloudPhones = phonesData.data.filter((p: any) => p.platform_type === 'CLOUD_API');
          setApiPhones(cloudPhones.length > 0 ? cloudPhones : phonesData.data);
          const preferred = phonesData.data.find((p: any) => p.display_phone_number?.includes('96591-8862'));
          const firstCloud = cloudPhones[0];
          setSelectedPhoneId(preferred?.id || firstCloud?.id || phonesData.data[0]?.id || '');
        }
      } catch (e) {
        console.error('Failed to load templates/phones:', e);
      }
    }
    loadTemplatesAndPhones();
  }, []);

  async function sendWhatsAppToContact(phone: string, name: string) {
    if (!selectedTemplate) { toast.error('Selecione um modelo de mensagem primeiro.'); return; }
    setSendingTo(phone);
    try {
      if (!selectedPhoneId) throw new Error('Selecione um número de WhatsApp primeiro');
      const tmpl = templates.find((t: any) => t.name === selectedTemplate);
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-api?action=send_bulk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone_number_id: selectedPhoneId,
            template_name: selectedTemplate,
            template_language: templateLang,
            template_components: tmpl?.components || [],
            contacts: [{ phone: formatPhone(phone), name: name || 'cliente' }],
          }),
        }
      );
      const result = await resp.json();
      if (result.sent > 0) {
        const formattedPhone = formatPhone(phone);
        const bodyComponent = (tmpl?.components || []).find((c: any) => c.type === 'BODY');
        const messageText = bodyComponent?.text || `[Template: ${selectedTemplate}]`;
        const wamid = result.details?.[0]?.wamid || result.details?.[0]?.message_id || result.details?.[0]?.messages?.[0]?.id || null;

        const { error: insertError } = await supabase.from('whatsapp_messages').insert({
          phone: formattedPhone, contact_name: name || null, direction: 'outgoing',
          message_type: 'template', message_text: messageText, status: 'sent', wamid,
        }).select('id').single();
        if (insertError) throw insertError;

        await supabase.from('whatsapp_bot_settings')
          .upsert({ phone: formattedPhone, bot_enabled: false, updated_at: new Date().toISOString() }, { onConflict: 'phone' });

        if (wamid) {
          const deliveryStatus = await waitForWhatsAppStatus(wamid);
          if (deliveryStatus === 'failed') { toast.error('WhatsApp recusou a entrega do template.'); return; }
          if (deliveryStatus === 'delivered') { toast.success(`Mensagem entregue para ${name || phone}!`); return; }
        }
        toast.success(`Mensagem enviada para ${name || phone}!`);
        setDispatchedPhones(prev => new Map(prev).set(formattedPhone, new Date().toISOString()));
      } else {
        toast.error(`Erro ao enviar: ${result.details?.[0]?.error || 'Erro desconhecido'}`);
      }
    } catch (e: any) { toast.error(`Erro: ${e.message}`); }
    finally { setSendingTo(null); }
  }

  async function waitForWhatsAppStatus(wamid: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const { data, error } = await supabase
        .from('whatsapp_messages').select('status').eq('wamid', wamid)
        .order('created_at', { ascending: false }).limit(1)
        .maybeSingle<Pick<WhatsAppMessageRecord, 'status'>>();
      if (error) { console.error('Erro consultando status:', error); return null; }
      if (data?.status === 'failed' || data?.status === 'delivered') return data.status;
    }
    return null;
  }

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/blueticket-webhook`;

  useEffect(() => {
    loadLogs();
    const channel = supabase
      .channel('webhook-logs-event')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'webhook_logs' }, (payload) => {
        const p = ((payload.new as WebhookLog).payload as any)?.payload;
        if (p?.event?.id?.toString() === eventId) {
          setLogs(prev => [payload.new as WebhookLog, ...prev]);
          toast.success('Novo dado recebido!');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  async function loadLogs() {
    setLoading(true);
    const allLogs: WebhookLog[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('source', 'blueticket')
        .order('received_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      allLogs.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    const filtered = allLogs.filter(l => (l.payload as any)?.payload?.event?.id?.toString() === eventId);
    setLogs(filtered);
    await loadEventContext(filtered[0]?.payload?.payload?.event?.name, filtered[0]?.received_at || null);

    // Carrega status de disparo pra todos os carrinhos
    const phones = filtered
      .filter(l => (l.payload as any)?.payload?.type === 'abandoned_cart')
      .map(l => {
        const phone = (l.payload as any)?.payload?.customer?.phone
          || (l.payload as any)?.payload?.order?.customer?.phone;
        return phone ? formatPhone(phone) : null;
      })
      .filter(Boolean) as string[];

    if (phones.length > 0) {
      await loadDispatchedPhones(phones);
    }

    setLoading(false);
  }

  async function loadDispatchedPhones(phones: string[]) {
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('phone, created_at')
      .in('phone', phones)
      .eq('direction', 'outgoing')
      .order('created_at', { ascending: false });

    const map = new Map<string, string>();
    (data ?? []).forEach((row: any) => {
      if (!map.has(row.phone)) map.set(row.phone, row.created_at);
    });
    setDispatchedPhones(map);
  }

  const parsedWithMeta = useMemo(() => {
    return logs.map(l => ({ data: (l.payload as any)?.payload as ParsedData, received_at: l.received_at })).filter(item => item.data);
  }, [logs]);

  const parsed = useMemo(() => parsedWithMeta.map(p => p.data), [parsedWithMeta]);
  const eventName = eventRecord?.name || crmData?.eventName || parsed[0]?.event?.name || BLUETICKET_EVENT_NAMES[eventId]?.[0] || 'Evento';

  const metrics = useMemo(() => {
    const getBrazilDateKey = (value: string) => {
      // Normalize Supabase timestamp format: "2026-05-21 11:50:39.034872+00" → ISO 8601
      const iso = value
        .replace(' ', 'T')
        .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')  // +0000 → +00:00
        .replace(/([+-]\d{2})$/, '$1:00');          // +00 → +00:00
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(iso));
    };

    const getTicketQuantity = (tickets?: ParsedData['tickets']) =>
      tickets?.reduce((sum, ticket) => sum + (Number(ticket.quantity) || 0), 0) || 0;

    const quantityByAmount = new Map<string, Map<number, number>>();
    parsedWithMeta.forEach(({ data: p }) => {
      if (p.type === 'abandoned_cart') return; // carrinho abandonado não deve influenciar a inferência de quantidade
      const amountKey = Number(p.order?.amount || 0).toFixed(2);
      const qty = getTicketQuantity(p.tickets);
      if (!amountKey || amountKey === '0.00' || qty <= 0) return;
      const current = quantityByAmount.get(amountKey) || new Map<number, number>();
      current.set(qty, (current.get(qty) || 0) + 1);
      quantityByAmount.set(amountKey, current);
    });

    const inferredQuantityByAmount = new Map<string, number>();
    quantityByAmount.forEach((freqMap, amountKey) => {
      const [bestQty] = [...freqMap.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      inferredQuantityByAmount.set(amountKey, bestQty);
    });

    // For paid order amounts NOT covered by explicit ticket data, infer qty via multi-tier unit price detection.
    // NOTE: abandoned carts may populate inferredQuantityByAmount for some amounts (e.g. R$38),
    // but paid orders at other amounts (R$76, R$190, R$142.50) may still be missing — run fallback for those.
    const paidAmountKeys = new Set<string>();
    parsedWithMeta.forEach(({ data: p }) => {
      const a = Number(p.order?.amount || 0);
      const isPaid = (p.type === 'order_payment' && p.payments?.some(pay => pay.status === 'paid')) ||
                     (p.type === 'order_payment' && p.order?.status === 'A' && a > 0);
      if (isPaid && a > 0) paidAmountKeys.add(a.toFixed(2));
    });

    const uncoveredAmountKeys = [...paidAmountKeys].filter(k => !inferredQuantityByAmount.has(k));

    if (uncoveredAmountKeys.length > 0) {
      const allPaidAmounts = [...paidAmountKeys].map(k => parseFloat(k)).sort((a, b) => a - b);

      // Score each candidate unit price by how many paid amounts it cleanly divides
      const candidateScores = new Map<number, number>();
      allPaidAmounts.forEach(candidate => {
        let score = 0;
        allPaidAmounts.forEach(amount => {
          if (amount >= candidate) {
            const ratio = amount / candidate;
            const rounded = Math.round(ratio);
            if (Math.abs(ratio - rounded) < 0.08 && rounded >= 1) score++;
          }
        });
        candidateScores.set(candidate, score);
      });

      // For each uncovered amount, pick the highest-scoring unit price that divides it cleanly.
      // Tie-break: prefer smaller qty (higher unit price) among equal scores.
      uncoveredAmountKeys.forEach(amountKey => {
        const amount = parseFloat(amountKey);
        let bestQty = 1;
        let bestScore = -1;
        allPaidAmounts.forEach(candidate => {
          if (candidate <= amount) {
            const ratio = amount / candidate;
            const rounded = Math.round(ratio);
            if (Math.abs(ratio - rounded) < 0.08 && rounded >= 1) {
              const score = candidateScores.get(candidate) || 0;
              if (score > bestScore || (score === bestScore && rounded < bestQty)) {
                bestScore = score;
                bestQty = rounded;
              }
            }
          }
        });
        inferredQuantityByAmount.set(amountKey, bestQty);
      });
    }

    const orderMap = new Map<string, {
      data: ParsedData;
      received_at: string;
      amount: number;
      qty: number;
      paid: boolean;
    }>();

    parsedWithMeta.forEach(({ data: p, received_at }) => {
      const orderId = String(p.order?.id || '');
      if (!orderId) return;

      const amount = Number(p.order?.amount || 0);
      const explicitQty = getTicketQuantity(p.tickets);
      const inferredQty = explicitQty > 0 ? explicitQty : (inferredQuantityByAmount.get(amount.toFixed(2)) ?? 1);
      const paidByPayment = p.type === 'order_payment' && p.payments?.some(pay => pay.status === 'paid');
      const paidByOrderStatus = p.type === 'order_payment' && p.order?.status === 'A' && amount > 0;
      const isPaid = Boolean(paidByPayment || paidByOrderStatus);

      const existing = orderMap.get(orderId);
      if (!existing) {
        orderMap.set(orderId, {
          data: p,
          received_at,
          amount,
          qty: inferredQty,
          paid: isPaid,
        });
        return;
      }

      const betterQty = Math.max(existing.qty, inferredQty);
      const betterAmount = Math.max(existing.amount, amount);
      const betterReceivedAt = new Date(received_at) > new Date(existing.received_at) ? received_at : existing.received_at;
      const betterData = paidByPayment || (!existing.paid && isPaid) || explicitQty > getTicketQuantity(existing.data.tickets)
        ? p
        : existing.data;

      orderMap.set(orderId, {
        data: betterData,
        received_at: betterReceivedAt,
        amount: betterAmount,
        qty: betterQty,
        paid: existing.paid || isPaid,
      });
    });

    const paidOrdersList = [...orderMap.values()].filter(order => order.paid);
    const todayKey = getBrazilDateKey(new Date().toISOString());

    const seenAbandonedIds = new Set<string>();
    const abandonedCarts: { data: ParsedData; received_at: string }[] = [];
    parsedWithMeta.forEach(({ data: p, received_at }) => {
      if (p.type !== 'abandoned_cart') return;
      const orderId = String(p.order?.id || '');
      if (orderId && seenAbandonedIds.has(orderId)) return;
      if (orderId) seenAbandonedIds.add(orderId);
      abandonedCarts.push({ data: p, received_at });
    });

    const webhookRevenue = paidOrdersList.reduce((sum, order) => sum + order.amount, 0);
    const webhookTickets = paidOrdersList.reduce((sum, order) => sum + order.qty, 0);
    const webhookTodayTickets = paidOrdersList
      .filter((order) => getBrazilDateKey(order.received_at) === todayKey)
      .reduce((sum, order) => sum + order.qty, 0);

    const participantMap = new Map<string, { name: string; email: string; phone: string; total: number }>();
    paidOrdersList.forEach(({ data: order, amount }) => {
      const customer = order.order.customer || order.customer;
      if (!customer) return;
      const key = customer.document || customer.email;
      if (!key) return;
      const existing = participantMap.get(key);
      if (existing) existing.total += amount;
      else participantMap.set(key, { name: customer.name, email: customer.email, phone: customer.phone, total: amount });
    });

    const superClients = [...participantMap.values()].sort((a, b) => b.total - a.total).slice(0, 10);

    const buyerIdentifiers = new Set<string>();
    paidOrdersList.forEach(({ data: order }) => {
      const customer = order.order.customer || order.customer;
      if (!customer) return;
      if (customer.document) buyerIdentifiers.add(customer.document.replace(/\D/g, ''));
      if (customer.email) buyerIdentifiers.add(customer.email.toLowerCase());
    });

    let recoveredCount = 0;
    let recoveredRevenue = 0;
    abandonedCarts.forEach(({ data: cart }) => {
      const customer = cart.customer || cart.order?.customer;
      if (!customer) return;
      const doc = customer.document?.replace(/\D/g, '');
      const email = customer.email?.toLowerCase();
      if ((doc && buyerIdentifiers.has(doc)) || (email && buyerIdentifiers.has(email))) {
        recoveredCount++;
        recoveredRevenue += cart.order?.amount || 0;
      }
    });

    const dailyMap = new Map<string, number>();
    paidOrdersList.forEach((order) => {
      const day = getBrazilDateKey(order.received_at);
      dailyMap.set(day, (dailyMap.get(day) || 0) + order.qty);
    });

    const webhookDailySalesData = [];
    for (let i = 19; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      const label = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: 'short',
      }).format(d);
      webhookDailySalesData.push({ date: label, fullDate: key, qty: dailyMap.get(key) || 0 });
    }

    const useCrmMetrics = Boolean(eventRecord?.status === 'ended' && crmData?.totalTickets);
    const hasOfficialNumbers = Boolean(eventRecord?.official_tickets && eventRecord?.official_tickets > 0);
    const crmDailySalesData = webhookDailySalesData.map((entry) => ({
      ...entry,
      qty: crmData?.dailySales.get(entry.fullDate) || 0,
    }));

    const finalTickets = hasOfficialNumbers ? eventRecord!.official_tickets! : (useCrmMetrics ? crmData?.totalTickets || 0 : webhookTickets);
    const webhookOrCrmRevenue = useCrmMetrics ? crmData?.totalRevenue || 0 : webhookRevenue;
    const finalRevenue = (hasOfficialNumbers && eventRecord?.official_revenue != null) ? eventRecord.official_revenue : webhookOrCrmRevenue;

    return {
      totalTickets: finalTickets,
      totalRevenue: finalRevenue,
      todayTickets: useCrmMetrics ? crmData?.todayTickets || 0 : webhookTodayTickets,
      dailySalesData: useCrmMetrics ? crmDailySalesData : webhookDailySalesData,
      abandonedCarts: abandonedCarts.length,
      recoveredCarts: recoveredCount,
      recoveredCartsRevenue: recoveredRevenue,
      superClients,
      abandonedCartData: abandonedCarts,
      buyerIdentifiers,
      source: hasOfficialNumbers ? 'oficial' : (useCrmMetrics ? 'crm' : 'webhook'),
    };
  }, [parsedWithMeta, eventRecord?.status, crmData]);

  async function saveOfficialTickets() {
    if (!eventRecord?.id) { toast.error('Evento não encontrado no banco'); return; }
    const val = parseInt(ticketEditValue);
    if (isNaN(val) || val < 0) { toast.error('Número inválido'); return; }
    setSavingTickets(true);
    const { error } = await supabase.from('lagun_events').update({ official_tickets: val }).eq('id', eventRecord.id);
    if (error) { toast.error('Erro ao salvar'); }
    else {
      setEventRecord(prev => prev ? { ...prev, official_tickets: val } : prev);
      toast.success(`Ingressos corrigidos para ${val}`);
      setEditingTickets(false);
    }
    setSavingTickets(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('URL copiada!');
    setTimeout(() => setCopied(false), 2000);
  }

  function exportAbandonedCarts() {
    const carts = metrics.abandonedCartData;
    if (carts.length === 0) { toast.error('Nenhum carrinho abandonado encontrado.'); return; }
    const uniqueMap = new Map<string, any>();
    carts.forEach(({ data: c }) => {
      const customer = c.customer || c.order?.customer;
      if (!customer?.phone) return;
      const phone = formatPhone(customer.phone);
      if (!uniqueMap.has(phone)) {
        uniqueMap.set(phone, {
          nome: customer.name, telefone: phone, email: customer.email,
          valor_carrinho: c.order?.amount || 0,
          ingresso: c.tickets?.map((t: any) => t.product_name).join(', ') || '',
        });
      }
    });
    const rows = [...uniqueMap.values()];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Carrinhos Abandonados');
    XLSX.writeFile(wb, `carrinhos_abandonados_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`Planilha gerada com ${rows.length} contato(s)!`);
  }

  const statCards = [
    {
      label: 'Ingressos',
      value: metrics.totalTickets,
      subtitle: metrics.source === 'crm'
        ? `CRM consolidado em ${formatShortDate(crmData?.lastSaleDate)}`
        : 'Baseado nos webhooks ao vivo',
      icon: Ticket,
      color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30'
    },
    { label: 'Faturamento', value: formatCurrency(metrics.totalRevenue), subtitle: `${metrics.totalTickets} ingressos`, icon: DollarSign, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Hoje', value: metrics.todayTickets, subtitle: `${new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}`, icon: CalendarCheck, color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/30' },
  ];

  const abandonedValue = formatCurrency(
    metrics.abandonedCartData.reduce((sum, c) => sum + (c.data.order?.amount || 0), 0)
  );

  const isEventEnded = eventRecord?.status === 'ended';

  const daysUntilEvent = (() => {
    const eventDate = eventRecord?.event_date || eventDateProp;
    if (eventDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const event = new Date(`${eventDate}T00:00:00`);
      const diff = Math.round((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diff > 0 ? diff : 0;
    }
    return null;
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/interno/blueticket')} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
            <ArrowLeft size={16} className="mr-1" /> Eventos
          </Button>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{eventName}</h2>
          {isEventEnded ? (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Encerrado</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">Ao vivo</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-xs text-gray-500 dark:text-gray-400" onClick={async () => { setRefreshing(true); await loadLogs(); setRefreshing(false); toast.success('Dados atualizados!'); }}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span className="ml-1">Atualizar</span>
          </Button>
          <Button variant="ghost" size="sm" className="text-xs text-gray-400 dark:text-gray-500" onClick={() => setShowConfig(!showConfig)}>
            {showConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span className="ml-1">Configurações</span>
          </Button>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {metrics.source === 'crm'
          ? `Evento encerrado • exibindo CRM consolidado${crmData?.lastSaleDate ? ` até ${formatShortDate(crmData.lastSaleDate)}` : ''}`
          : `Último webhook recebido em ${formatDateTime(lastWebhookAt)}`}
      </p>

      {showConfig && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 max-w-3xl animate-in slide-in-from-top-2 duration-200">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">Webhook URL</h3>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">Cole esta URL nas configurações de webhook da Blueticket.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2.5 text-gray-600 dark:text-gray-400 font-mono break-all border border-gray-100 dark:border-gray-700">
              {webhookUrl}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0 rounded-lg h-9">
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-gray-400 dark:text-gray-500" size={24} />
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-6 gap-3">
            {statCards.map(card => (
              <div key={card.label} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3.5 hover:border-gray-300 dark:hover:border-gray-700 transition-all flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${card.color}`}>
                    <card.icon size={13} />
                  </div>
                  {card.label === 'Ingressos' && eventRecord?.id && !editingTickets && (
                    <button
                      onClick={() => { setTicketEditValue(String(metrics.totalTickets)); setEditingTickets(true); }}
                      className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
                      title="Corrigir contagem"
                    >
                      <Pencil size={11} />
                    </button>
                  )}
                </div>
                <div>
                  {card.label === 'Ingressos' && editingTickets ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={ticketEditValue}
                        onChange={e => setTicketEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveOfficialTickets(); if (e.key === 'Escape') setEditingTickets(false); }}
                        className="h-7 text-sm font-bold px-1.5 w-16"
                        autoFocus
                      />
                      <button onClick={saveOfficialTickets} disabled={savingTickets} className="text-emerald-500 hover:text-emerald-700">
                        {savingTickets ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEditingTickets(false)} className="text-gray-400 hover:text-gray-600">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{card.value}</p>
                  )}
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    {card.label === 'Ingressos' && metrics.source === 'oficial' ? 'Corrigido manualmente' : card.subtitle}
                  </p>
                  <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-1">{card.label}</p>
                </div>
              </div>
            ))}
            {/* Abandoned Carts card */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3.5 hover:border-gray-300 dark:hover:border-gray-700 transition-all flex flex-col gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg text-orange-500 bg-orange-50 dark:bg-orange-900/30">
                <ShoppingCart size={13} />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{metrics.abandonedCarts}</p>
                <p className="text-xs font-semibold text-red-500 dark:text-red-400">{abandonedValue}</p>
                <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-1">Carrinhos Abandonados</p>
              </div>
            </div>
            {/* Recovered Carts card */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3.5 hover:border-gray-300 dark:hover:border-gray-700 transition-all flex flex-col gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30">
                <ShoppingCart size={13} />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">
                  {metrics.recoveredCarts} <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">de</span> <span className="text-xs font-semibold text-red-500 dark:text-red-400">{metrics.abandonedCarts}</span>
                </p>
                <p className="text-xs font-semibold text-emerald-500 dark:text-emerald-400">{formatCurrency(metrics.recoveredCartsRevenue)}</p>
                <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-1">Carrinhos Recuperados</p>
              </div>
            </div>
            {/* Days until event */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3.5 hover:border-gray-300 dark:hover:border-gray-700 transition-all flex flex-col gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30">
                <Calendar size={13} />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{daysUntilEvent ?? '—'}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">{isEventEnded ? 'evento realizado' : 'para o evento'}</p>
                <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-1">{isEventEnded ? 'Evento encerrado' : daysUntilEvent !== null ? `Faltam ${daysUntilEvent} dia${daysUntilEvent === 1 ? '' : 's'}` : 'Data não definida'}</p>
              </div>
            </div>
          </div>

          {/* Abandoned Cart Export */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-900/30 text-orange-500 shrink-0">
                  <ShoppingCart size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Carrinhos Abandonados</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Gere uma planilha ou dispare direto pelo WhatsApp</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {autoDispatchSlot}
                {templates.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 text-[11px] border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 max-w-[200px] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <span className="truncate">{selectedTemplate || 'Template'}</span>
                        <ChevronDown size={12} className="shrink-0 text-gray-400" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[280px] p-3">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">Template de mensagem</p>
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {templates.map((t: any) => (
                          <button
                            key={t.name}
                            onClick={() => {
                              setSelectedTemplate(t.name);
                              setTemplateLang(t.language || 'pt_BR');
                            }}
                            className={`flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-left transition-colors ${
                              selectedTemplate === t.name
                                ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                            }`}
                          >
                            <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 shrink-0 ${
                              selectedTemplate === t.name ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'
                            }`}>
                              {selectedTemplate === t.name && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{t.name}</p>
                              {t.category && <p className="text-[10px] text-gray-400 dark:text-gray-500">{t.category}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {apiPhones.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 text-[11px] border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 max-w-[200px] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <span className="truncate">{apiPhones.find((p: any) => p.id === selectedPhoneId)?.display_phone_number || 'Número'}</span>
                        <ChevronDown size={12} className="shrink-0 text-gray-400" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[260px] p-3">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">Número da API</p>
                      <div className="space-y-1">
                        {apiPhones.map((p: any) => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedPhoneId(p.id)}
                            className={`flex items-center gap-2.5 w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                              selectedPhoneId === p.id
                                ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                            }`}
                          >
                            <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 shrink-0 ${
                              selectedPhoneId === p.id ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'
                            }`}>
                              {selectedPhoneId === p.id && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                            </div>
                            <div>
                              <p className="text-xs font-mono font-medium text-gray-900 dark:text-gray-100">{p.display_phone_number}</p>
                              {p.verified_name && <p className="text-[10px] text-gray-400 dark:text-gray-500">{p.verified_name}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <Button
                  onClick={exportAbandonedCarts}
                  className="rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs gap-2"
                  size="sm"
                >
                  <Download size={14} />
                  Planilha
                </Button>
              </div>
            </div>

            {metrics.abandonedCartData.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left py-2 px-3 text-gray-400 dark:text-gray-500 font-medium">Nome</th>
                      <th className="text-left py-2 px-3 text-gray-400 dark:text-gray-500 font-medium">Telefone (Disparo)</th>
                      <th className="text-left py-2 px-3 text-gray-400 dark:text-gray-500 font-medium">Data/Hora</th>
                      <th className="text-right py-2 px-3 text-gray-400 dark:text-gray-500 font-medium">Valor</th>
                      <th className="text-center py-2 px-3 text-gray-400 dark:text-gray-500 font-medium">Status</th>
                      <th className="text-center py-2 px-3 text-gray-400 dark:text-gray-500 font-medium">Disparo</th>
                      <th className="text-center py-2 px-3 text-gray-400 dark:text-gray-500 font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.abandonedCartData.map((cart, i) => {
                      const c = cart.data.customer || cart.data.order?.customer;
                      if (!c) return null;
                      const abandonedDate = new Date(cart.received_at);
                      const formattedDate = abandonedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + abandonedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                      const docClean = c.document ? c.document.replace(/\D/g, '') : '';
                      const emailClean = c.email ? c.email.toLowerCase() : '';
                      const hasPurchased = (docClean && metrics.buyerIdentifiers.has(docClean)) || (emailClean && metrics.buyerIdentifiers.has(emailClean));
                      return (
                        <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-medium">{c.name}</td>
                          <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400 font-mono">{formatPhone(c.phone)}</td>
                          <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400">{formattedDate}</td>
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 text-right font-medium">{formatCurrency(cart.data.order?.amount || 0)}</td>
                          <td className="py-2.5 px-3 text-center">
                            {hasPurchased ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">✅ Comprou</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">❌ Não comprou</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {(() => {
                              const fPhone = c.phone ? formatPhone(c.phone) : null;
                              const sentAt = fPhone ? dispatchedPhones.get(fPhone) : null;
                              if (sentAt) {
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                                    title={new Date(sentAt).toLocaleString('pt-BR')}
                                  >
                                    📲 {new Date(sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                );
                              }
                              return <span className="text-[10px] text-gray-300 dark:text-gray-600">—</span>;
                            })()}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {!hasPurchased && c.phone ? (
                              <button
                                onClick={() => sendWhatsAppToContact(c.phone, c.name)}
                                disabled={sendingTo === c.phone || !selectedTemplate}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title={selectedTemplate ? `Enviar "${selectedTemplate}"` : 'Selecione um template acima'}
                              >
                                {sendingTo === c.phone ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                Disparar
                              </button>
                            ) : hasPurchased ? (
                              <span className="text-[10px] text-gray-300 dark:text-gray-600">—</span>
                            ) : (
                              <span className="text-[10px] text-gray-300 dark:text-gray-600">Sem telefone</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Superclientes */}
          {metrics.superClients.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Crown size={16} className="text-amber-500" />
                Superclientes
              </h3>
              <div className="space-y-1">
                {metrics.superClients.map((client, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                        i === 1 ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' :
                        i === 2 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                        'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                      }`}>
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{client.name}</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">{client.email}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(client.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw logs */}
          <details className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <summary className="px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-xs font-medium text-gray-400 dark:text-gray-500">
              Logs brutos ({logs.length})
            </summary>
            <div className="px-5 pb-4 space-y-2 max-h-[400px] overflow-y-auto">
              {logs.slice(0, 30).map(log => (
                <details key={log.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                  <summary className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-[11px] flex items-center gap-3">
                    <span className="text-gray-400 dark:text-gray-500 font-mono">{new Date(log.received_at).toLocaleString('pt-BR')}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      log.payload?.payload?.type === 'order_payment' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                      log.payload?.payload?.type === 'abandoned_cart' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                      'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    }`}>
                      {log.payload?.payload?.type || 'unknown'}
                    </span>
                  </summary>
                  <pre className="px-3 py-2 text-[10px] text-gray-500 dark:text-gray-400 font-mono overflow-x-auto border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───
export default function InternoBluetick() {
  const { eventId } = useParams();
  if (eventId) return <EventDashboard eventId={eventId} />;
  return <EventSelector />;
}
