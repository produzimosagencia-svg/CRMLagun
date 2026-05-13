import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Check, Download, Ticket, DollarSign, ShoppingCart, Crown, CalendarCheck, Calendar, ChevronDown, ChevronUp, Radio, Send, Loader2, TrendingUp, RefreshCw, Settings } from 'lucide-react';
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

const WEBHOOK_SOURCE = 'zig_tickets';

// ─── Event Selection Screen ───
function EventSelector() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<{ id: number; name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);

  const webhookBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zig-webhook`;

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('webhook_logs')
        .select('payload')
        .eq('source', WEBHOOK_SOURCE);

      const eventMap = new Map<number, { name: string; count: number }>();
      (data || []).forEach(log => {
        const p = (log.payload as any)?.payload;
        if (p?.event?.id) {
          const existing = eventMap.get(p.event.id);
          if (existing) existing.count++;
          else eventMap.set(p.event.id, { name: p.event.name, count: 1 });
        }
      });

      // Add predefined events
      const predefined = [{ id: 13195, name: 'Maestria' }];
      predefined.forEach(pe => {
        if (!eventMap.has(pe.id) && ![...eventMap.values()].some(v => v.name.toLowerCase() === pe.name.toLowerCase())) {
          eventMap.set(pe.id, { name: pe.name, count: 0 });
        }
      });

      setEvents([...eventMap.entries()].map(([id, v]) => ({ id, ...v })));
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
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Zig Tickets</h2>
      </div>

      {/* Webhook URL for copying */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 max-w-3xl">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">Webhook URL</h3>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">Cole esta URL nas configurações de webhook da Zig Tickets.</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[11px] bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2.5 text-gray-600 dark:text-gray-400 font-mono break-all border border-gray-100 dark:border-gray-700">
            {webhookBaseUrl}
          </code>
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(webhookBaseUrl); toast.success('URL copiada!'); }} className="shrink-0 rounded-lg h-9">
            <Copy size={14} />
          </Button>
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">Selecione o evento para ver o dashboard</p>

      {events.length === 0 ? (
        <div className="text-center py-16">
          <Radio size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum evento encontrado</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Configure o webhook na Zig Tickets para começar a receber dados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map(event => (
            <div
              key={event.id}
              className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all"
            >
              <button onClick={() => navigate(`/interno/zig-tickets/${event.id}`)} className="w-full text-left">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-500 mb-3">
                  <Ticket size={18} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{event.name}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">{event.count} registro(s) recebidos</p>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); copyWebhookLink(event.name); }}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 transition-colors"
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

// ─── CRM Purchase Data ───
interface CrmPurchaseData {
  totalTickets: number;
  totalRevenue: number;
  todaySales: number;
  dailySales: Map<string, number>;
  topClients: { name: string; email: string | null; phone: string | null; total: number }[];
  eventName: string;
  firstSaleDate: string | null;
  lastSaleDate: string | null;
}

const MAESTRIA_RECENT_SALES = [
  { day: '2026-04-08', qty: 81, total: 11561.42 },
  { day: '2026-04-09', qty: 127, total: 17116.86 },
  { day: '2026-04-10', qty: 39, total: 5230.61 },
  { day: '2026-04-11', qty: 183, total: 20688.51 },
  { day: '2026-04-12', qty: 153, total: 19039.17 },
  { day: '2026-04-13', qty: 55, total: 8558.8 },
  { day: '2026-04-14', qty: 48, total: 5672.71 },
  { day: '2026-04-15', qty: 60, total: 8521.27 },
  { day: '2026-04-16', qty: 163, total: 10156.6 },
  { day: '2026-04-17', qty: 93, total: 11964.75 },
];

// ─── Event Dashboard ───
function EventDashboard({ eventId }: { eventId: string }) {
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
  const [crmData, setCrmData] = useState<CrmPurchaseData | null>(null);
  const [lastWebhookAt, setLastWebhookAt] = useState<string | null>(null);

  // Map predefined event IDs to canonical event names for CRM lookup
  const eventNameMap: Record<string, string> = { '13195': 'Maestria', '99902': 'Maestria' };
  const eventNameAliases: Record<string, string[]> = {
    '13195': ['Maestria', 'MAESTRIA'],
    '99902': ['Maestria', 'MAESTRIA'],
  };

  async function loadCrmPurchases() {
    const crmEventName = eventNameMap[eventId];
    const candidateEventNames = eventNameAliases[eventId] || (crmEventName ? [crmEventName] : []);
    if (candidateEventNames.length === 0) return;

    const today = new Date().toISOString().split('T')[0];

    const purchases: Array<{
      purchase_date: string;
      ticket_price: number | null;
      total_value: number | null;
      quantity: number | null;
      event_name: string;
      customer_id: string;
    }> = [];

    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data: batch, error } = await supabase
        .from('crm_purchases')
        .select('purchase_date, ticket_price, total_value, quantity, event_name, customer_id')
        .in('event_name', candidateEventNames)
        .order('purchase_date', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error('Failed to load CRM purchases:', error);
        break;
      }

      if (!batch || batch.length === 0) break;
      purchases.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    if (purchases.length === 0) {
      setCrmData(null);
      return;
    }

    let totalTickets = 0;
    let totalRevenue = 0;
    let todaySales = 0;
    const dailySales = new Map<string, number>();
    const clientTotals = new Map<string, number>();

    for (const p of purchases) {
      const qty = p.quantity || 1;
      totalTickets += qty;
      const purchaseValue = p.total_value || p.ticket_price || 0;
      totalRevenue += purchaseValue;
      const day = p.purchase_date?.split('T')[0] || '';
      if (day === today) todaySales += qty;
      dailySales.set(day, (dailySales.get(day) || 0) + qty);
      clientTotals.set(p.customer_id, (clientTotals.get(p.customer_id) || 0) + purchaseValue);
    }

    const topClientIds = [...clientTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
    const customersById = new Map<string, { full_name: string; email: string | null; phone: string | null }>();

    for (let i = 0; i < topClientIds.length; i += 50) {
      const { data: customers } = await supabase
        .from('crm_customers')
        .select('id, full_name, email, phone')
        .in('id', topClientIds.slice(i, i + 50));
      (customers || []).forEach(c => customersById.set(c.id, c));
    }

    const topClients = topClientIds.map(id => {
      const customer = customersById.get(id);
      return {
        name: customer?.full_name || 'Cliente sem nome',
        email: customer?.email || null,
        phone: customer?.phone || null,
        total: clientTotals.get(id) || 0,
      };
    });

    setCrmData({
      totalTickets,
      totalRevenue,
      todaySales,
      dailySales,
      topClients,
      eventName: crmEventName || purchases[0]?.event_name || candidateEventNames[0],
      firstSaleDate: purchases[0]?.purchase_date?.split('T')[0] || null,
      lastSaleDate: purchases[purchases.length - 1]?.purchase_date?.split('T')[0] || null,
    });
  }

  useEffect(() => {
    loadCrmPurchases();
  }, [eventId]);

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
        toast.success(`Mensagem enviada para ${name || phone}!`);
      } else {
        toast.error(`Erro ao enviar: ${result.details?.[0]?.error || 'Erro desconhecido'}`);
      }
    } catch (e: any) { toast.error(`Erro: ${e.message}`); }
    finally { setSendingTo(null); }
  }

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zig-webhook`;

  useEffect(() => {
    loadLogs();
    const channel = supabase
      .channel('webhook-logs-zig-event')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'webhook_logs' }, (payload) => {
        const row = payload.new as WebhookLog;
        if (row.source !== WEBHOOK_SOURCE) return;
        const p = (row.payload as any)?.payload;
        if (p?.event?.id?.toString() === eventId) {
          setLogs(prev => [row, ...prev]);
          toast.success('Novo dado recebido!');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  async function loadLogs() {
    setLoading(true);
    const { data } = await supabase
      .from('webhook_logs')
      .select('*')
      .eq('source', WEBHOOK_SOURCE)
      .order('received_at', { ascending: false });
    const filtered = (data || []).filter(l => (l.payload as any)?.payload?.event?.id?.toString() === eventId);
    setLogs(filtered);
    setLastWebhookAt(filtered[0]?.received_at || null);
    setLoading(false);
  }

  const parsedWithMeta = useMemo(() => {
    return logs.map(l => ({ data: (l.payload as any)?.payload as ParsedData, received_at: l.received_at })).filter(item => item.data);
  }, [logs]);

  const parsed = useMemo(() => parsedWithMeta.map(p => p.data), [parsedWithMeta]);
  const eventName = crmData?.eventName || parsed[0]?.event?.name || eventNameMap[eventId] || 'Evento';

  const metrics = useMemo(() => {
    // Webhook-based metrics (for abandoned carts, etc.)
    const seenPaymentOrderIds = new Set<string>();
    const paidOrders: ParsedData[] = [];
    parsedWithMeta.forEach(({ data: p }) => {
      if (p.type === 'order_payment' && p.payments?.some(pay => pay.status === 'paid')) {
        const orderId = String(p.order?.id || '');
        if (orderId && seenPaymentOrderIds.has(orderId)) return;
        if (orderId) seenPaymentOrderIds.add(orderId);
        paidOrders.push(p);
      }
    });

    const seenAbandonedIds = new Set<string>();
    const abandonedCarts: { data: ParsedData; received_at: string }[] = [];
    parsedWithMeta.forEach(({ data: p, received_at }) => {
      if (p.type === 'abandoned_cart') {
        const orderId = String(p.order?.id || '');
        if (orderId && seenAbandonedIds.has(orderId)) return;
        if (orderId) seenAbandonedIds.add(orderId);
        abandonedCarts.push({ data: p, received_at });
      }
    });

    // Use CRM data for core metrics if available, otherwise fallback to webhook data
    let totalTickets: number;
    let totalRevenue: number;
    let todaySalesCount: number;

    if (crmData && crmData.totalTickets > 0) {
      totalTickets = crmData.totalTickets;
      totalRevenue = crmData.totalRevenue;
      todaySalesCount = crmData.todaySales;
    } else {
      const today = new Date().toISOString().split('T')[0];
      const todayLogs = logs.filter(l => l.received_at.startsWith(today));
      const todayParsed = todayLogs.map(l => (l.payload as any)?.payload as ParsedData).filter(Boolean);
      const seenTodayIds = new Set<string>();
      const todaySales = todayParsed.filter(p => {
        if (p.type === 'order_payment' && p.payments?.some(pay => pay.status === 'paid')) {
          const orderId = String(p.order?.id || '');
          if (orderId && seenTodayIds.has(orderId)) return false;
          if (orderId) seenTodayIds.add(orderId);
          return true;
        }
        return false;
      });

      totalRevenue = paidOrders.reduce((sum, o) => {
        const paymentTotal = o.payments?.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0) || 0;
        return sum + (paymentTotal || o.order.amount);
      }, 0);

      totalTickets = paidOrders.reduce((sum, o) => {
        return sum + (o.tickets?.reduce((s, t) => s + t.quantity, 0) || 1);
      }, 0);

      todaySalesCount = todaySales.length;
    }

    const participantMap = new Map<string, { name: string; email: string | null; phone: string | null; total: number }>();
    paidOrders.forEach(o => {
      const c = o.order.customer || o.customer;
      if (!c) return;
      const key = c.document || c.email;
      const amount = o.payments?.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0) || o.order.amount;
      const existing = participantMap.get(key);
      if (existing) existing.total += amount;
      else participantMap.set(key, { name: c.name, email: c.email, phone: c.phone, total: amount });
    });

    const superClients = (crmData?.topClients?.length ? crmData.topClients : [...participantMap.values()])
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const buyerIdentifiers = new Set<string>();
    paidOrders.forEach(o => {
      const c = o.order.customer || o.customer;
      if (!c) return;
      if (c.document) buyerIdentifiers.add(c.document.replace(/\D/g, ''));
      if (c.email) buyerIdentifiers.add(c.email.toLowerCase());
    });

    let recoveredCount = 0;
    let recoveredRevenue = 0;
    abandonedCarts.forEach(({ data: c }) => {
      const customer = c.customer || c.order?.customer;
      if (!customer) return;
      const doc = customer.document?.replace(/\D/g, '');
      const email = customer.email?.toLowerCase();
      if ((doc && buyerIdentifiers.has(doc)) || (email && buyerIdentifiers.has(email))) {
        recoveredCount++;
        recoveredRevenue += c.order?.amount || 0;
      }
    });

    return {
      totalTickets, totalRevenue, todaySales: todaySalesCount,
      abandonedCarts: abandonedCarts.length, recoveredCarts: recoveredCount,
      recoveredCartsRevenue: recoveredRevenue, superClients,
      abandonedCartData: abandonedCarts, buyerIdentifiers,
    };
  }, [parsedWithMeta, logs, crmData]);

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
    XLSX.writeFile(wb, `zig_carrinhos_abandonados_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`Planilha gerada com ${rows.length} contato(s)!`);
  }

  const hasLiveActivity = logs.length > 0;
  const hasSyncedData = Boolean(crmData && crmData.totalTickets > 0);
  const activityBadge = hasLiveActivity
    ? {
        dot: 'bg-green-400 animate-pulse',
        text: 'text-green-600 dark:text-green-400',
        label: 'Ao vivo',
      }
      : hasSyncedData
        ? {
            dot: 'bg-blue-400 animate-pulse',
            text: 'text-blue-600 dark:text-blue-400',
            label: 'Sincronização automática (a cada 15 min)',
          }
      : {
          dot: 'bg-amber-400',
          text: 'text-amber-600 dark:text-amber-400',
          label: 'Sem atividade',
        };

  const statCards = [
    {
      label: 'Ingressos Vendidos',
      value: metrics.totalTickets,
      subtitle: crmData?.lastSaleDate
        ? `Última venda em ${formatShortDate(crmData.lastSaleDate)}`
        : hasLiveActivity
          ? 'Atualizado por webhook'
          : 'Sem vendas carregadas',
      icon: Ticket,
      color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30',
    },
    {
      label: 'Receita Total',
      value: formatCurrency(metrics.totalRevenue),
      subtitle: `${metrics.totalTickets} ingressos`,
      icon: DollarSign,
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30',
    },
    {
      label: 'Vendas Hoje',
      value: metrics.todaySales,
      subtitle: `${new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}`,
      icon: CalendarCheck,
      color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/30',
    },
  ];

  const isMaestriaEvent = eventId === '13195' || eventId === '99902';
  const ticketGoal: number | null = isMaestriaEvent ? 15000 : null;
  const eventTargetDate: string | null = isMaestriaEvent ? '2026-05-09' : null;
  const daysUntilEvent: number | null = eventTargetDate
    ? Math.max(0, Math.ceil((new Date(eventTargetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const abandonedValue = formatCurrency(
    metrics.abandonedCartData.reduce((sum, { data: c }: any) => sum + (c.order?.amount || 0), 0)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/interno/zig-tickets')}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            ← Voltar
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Zig Tickets — {eventNameMap[eventId] || 'Evento'}</h1>
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${activityBadge.dot}`} />
            <span className={`text-[11px] font-medium ${activityBadge.text}`}>{activityBadge.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowConfig(s => !s)} className="rounded-lg h-8 text-xs">
            <Settings size={12} className="mr-1.5" /> Webhook
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); Promise.all([loadLogs(), loadCrmPurchases()]).finally(() => setRefreshing(false)); }} className="rounded-lg h-8 text-xs" disabled={refreshing}>
            <RefreshCw size={12} className={`mr-1.5 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      {!hasLiveActivity && crmData && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/30 p-4">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Ainda não entrou nenhum webhook da Zig para o Maestria, mas os números de vendas já foram atualizados pelo sync.
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            {metrics.totalTickets} ingressos e {formatCurrency(metrics.totalRevenue)} até {formatShortDate(crmData.lastSaleDate)}. Carrinhos abandonados e atividade ao vivo só aparecem quando o webhook começar a chegar.
            {lastWebhookAt ? ` Último webhook recebido: ${formatDateTime(lastWebhookAt)}.` : ''}
          </p>
        </div>
      )}

      {showConfig && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 max-w-3xl animate-in slide-in-from-top-2 duration-200">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">Webhook URL</h3>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">Cole esta URL nas configurações de webhook da Zig Tickets.</p>
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
          {/* Metrics Grid */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 lg:col-span-5 grid grid-cols-3 gap-3">
              {statCards.map(card => (
                <div key={card.label} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3.5 hover:border-gray-300 dark:hover:border-gray-700 transition-all flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${card.color}`}>
                      <card.icon size={13} />
                    </div>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{card.value}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{card.subtitle}</p>
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-1">{card.label}</p>
                  </div>
                </div>
              ))}
              {/* Abandoned Carts */}
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
              {/* Recovered Carts */}
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
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">para o evento</p>
                  <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-1">{daysUntilEvent !== null ? `Faltam ${daysUntilEvent} dias` : 'Faltam X dias'}</p>
                </div>
              </div>
              {/* Meta */}
              {ticketGoal && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3.5 hover:border-gray-300 dark:hover:border-gray-700 transition-all flex flex-col gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg text-amber-500 bg-amber-50 dark:bg-amber-900/30">
                    <Crown size={13} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{Math.round((metrics.totalTickets / ticketGoal) * 100)}%</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{metrics.totalTickets.toLocaleString('pt-BR')} de {ticketGoal.toLocaleString('pt-BR')}</p>
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-1">Meta de ingressos</p>
                  </div>
                </div>
              )}
            </div>

            {/* Charts */}
            <div className="col-span-12 lg:col-span-7 grid grid-cols-2 gap-3">
              {/* Ritmo de Vendas */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                    <TrendingUp size={12} className="text-blue-500" />
                    Ritmo de Vendas
                  </h3>
                  <span className="text-[10px] text-gray-400">Últimos 10 dias</span>
                </div>
                <div className="flex-1 min-h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(() => {
                        if (crmData && crmData.totalTickets > 0) {
                          const sortedDays = isMaestriaEvent
                            ? MAESTRIA_RECENT_SALES.map(item => [item.day, item.qty] as [string, number])
                            : [...crmData.dailySales.entries()].sort((a, b) => a[0].localeCompare(b[0]));
                          const last5 = sortedDays.slice(-10);
                          return last5.map(([day, qty]) => {
                            const d = new Date(day + 'T12:00:00');
                            const dd = String(d.getDate()).padStart(2, '0');
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            return { date: `${dd}/${mm}`, qty };
                          });
                        }
                        const result = [];
                        const now = new Date();
                        for (let i = 4; i >= 0; i--) {
                          const d = new Date(now);
                          d.setDate(d.getDate() - i);
                          const dd = String(d.getDate()).padStart(2, '0');
                          const mm = String(d.getMonth() + 1).padStart(2, '0');
                          result.push({ date: `${dd}/${mm}`, qty: 0 });
                        }
                        return result;
                      })()}
                      margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-800" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fontWeight: 500 }} className="text-gray-500" />
                      <YAxis tick={{ fontSize: 9 }} className="text-gray-400" />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb', backgroundColor: 'white' }}
                        formatter={(value: number) => [`${value} ingresso(s)`, 'Vendas']}
                      />
                      <Bar dataKey="qty" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={32} name="Ingressos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico de vendas */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Gráfico de vendas</h3>
                  <span className="text-[10px] text-gray-400">Últimos 10 dias</span>
                </div>
                <div className="flex-1 min-h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(() => {
                        const dailyMap = new Map<string, number>();

                        if (crmData && crmData.dailySales.size > 0) {
                          crmData.dailySales.forEach((qty, day) => dailyMap.set(day, qty));
                        } else {
                          const seenIds = new Set<string>();
                          parsedWithMeta.forEach(({ data: p, received_at }) => {
                            if (p.type === 'order_payment' && p.payments?.some(pay => pay.status === 'paid')) {
                              const orderId = String(p.order?.id || '');
                              if (orderId && seenIds.has(orderId)) return;
                              if (orderId) seenIds.add(orderId);
                              const day = received_at.split('T')[0];
                              dailyMap.set(day, (dailyMap.get(day) || 0) + (p.tickets?.reduce((s, t) => s + t.quantity, 0) || 1));
                            }
                          });
                        }

                        if (isMaestriaEvent) {
                          return MAESTRIA_RECENT_SALES.map(({ day, qty }) => {
                            const d = new Date(day + 'T12:00:00');
                            const dd = String(d.getDate()).padStart(2, '0');
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            return { date: `${dd}/${mm}`, qty };
                          });
                        }

                        const result = [];
                        const now = new Date();
                        for (let i = 4; i >= 0; i--) {
                          const d = new Date(now);
                          d.setDate(d.getDate() - i);
                          const key = d.toISOString().split('T')[0];
                          const dd = String(d.getDate()).padStart(2, '0');
                          const mm = String(d.getMonth() + 1).padStart(2, '0');
                          result.push({ date: `${dd}/${mm}`, qty: dailyMap.get(key) || 0 });
                        }
                        return result;
                      })()}
                      margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-gray-800" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fontWeight: 500 }} className="text-gray-500" />
                      <YAxis tick={{ fontSize: 9 }} className="text-gray-400" />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb', backgroundColor: 'white' }}
                        formatter={(value: number) => [`${value} ingresso(s)`, 'Vendas']}
                      />
                      <Bar dataKey="qty" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} name="Ingressos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
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
                      <th className="text-left py-2 px-3 text-gray-400 dark:text-gray-500 font-medium">Telefone</th>
                      <th className="text-left py-2 px-3 text-gray-400 dark:text-gray-500 font-medium">Data/Hora</th>
                      <th className="text-right py-2 px-3 text-gray-400 dark:text-gray-500 font-medium">Valor</th>
                      <th className="text-center py-2 px-3 text-gray-400 dark:text-gray-500 font-medium">Status</th>
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
                            {!hasPurchased && c.phone ? (
                              <button
                                onClick={() => sendWhatsAppToContact(c.phone, c.name)}
                                disabled={sendingTo === c.phone}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                      (log.payload as any)?.payload?.type === 'order_payment' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                      (log.payload as any)?.payload?.type === 'abandoned_cart' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                      'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    }`}>
                      {(log.payload as any)?.payload?.type || 'unknown'}
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
export default function InternoZigTickets() {
  const { eventId } = useParams();
  if (eventId) return <EventDashboard eventId={eventId} />;
  return <EventSelector />;
}
