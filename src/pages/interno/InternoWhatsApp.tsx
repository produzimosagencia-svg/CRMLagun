import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  MessageSquare, Phone, FileText, Send, DollarSign,
  RefreshCw, Upload, CheckCircle2, XCircle, AlertTriangle, Users, Plus, CalendarClock, Zap, BarChart3, ShoppingCart,
  Image as ImageIcon, Database, Search, FileSpreadsheet, UserMinus, ShieldX, FileDown
} from 'lucide-react';
import { toast } from 'sonner';
import { BarraIndicadores, CORES } from '@/components/interno/BarraIndicadores';
import { baixarRelatorioPdf } from '@/lib/relatorioPdf';
import { RelatorioDisparos } from '@/components/interno/RelatorioDisparos';
import { callWhatsappApi } from '@/lib/whatsappApi';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
}

interface Template {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  parameter_format?: 'NAMED' | 'POSITIONAL';
  components?: Array<{
    type?: string;
    text?: string;
    format?: string;
    buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string }>;
    example?: { header_handle?: string[]; body_text?: string[][] };
  }>;
}

interface Contact {
  name: string;
  phone: string;
}

interface AudienceOption {
  id: string;
  name: string;
  description: string;
  count: number;
  kind: 'group' | 'tag' | 'category' | 'event';
}

interface SendResult {
  to: string;
  name: string;
  status: string;
  error?: string;
}

interface StatusSummary {
  data: Array<Record<string, unknown>>;
  counts: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  generated_at: string;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID
  || (import.meta.env.VITE_SUPABASE_URL || '').match(/https?:\/\/([^.]+)\./)?.[1];
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const normalizeContactPhone = (value: string | null | undefined) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 12 ? digits : '';
};

const uniqueContacts = (rows: Contact[]) => {
  const byPhone = new Map<string, Contact>();
  rows.forEach((row) => {
    const phone = normalizeContactPhone(row.phone);
    if (!phone) return;
    const name = row.name?.trim() || 'Cliente';
    const current = byPhone.get(phone);
    if (!current || current.name === 'Cliente') byPhone.set(phone, { name, phone });
  });
  return [...byPhone.values()];
};

const parseContactsCsv = (text: string) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const split = (line: string) => line.split(/[,;\t]/).map((part) => part.trim().replace(/^"|"$/g, ''));
  const header = split(lines[0]).map((value) => value.toLowerCase());
  const phoneIndex = header.findIndex((value) => /telefone|whatsapp|celular|phone/.test(value));
  const nameIndex = header.findIndex((value) => /nome|name/.test(value));
  const hasHeader = phoneIndex >= 0 || nameIndex >= 0;
  const parsed: Contact[] = [];

  lines.slice(hasHeader ? 1 : 0).forEach((line, index) => {
    const parts = split(line);
    const resolvedPhoneIndex = phoneIndex >= 0 ? phoneIndex : (parts.length >= 2 ? 1 : 0);
    const phone = normalizeContactPhone(parts[resolvedPhoneIndex]);
    if (!phone) return;
    const resolvedNameIndex = nameIndex >= 0 ? nameIndex : (resolvedPhoneIndex === 0 ? -1 : 0);
    const name = resolvedNameIndex >= 0 ? parts[resolvedNameIndex] : `Contato ${index + 1}`;
    parsed.push({ name: name?.trim() || `Contato ${index + 1}`, phone });
  });

  return uniqueContacts(parsed);
};

// Rótulo/cor do status de um disparo (WhatsApp Cloud API).
function waStatusInfo(s: string | null | undefined) {
  switch ((s || 'sent').toLowerCase()) {
    case 'read': return { label: 'Lido', cls: 'bg-blue-500/10 text-blue-400' };
    case 'delivered': return { label: 'Entregue', cls: 'bg-emerald-500/10 text-emerald-400' };
    case 'failed': case 'error': case 'undelivered': return { label: 'Falhou', cls: 'bg-red-500/10 text-red-400' };
    case 'sent': return { label: 'Enviado', cls: 'bg-[#FFE14D]/10 text-[#FFE14D]' };
    default: return { label: s || 'Enviado', cls: 'bg-white/5 text-[#8F8A7C]' };
  }
}

function waFailureReason(rawPayload: unknown) {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload as Record<string, any> : {};
  const error = Array.isArray(payload.errors) ? payload.errors[0] : payload.error;
  if (!error || typeof error !== 'object') return '';
  const code = error.code ? `#${error.code}` : '';
  const detail = error.error_data?.details || error.message || error.title || '';
  return [code, detail].filter(Boolean).join(' · ');
}

// Autenticado via helper compartilhado (envia o access_token do usuário logado).
const callApi = (action: string, body?: unknown, timeoutMs?: number) =>
  callWhatsappApi(action, body, timeoutMs);

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const innerWebhookPayload = (value: unknown) => {
  const outer = asRecord(value);
  const nested = asRecord(outer.payload);
  return Object.keys(nested).length ? nested : outer;
};
const cartPayloadType = (payload: JsonRecord) => String(payload.type ?? payload.event_type ?? payload.status ?? '').toLowerCase();
const isAbandonedCart = (payload: JsonRecord) => {
  const type = cartPayloadType(payload);
  return type.includes('abandoned') || type.includes('carrinho');
};
const pickCartIdentity = (payload: JsonRecord, kind: 'phone' | 'email') => {
  const buyer = asRecord(payload.buyer); const customer = asRecord(payload.customer); const owner = asRecord(payload.owner); const order = asRecord(payload.order);
  const orderBuyer = asRecord(order.buyer); const orderCustomer = asRecord(order.customer);
  const values = kind === 'phone'
    ? [buyer.phone, buyer.cellphone, buyer.mobile, customer.phone, customer.cellphone, owner.phone, owner.cellphone, payload.phone, payload.cellphone, payload.mobile, orderBuyer.phone, orderCustomer.phone]
    : [buyer.email, customer.email, owner.email, payload.email, orderBuyer.email, orderCustomer.email];
  return values.find(value => typeof value === 'string' && value.trim())?.toString().trim() || '';
};
const cartEventId = (payload: JsonRecord) => {
  const order = asRecord(payload.order); const directEvent = asRecord(payload.event); const nestedEvent = Object.keys(directEvent).length ? directEvent : asRecord(order.event);
  return String(nestedEvent.id ?? payload.event_id ?? order.event_id ?? '');
};
const isCartSale = (payload: JsonRecord) => {
  if (isAbandonedCart(payload)) return false;
  const type = cartPayloadType(payload);
  return ['order', 'payment', 'paid', 'purchase', 'sale', 'ticket'].some(value => type.includes(value));
};

const countTemplateVariables = (template?: Template) => {
  if (!template?.components?.length) return 0;

  return template.components.reduce((maxCount, component) => {
    if (typeof component.text !== 'string') return maxCount;
    const variables = [...component.text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
      .map((match) => match[1].trim());
    const positional = variables
      .filter((variable) => /^\d+$/.test(variable))
      .map(Number);
    if (positional.length > 0) return Math.max(maxCount, ...positional);
    return Math.max(maxCount, variables.length);
  }, 0);
};

const templatePart = (template: Template | undefined, type: string) =>
  template?.components?.find((component) => component.type?.toUpperCase() === type);

const previewTemplateText = (value?: string) => (value || '')
  .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, variable) => {
    const normalized = String(variable).toLowerCase();
    return normalized.includes('nome') || normalized === '1' ? 'Guilherme' : `[${variable}]`;
  });

const templateCategoryLabel = (category?: string) =>
  String(category || '').toUpperCase() === 'UTILITY' ? 'Utilidade' : 'Marketing';

const optimizeTemplateImage = async (file: File): Promise<File> => {
  const metaLimit = 5 * 1024 * 1024;
  if (file.size <= metaLimit) return file;

  const bitmap = await createImageBitmap(file);
  const maxDimension = 2400;
  const initialScale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  let width = Math.max(1, Math.round(bitmap.width * initialScale));
  let height = Math.max(1, Math.round(bitmap.height * initialScale));
  let quality = 0.9;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível processar a imagem');
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    if (!blob) throw new Error('Não foi possível comprimir a imagem');
    if (blob.size <= metaLimit) {
      bitmap.close();
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
        type: 'image/jpeg',
      });
    }

    quality = Math.max(0.55, quality - 0.08);
    width = Math.max(1, Math.round(width * 0.85));
    height = Math.max(1, Math.round(height * 0.85));
  }

  bitmap.close();
  throw new Error('A imagem continua acima do limite da Meta após a otimização');
};

export default function InternoWhatsApp({ inicial = 'dashboard' }: { inicial?: 'dashboard' | 'status' }) {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingTotal, setSendingTotal] = useState(0);
  const [templateImageUrl, setTemplateImageUrl] = useState('');
  const [templateImageName, setTemplateImageName] = useState('');
  const [uploadingTemplateImage, setUploadingTemplateImage] = useState(false);
  const [sendResults, setSendResults] = useState<{ total: number; sent: number; errors: number; details: SendResult[] } | null>(null);
  const [step, setStep] = useState(1);
  const [view, setView] = useState<'dashboard' | 'create' | 'status'>(inicial);
  // Status virou item do menu: a rota manda na tela.
  useEffect(() => { setView(inicial); }, [inicial]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [apiStatusCounts, setApiStatusCounts] = useState<StatusSummary['counts'] | null>(null);
  const [apiStatusUpdatedAt, setApiStatusUpdatedAt] = useState('');
  // Contagem exata no banco — buscar as linhas e medir daria no máximo 1000
  // por causa do max_rows do PostgREST.
  const [disparos30d, setDisparos30d] = useState(0);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [recentDispatches, setRecentDispatches] = useState<any[]>([]);
  const [automationCampaigns, setAutomationCampaigns] = useState<any[]>([]);
  const [cartCampaignActive, setCartCampaignActive] = useState(false);
  const [cartStats, setCartStats] = useState({ abandoned: 0, recovered: 0 });
  const [contactMode, setContactMode] = useState<'crm' | 'csv' | 'exclusion'>('crm');
  const [audiences, setAudiences] = useState<AudienceOption[]>([]);
  const [audienceContacts, setAudienceContacts] = useState<Record<string, Contact[]>>({});
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
  const [audienceSearch, setAudienceSearch] = useState('');
  const [audiencesLoading, setAudiencesLoading] = useState(false);
  const [audiencesLoaded, setAudiencesLoaded] = useState(false);
  const [exclusionCsvContacts, setExclusionCsvContacts] = useState<Contact[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const exclusionFileRef = useRef<HTMLInputElement>(null);
  const excludedContacts = uniqueContacts(exclusionCsvContacts);
  const excludedPhoneSet = new Set(excludedContacts.map((contact) => normalizeContactPhone(contact.phone)));
  const effectiveContacts = contacts.filter((contact) => !excludedPhoneSet.has(normalizeContactPhone(contact.phone)));
  const excludedFromCurrentAudience = contacts.length - effectiveContacts.length;
  const selectedTemplateData = templates.find((tpl) => tpl.name === selectedTemplate);
  const templateRequiresImage = selectedTemplateData?.components?.some(
    (component) => component.type?.toUpperCase() === 'HEADER'
      && component.format?.toUpperCase() === 'IMAGE'
  ) ?? false;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [phonesRes, templatesRes] = await Promise.all([
        callApi('phone_numbers'),
        callApi('templates'),
      ]);
      if (phonesRes?.data) setPhoneNumbers(phonesRes.data);
      if (templatesRes?.data) setTemplates(templatesRes.data.filter((t: Template) => t.status === 'APPROVED'));
    } catch {
      toast.error('Erro ao carregar dados do WhatsApp');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const fetchAllRows = useCallback(async (table: string, columns: string) => {
    const rows: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from(table as any)
        .select(columns)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }, []);

  const loadCrmAudiences = useCallback(async (force = false) => {
    if (audiencesLoaded && !force) return;
    setAudiencesLoading(true);
    try {
      const [baseRows, customerRows, purchaseRows, categoryRows] = await Promise.all([
        fetchAllRows('base_crm', 'nome,telefone,eventos'),
        fetchAllRows('crm_customers', 'full_name,phone,last_event,tags'),
        fetchAllRows('crm_purchases', 'event_name,crm_customers(full_name,phone)'),
        fetchAllRows('base_crm_event_categories', 'event_name,categoria'),
      ]);

      const baseContacts = uniqueContacts([
        ...baseRows.map((row) => ({ name: row.nome, phone: row.telefone })),
        ...customerRows.map((row) => ({ name: row.full_name, phone: row.phone })),
      ]);
      const contactsByAudience: Record<string, Contact[]> = { 'crm:all': baseContacts };
      const eventRows = new Map<string, Contact[]>();
      baseRows.forEach((row) => {
        const contact = uniqueContacts([{ name: row.nome, phone: row.telefone }])[0];
        if (!contact || !Array.isArray(row.eventos)) return;
        row.eventos.forEach((rawEventName: unknown) => {
          const eventName = String(rawEventName || '').trim();
          if (!eventName) return;
          const key = `event:${eventName}`;
          eventRows.set(key, [...(eventRows.get(key) || []), contact]);
        });
      });
      customerRows.forEach((row) => {
        const contact = uniqueContacts([{ name: row.full_name, phone: row.phone }])[0];
        const eventName = String(row.last_event || '').trim();
        if (!contact || !eventName) return;
        const key = `event:${eventName}`;
        eventRows.set(key, [...(eventRows.get(key) || []), contact]);
      });
      purchaseRows.forEach((row) => {
        const customer = row.crm_customers || {};
        const contact = uniqueContacts([{ name: customer.full_name, phone: customer.phone }])[0];
        const eventName = String(row.event_name || '').trim();
        if (!contact || !eventName) return;
        const key = `event:${eventName}`;
        eventRows.set(key, [...(eventRows.get(key) || []), contact]);
      });
      eventRows.forEach((rows, key) => { contactsByAudience[key] = uniqueContacts(rows); });

      const tagRows = new Map<string, Contact[]>();
      customerRows.forEach((row) => {
        const contact = uniqueContacts([{ name: row.full_name, phone: row.phone }])[0];
        if (!contact || !Array.isArray(row.tags)) return;
        row.tags.forEach((rawTag: unknown) => {
          const tag = String(rawTag || '').trim();
          if (!tag) return;
          const key = `tag:${tag}`;
          tagRows.set(key, [...(tagRows.get(key) || []), contact]);
        });
      });
      tagRows.forEach((rows, key) => { contactsByAudience[key] = uniqueContacts(rows); });

      const categoryEvents = new Map<string, Set<string>>();
      categoryRows.forEach((row) => {
        const category = String(row.categoria || '').trim();
        const eventName = String(row.event_name || '').trim();
        if (!category || !eventName) return;
        if (!categoryEvents.has(category)) categoryEvents.set(category, new Set());
        categoryEvents.get(category)?.add(eventName);
      });
      const categoryContacts = new Map<string, Contact[]>();
      categoryEvents.forEach((eventNames, category) => {
        const key = `category:${category}`;
        const rows = [...eventNames].flatMap((eventName) => eventRows.get(`event:${eventName}`) || []);
        const contacts = uniqueContacts(rows);
        if (contacts.length > 0) {
          categoryContacts.set(key, contacts);
          contactsByAudience[key] = contacts;
        }
      });

      const tagOptions: AudienceOption[] = [...tagRows.entries()]
        .map(([id, rows]) => ({ id, name: id.slice(4), description: 'Público salvo por tag no CRM', count: uniqueContacts(rows).length, kind: 'tag' as const }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const categoryOptions: AudienceOption[] = [...categoryContacts.entries()]
        .map(([id, rows]) => ({ id, name: id.slice(9), description: 'Todos os contatos dos eventos desta categoria', count: rows.length, kind: 'category' as const }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const eventOptions: AudienceOption[] = [...eventRows.entries()]
        .map(([id, rows]) => ({ id, name: id.slice(6), description: 'Público de evento do CRM', count: uniqueContacts(rows).length, kind: 'event' as const }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setAudienceContacts(contactsByAudience);
      setAudiences([
        { id: 'crm:all', name: 'Base completa do CRM', description: 'Todos os contatos válidos da base Lagun', count: baseContacts.length, kind: 'group' },
        ...tagOptions,
        ...categoryOptions,
        ...eventOptions,
      ]);
      setAudiencesLoaded(true);
    } catch (error) {
      console.error('Erro ao carregar públicos do CRM:', error);
      toast.error('Não foi possível carregar os públicos do CRM');
    } finally {
      setAudiencesLoading(false);
    }
  }, [audiencesLoaded, fetchAllRows]);

  useEffect(() => {
    if (view === 'create' && step === 3) void loadCrmAudiences();
  }, [view, step, loadCrmAudiences]);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError('');
    try {
      const desde30d = new Date(Date.now() - 30 * 86400_000).toISOString();
      const [statusResult, campaignsResult, cartCampaignResult, cartLogsResult, total30d] = await Promise.all([
        callApi('status_summary') as Promise<StatusSummary>,
        supabase.from('whatsapp_automation_campaigns' as any).select('*').order('created_at', { ascending: false }),
        supabase.from('bt_auto_dispatch').select('enabled').eq('event_id', '00000000-0000-0000-0000-000000000000').maybeSingle(),
        supabase.from('webhook_logs').select('payload, received_at').eq('source', 'zig_tickets'),
        supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true })
          .eq('direction', 'outgoing').neq('channel', 'instagram').gte('timestamp', desde30d),
      ]);
      setDisparos30d(total30d.count ?? 0);
      if (campaignsResult.error) console.error('Erro ao carregar automações:', campaignsResult.error);
      setRecentDispatches(Array.isArray(statusResult.data) ? statusResult.data : []);
      setApiStatusCounts(statusResult.counts);
      setApiStatusUpdatedAt(statusResult.generated_at);
      setAutomationCampaigns(campaignsResult.data || []);
      setCartCampaignActive(Boolean(cartCampaignResult.data?.enabled));
      const logs = cartLogsResult.data || [];
      const saleKeys = new Set<string>();
      logs.forEach(log => {
        const payload = innerWebhookPayload(log.payload);
        if (!isCartSale(payload)) return;
        const eventId = cartEventId(payload); const phone = pickCartIdentity(payload, 'phone'); const email = pickCartIdentity(payload, 'email');
        if (phone) saleKeys.add(`${phone}|${eventId}`);
        if (email) saleKeys.add(`${email}|${eventId}`);
      });
      let abandoned = 0; let recovered = 0; const now = Date.now();
      logs.forEach(log => {
        const payload = innerWebhookPayload(log.payload);
        if (!isAbandonedCart(payload) || now - new Date(log.received_at).getTime() < 30 * 60_000) return;
        const eventId = cartEventId(payload); const phone = pickCartIdentity(payload, 'phone'); const email = pickCartIdentity(payload, 'email');
        const wasRecovered = Boolean((phone && saleKeys.has(`${phone}|${eventId}`)) || (email && saleKeys.has(`${email}|${eventId}`)));
        if (wasRecovered) recovered += 1; else abandoned += 1;
      });
      setCartStats({ abandoned, recovered });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível consultar a API do WhatsApp.';
      console.error('Erro ao carregar status da API do WhatsApp:', error);
      setDashboardError(message);
      toast.error(message);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Espelho ao vivo: cada envio gravado durante o disparo (INSERT) aparece na
  // hora, e as mudanças de status do WhatsApp (UPDATE: entregue/lido/falhou)
  // atualizam os badges em tempo real — sem precisar recarregar.
  useEffect(() => {
    const isTemplateDispatch = (m: any) => m?.direction === 'outgoing' && m?.message_type === 'template';
    const channel = supabase
      .channel('wa-dispatch-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' }, (payload) => {
        const m = payload.new as any;
        if (isTemplateDispatch(m)) setRecentDispatches(prev => (prev.some(d => d.id === m.id) ? prev : [m, ...prev].slice(0, 1000)));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_messages' }, (payload) => {
        const m = payload.new as any;
        if (isTemplateDispatch(m)) setRecentDispatches(prev => prev.map(d => (d.id === m.id ? { ...d, ...m } : d)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const togglePhone = (id: string) => {
    setSelectedPhones(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const deduplicated = parseContactsCsv(text);
      setContacts(deduplicated);
      if (deduplicated.length === 0) {
        toast.error('Nenhum contato válido encontrado. Use CSV com colunas: Nome, Telefone');
      } else {
        toast.success(`${deduplicated.length} contatos únicos carregados`);
      }
    };
    reader.readAsText(file);
  };

  const handleExclusionFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const parsed = parseContactsCsv(String(event.target?.result || ''));
      setExclusionCsvContacts(parsed);
      if (parsed.length === 0) toast.error('Nenhum telefone válido encontrado na planilha de exclusão');
      else toast.success(`${parsed.length} contatos adicionados à exclusão`);
    };
    reader.readAsText(file);
  };

  const toggleAudience = (id: string) => {
    setSelectedAudiences((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  // Seleção de público reflete na contagem imediatamente — o layout de tela
  // única mostra contatos e custo no topo, sem um passo de "aplicar".
  useEffect(() => {
    if (!selectedAudiences.length) return;
    setContacts(uniqueContacts(selectedAudiences.flatMap((id) => audienceContacts[id] || [])));
  }, [selectedAudiences, audienceContacts]);

  const applySelectedAudiences = () => {
    if (selectedAudiences.length === 0) {
      toast.error('Selecione pelo menos um público');
      return;
    }
    const combined = selectedAudiences.flatMap((id) => audienceContacts[id] || []);
    const deduplicated = uniqueContacts(combined);
    setContacts(deduplicated);
    const removed = combined.length - deduplicated.length;
    toast.success(`${deduplicated.length} contatos carregados${removed > 0 ? ` · ${removed} duplicados removidos` : ''}`);
  };

  const handleSend = async () => {
    if (!selectedPhones.length || !selectedTemplate || !effectiveContacts.length) return;
    if (templateRequiresImage && !templateImageUrl) {
      toast.error('Envie a imagem exigida pelo template antes de disparar');
      return;
    }
    setSending(true);
    setSendingTotal(effectiveContacts.length);
    setSendResults(null);
    setView('status');
    toast.info(`Disparo iniciado para ${effectiveContacts.length} contatos. Acompanhe o progresso em Status.`);
    try {
      const templateVariableCount = countTemplateVariables(selectedTemplateData);

      // Lotes menores mantêm cada execução abaixo do limite da Edge Function.
      // O painel permanece aberto e recebe cada INSERT/UPDATE em tempo real.
      const batchSize = 40;
      const aggregate: { total: number; sent: number; errors: number; details: SendResult[] } = {
        total: 0,
        sent: 0,
        errors: 0,
        details: [],
      };

      for (let offset = 0; offset < effectiveContacts.length; offset += batchSize) {
        const batch = effectiveContacts.slice(offset, offset + batchSize);
        const result = await callApi('send_bulk', {
          phone_number_id: selectedPhones[0],
          template_name: selectedTemplate,
          template_language: 'pt_BR',
          template_category: selectedTemplateData?.category || 'MARKETING',
          template_components: selectedTemplateData?.components ?? [],
          template_variable_count: templateVariableCount,
          template_parameter_format: selectedTemplateData?.parameter_format ?? 'POSITIONAL',
          header_image_url: templateRequiresImage ? templateImageUrl : undefined,
          tracking_campaign: selectedTemplateData?.components?.some((component) =>
            component.type?.toUpperCase() === 'BUTTONS' &&
            component.buttons?.some((button) => button.type?.toUpperCase() === 'URL' && button.url?.includes('{{1}}'))
          ) ? (() => {
            const name = selectedTemplate.toLowerCase();
            if (name.includes('carrinho')) return 'carrinho_abandonado';
            if (name.includes('anivers')) return 'aniversario';
            if (name.includes('estorno') || name.includes('reembolso')) return 'estornos';
            return 'disparo';
          })() : undefined,
          contacts: batch,
        }, 3 * 60_000);

        aggregate.total += result.total ?? batch.length;
        aggregate.sent += result.sent ?? 0;
        aggregate.errors += result.errors ?? 0;
        aggregate.details.push(...(result.details ?? []));
        setSendResults({ ...aggregate, details: [...aggregate.details] });
        await loadDashboard();
      }

      if (aggregate.sent > 0) toast.success(`${aggregate.sent} mensagens aceitas pela Meta. Acompanhe a entrega no painel.`);
      if (aggregate.errors > 0) toast.error(`${aggregate.errors} mensagens falharam`);
      await loadDashboard();
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      toast.error(aborted
        ? 'A tela perdeu a conexão com o disparo. Confira o progresso em Status antes de tentar novamente.'
        : `Erro ao enviar mensagens: ${error instanceof Error ? error.message : 'falha desconhecida'}`);
      await loadDashboard();
    } finally {
      setSending(false);
    }
  };

  const handleTemplateImageUpload = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Use uma imagem JPG ou PNG');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('A imagem original deve ter no máximo 20 MB');
      return;
    }

    setUploadingTemplateImage(true);
    setTemplateImageUrl('');
    setTemplateImageName(file.name);
    try {
      const optimizedFile = await optimizeTemplateImage(file);
      const extension = optimizedFile.type === 'image/png' ? 'png' : 'jpg';
      const path = `whatsapp-template-media/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from('design-attachments')
        .upload(path, optimizedFile, { contentType: optimizedFile.type, upsert: false });
      if (error) throw error;

      const { data } = supabase.storage.from('design-attachments').getPublicUrl(path);
      setTemplateImageUrl(data.publicUrl);
      toast.success(file.size > optimizedFile.size
        ? 'Imagem otimizada, enviada e link gerado'
        : 'Imagem enviada e link gerado');
    } catch (error) {
      console.error('Erro ao enviar imagem do template:', error);
      setTemplateImageName('');
      toast.error('Não foi possível enviar a imagem');
    } finally {
      setUploadingTemplateImage(false);
    }
  };

  const canAdvance = (s: number) => {
    if (s === 1) return selectedPhones.length > 0;
    if (s === 2) return !!selectedTemplate;
    if (s === 3) return effectiveContacts.length > 0;
    return false;
  };

  if (view === 'status') {
    // Normaliza o status do WhatsApp em rótulo/cor. Statuses da Cloud API:
    // sent → enviado, delivered → entregue, read → lido, failed → falhou.
    const statusInfo = (s: string | null) => {
      switch ((s || 'sent').toLowerCase()) {
        case 'read': return { label: 'Lido', cls: 'bg-blue-500/10 text-blue-400' };
        case 'delivered': return { label: 'Entregue', cls: 'bg-emerald-500/10 text-emerald-400' };
        case 'failed': case 'error': case 'undelivered': return { label: 'Falhou', cls: 'bg-red-500/10 text-red-400' };
        case 'sent': return { label: 'Enviado', cls: 'bg-[#FFE14D]/10 text-[#FFE14D]' };
        default: return { label: s || 'Enviado', cls: 'bg-white/5 text-[#8F8A7C]' };
      }
    };
    const failed = recentDispatches.filter((i) => ['failed', 'error', 'undelivered'].includes((i.status || '').toLowerCase()));
    const read = recentDispatches.filter((i) => (i.status || '').toLowerCase() === 'read').length;
    const delivered = recentDispatches.filter((i) => ['delivered', 'read'].includes((i.status || '').toLowerCase())).length;
    const counters = [
      { label: 'Total', value: apiStatusCounts?.total ?? recentDispatches.length, cls: 'text-white' },
      { label: 'Entregues', value: apiStatusCounts ? apiStatusCounts.delivered + apiStatusCounts.read : delivered, cls: 'text-emerald-400' },
      { label: 'Lidos', value: apiStatusCounts?.read ?? read, cls: 'text-blue-400' },
      { label: 'Falhas', value: apiStatusCounts?.failed ?? failed.length, cls: 'text-red-400' },
    ];
    return (
      <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden pb-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#25D366]" /><h1 className="text-lg font-bold text-[#FFE14D]">Status dos Disparos</h1></div>
            <p className="mt-1 text-sm text-[#8F8A7C]">Acompanhe o percurso de cada envio e identifique falhas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
          </div>
        </div>

        {dashboardError ? (
          <section className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4">
            <p className="text-sm font-semibold text-red-300">A API do WhatsApp não respondeu</p>
            <p className="mt-1 text-xs text-[#D5B8C5]">{dashboardError}</p>
          </section>
        ) : null}

        {sending && (
          <section className="flex items-center gap-3 rounded-xl border border-[#FFE14D]/25 bg-[#FFE14D]/[0.06] p-4">
            <RefreshCw className="h-5 w-5 shrink-0 animate-spin text-[#FFE14D]" />
            <div>
              <p className="text-sm font-semibold text-white">Disparo em andamento: {sendResults?.total ?? 0} de {sendingTotal} processados</p>
              <p className="mt-0.5 text-xs text-[#8F8A7C]">Os registros aparecem abaixo conforme a Meta aceita e atualiza cada mensagem.</p>
            </div>
          </section>
        )}

        {!sending && sendResults && (
          <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
            <p className="text-sm font-semibold text-white">Disparo concluído</p>
            <p className="mt-1 text-xs text-[#8F8A7C]">{sendResults.sent} aceitos pela Meta · {sendResults.errors} falhas de envio</p>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {counters.map((c) => <div key={c.label} className="rounded-xl border border-[#2A2822] bg-[#1A1916] p-4">
            <p className={`text-2xl font-bold ${c.cls}`}>{c.value}</p>
            <p className="mt-1 text-xs text-[#8F8A7C]">{c.label}</p>
          </div>)}
        </div>

        {failed.length > 0 && (
          <section className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4">
            <div className="mb-2 flex items-center gap-2"><AlertTriangle size={15} className="text-red-400" /><h2 className="text-sm font-bold text-white">Falhas no percurso ({failed.length})</h2></div>
            <div className="divide-y divide-white/5">
              {failed.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0"><p className="truncate text-xs font-medium text-white">{item.contact_name || item.phone}</p><p className="truncate text-[11px] text-[#8F8A7C]">{waFailureReason(item.raw_payload) || item.message_text || 'Falha informada pela Meta'}</p></div>
                <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">Falhou</span>
              </div>)}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-[#2A2822] bg-[#1A1916] p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-white">Histórico de envios</h2><BarChart3 size={17} className="text-[#FFE14D]" /></div>
          {dashboardLoading ? <div className="py-10 text-center text-sm text-[#8F8A7C]">Carregando...</div> : recentDispatches.length === 0 ? <div className="py-10 text-center text-sm text-[#8F8A7C]">Nenhum disparo registrado ainda.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/5 text-xs text-[#8F8A7C]">
                  <th className="px-3 py-2 text-left font-medium">Contato</th>
                  <th className="px-3 py-2 text-left font-medium">Mensagem</th>
                  <th className="px-3 py-2 text-center font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Data</th>
                </tr></thead>
                <tbody>
                  {recentDispatches.map((item) => { const si = statusInfo(item.status); return (
                    <tr key={item.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="px-3 py-2.5 text-xs text-white">{item.contact_name || item.phone}</td>
                      <td className="px-3 py-2.5 text-xs text-[#B8B2A6] max-w-[280px] truncate">{item.message_text || 'Template WhatsApp'}</td>
                      <td className="px-3 py-2.5 text-center"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${si.cls}`}>{si.label}</span></td>
                      <td className="px-3 py-2.5 text-right text-[11px] text-[#8F8A7C]">{new Date(item.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  if (view === 'dashboard') {
    const today = new Date().toDateString();
    const sentToday = recentDispatches.filter((item) => new Date(item.timestamp).toDateString() === today).length;
    const delivered = apiStatusCounts
      ? apiStatusCounts.delivered + apiStatusCounts.read
      : recentDispatches.filter((item) => ['delivered', 'read'].includes(item.status || '')).length;
    const birthdayCampaignActive = automationCampaigns.some((item) => item.trigger_type === 'birthday' && item.enabled);
    const activeCampaigns = Number(cartCampaignActive) + Number(birthdayCampaignActive);
    const marketingDispatches = recentDispatches.filter((item) => item.template_category !== 'UTILITY').length;
    const utilityDispatches = recentDispatches.filter((item) => item.template_category === 'UTILITY').length;
    const estimatedSpend = (marketingDispatches * 0.36) + (utilityDispatches * 0.06);
    const totalHistorico = apiStatusCounts?.total ?? recentDispatches.length;
    // Sem erro de sincronização e com contadores da API = conexão de pé.
    const apiConectada = Boolean(apiStatusCounts) && !dashboardError;

    const gerarPdfDisparos = async () => {
      setGerandoPdf(true);
      try {
        await baixarRelatorioPdf(
          <RelatorioDisparos
            periodo="últimos 30 dias"
            total={totalHistorico}
            total30d={disparos30d}
            entregues={delivered}
            lidas={apiStatusCounts?.read ?? 0}
            falhas={apiStatusCounts?.failed ?? 0}
            gasto={estimatedSpend}
            marketing={marketingDispatches}
            utilidade={utilityDispatches}
            apiConectada={apiConectada}
            linhas={recentDispatches.map((d) => ({
              id: String(d.id), contato: d.contact_name || d.phone, telefone: d.phone,
              status: d.status, texto: d.message_text, quando: d.timestamp, categoria: d.template_category,
            }))}
          />,
          'relatorio-disparos-lagun',
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Falha ao gerar o PDF');
      } finally {
        setGerandoPdf(false);
      }
    };
    const kpis = [
      { label: 'Disparos enviados', value: apiStatusCounts?.total ?? recentDispatches.length, subtitle: 'histórico da API', icon: Send, color: 'text-emerald-400 bg-emerald-500/10' },
      { label: 'Enviados hoje', value: sentToday, subtitle: 'templates disparados', icon: Zap, color: 'text-[#FFE14D] bg-[#FFE14D]/10' },
      { label: 'Entregues', value: delivered, subtitle: 'status confirmado', icon: CheckCircle2, color: 'text-blue-400 bg-blue-500/10' },
      { label: 'Carrinhos abandonados', value: cartStats.abandoned, subtitle: 'há mais de 30 minutos', icon: ShoppingCart, color: 'text-orange-400 bg-orange-500/10' },
      { label: 'Carrinhos recuperados', value: cartStats.recovered, subtitle: 'compra identificada depois', icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10' },
      { label: 'Automações ativas', value: activeCampaigns, subtitle: 'campanhas recorrentes', icon: CalendarClock, color: 'text-[#FFE14D] bg-[#FFE14D]/10' },
      { label: 'Gasto estimado', value: estimatedSpend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), subtitle: `${marketingDispatches} marketing · ${utilityDispatches} utilidade`, icon: DollarSign, color: 'text-cyan-400 bg-cyan-500/10' },
    ];
    return (
      <div className="space-y-6 pb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#25D366]" /><h1 className="text-lg font-bold text-[#FFE14D]">Disparos WhatsApp</h1></div>
            <p className="mt-1 text-sm text-[#8F8A7C]">Acompanhe os envios e mantenha campanhas automáticas ativas.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void gerarPdfDisparos()} disabled={gerandoPdf || dashboardLoading}
              className="gap-1.5 bg-[#FFE14D] font-semibold text-black shadow-[0_0_20px_rgba(255,225,77,.45)] hover:bg-[#FFEC8A]">
              {gerandoPdf ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              {gerandoPdf ? 'Gerando…' : 'Gerar PDF'}
            </Button>
            <Button size="sm" onClick={() => setView('create')} className="bg-[#25D366] text-white hover:bg-[#20BD5A]"><Plus className="mr-1.5 h-4 w-4" />Novo disparo</Button>
          </div>
        </div>

        {dashboardError ? (
          <section className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4">
            <p className="text-sm font-semibold text-red-300">Não foi possível sincronizar com a API do WhatsApp</p>
            <p className="mt-1 text-xs text-[#D5B8C5]">{dashboardError}</p>
          </section>
        ) : apiStatusCounts && (
          <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3">
            <p className="text-xs font-medium text-emerald-300">API conectada · última sincronização às {new Date(apiStatusUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
          </section>
        )}

        <BarraIndicadores
          titulo="WhatsApp Cloud API"
          subtitulo={apiStatusUpdatedAt ? `sincronizado às ${new Date(apiStatusUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'aguardando sincronização'}
          carregando={dashboardLoading}
          itens={[
            { label: 'Disparos enviados', valor: (apiStatusCounts?.total ?? recentDispatches.length).toLocaleString('pt-BR'), sub: 'histórico da API', cor: CORES.ouro, barra: 100 },
            { label: 'Últimos 30 dias', valor: disparos30d.toLocaleString('pt-BR'), sub: 'mensagens disparadas', cor: CORES.branco, barra: totalHistorico ? (disparos30d / totalHistorico) * 100 : 0 },
            { label: 'Gasto estimado', valor: estimatedSpend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), sub: `${marketingDispatches} marketing · ${utilityDispatches} utilidade`, cor: CORES.verde, barra: 72 },
            { label: 'API', valor: apiConectada ? 'Conectada' : 'Offline', sub: apiConectada ? 'pronta para disparar' : 'verifique a conexão', cor: apiConectada ? CORES.verde : '#F87171', barra: apiConectada ? 100 : 12 },
          ]}
        />

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(260px,0.85fr)]">
          <section className="min-w-0 rounded-xl border border-[#2A2822] bg-[#1A1916] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
                  <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>
                  Últimos disparos <span className="text-[10px] font-normal text-[#8F8A7C]">ao vivo</span>
                </h2>
                <p className="text-xs text-[#8F8A7C]">
                  {recentDispatches.length > 0
                    ? `${recentDispatches.filter((i) => i.status === 'sent').length} enviados · ${recentDispatches.filter((i) => ['delivered','read'].includes(i.status)).length} entregues · ${recentDispatches.filter((i) => ['failed','error','undelivered'].includes(i.status)).length} falhas`
                    : 'Envios por template registrados no WhatsApp'}
                </p>
              </div>
              <BarChart3 size={17} className="text-[#FFE14D]" />
            </div>
            {dashboardLoading ? <div className="py-10 text-center text-sm text-[#8F8A7C]">Carregando histórico...</div> : recentDispatches.length === 0 ? <div className="py-10 text-center text-sm text-[#8F8A7C]">Nenhum disparo registrado ainda.</div> : <div className="divide-y divide-white/5">
              {recentDispatches.slice(0, 8).map((item) => { const si = waStatusInfo(item.status); return <div key={item.id} className="flex min-w-0 items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-white">{item.contact_name || item.phone}</p><p className={`truncate text-[11px] ${['failed','error','undelivered'].includes(String(item.status || '').toLowerCase()) ? 'text-red-300' : 'text-[#8F8A7C]'}`}>{waFailureReason(item.raw_payload) || item.message_text || 'Template WhatsApp'}</p></div>
                <div className="shrink-0 text-right"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${si.cls}`}>{si.label}</span><p className="mt-1 text-[10px] text-[#8F8A7C]">{new Date(item.timestamp).toLocaleDateString('pt-BR')}</p></div>
              </div>; })}
            </div>}
          </section>

          <section className="min-w-0 rounded-xl border border-[#2A2822] bg-[#1A1916] p-4">
            <div className="mb-3"><h2 className="text-sm font-bold text-white">Campanhas automáticas</h2><p className="text-xs text-[#8F8A7C]">Automações configuradas diretamente no sistema</p></div>
            <div className="space-y-2">
              {[
                { name: 'Carrinho Abandonado', description: 'Recuperação automática de compras não concluídas', path: '/interno/whatsapp/carrinho-abandonado', icon: ShoppingCart, active: cartCampaignActive },
                { name: 'Aniversário', description: 'Desconto especial para quem faz aniversário', path: '/interno/whatsapp/aniversario', icon: CalendarClock, active: birthdayCampaignActive },
                { name: 'Rastreamento', description: 'Cliques e compras atribuídas aos links do WhatsApp', path: '/interno/whatsapp/rastreamento', icon: BarChart3, active: true },
              ].map((campaign) => (
                <Link key={campaign.name} to={campaign.path} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] p-3 transition-colors hover:border-[#FFE14D]/30 hover:bg-white/[0.06]">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFE14D]/10 text-[#FFE14D]"><campaign.icon size={15} /></div>
                    <div className="min-w-0"><p className="text-xs font-semibold text-white">{campaign.name}</p><p className="line-clamp-2 text-[11px] leading-4 text-[#8F8A7C]">{campaign.description}</p></div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${campaign.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-[#8F8A7C]'}`}>{campaign.active ? 'Ativa' : 'Configurar'}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ── Tela de criação do disparo ──────────────────────────────────────────
  // Layout de tela única (número + template à esquerda, públicos à direita e
  // prévia do celular ao lado), no formato usado no painel da Produzimos.
  // A camada de dados e o envio continuam sendo os do Lagun.
  const custoUnitario = selectedTemplateData?.category === 'UTILITY' ? 0.06 : 0.36;
  const custoEstimado = effectiveContacts.length * custoUnitario;
  // A API responde com os números quando está de pé; sem número conectado, offline.
  const apiOnline = phoneNumbers.length > 0;
  const totalDisparos = apiStatusCounts?.total ?? 0;
  const entregues = (apiStatusCounts?.delivered ?? 0) + (apiStatusCounts?.read ?? 0);
  const taxaEntrega = totalDisparos ? (entregues / totalDisparos) * 100 : 0;
  const taxaLeitura = entregues ? ((apiStatusCounts?.read ?? 0) / entregues) * 100 : 0;
  const nPct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`;
  const nBr = (v: number) => v.toLocaleString('pt-BR');
  const reaisBr = (v: number) => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  const passoAtual = !selectedPhones.length ? 1 : !selectedTemplate ? 2 : !effectiveContacts.length ? 3 : 4;
  const faltando = !selectedPhones.length ? { passo: 1, texto: 'Escolha um número' }
    : !selectedTemplate ? { passo: 2, texto: 'Escolha um template' }
    : templateRequiresImage && !templateImageUrl ? { passo: 2, texto: 'Envie a imagem do cabeçalho' }
    : !effectiveContacts.length ? { passo: 3, texto: 'Escolha um público' } : null;
  const corpoPrevia = previewTemplateText(templatePart(selectedTemplateData, 'BODY')?.text) || '';
  const nomePrevia = effectiveContacts[0]?.name?.split(' ')[0] || 'Luana';
  const botoesPrevia = selectedTemplateData?.components?.filter((c) => c.type?.toUpperCase() === 'BUTTONS').flatMap((c) => c.buttons || []) || [];

  const MiniKpi = ({ valor, rotulo, dica, cor }: { valor: string; rotulo: string; dica: string; cor: string }) => (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <strong className="shrink-0 font-display text-xl leading-none" style={{ color: cor }}>{valor}</strong>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold leading-tight">{rotulo}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{dica}</span>
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="text-xs text-muted-foreground">WhatsApp <span className="mx-1">›</span> Disparo</div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold leading-none tracking-tight">
            Disparo <span style={{ color: '#25D366' }}>WhatsApp</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Envie templates aprovados para públicos do CRM e acompanhe a entrega em tempo real.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setView('dashboard')}>← Painel</Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <span
            className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-semibold text-white"
            style={apiOnline
              ? { background: 'linear-gradient(135deg,#25D366,#128C7E)', boxShadow: '0 0 0 3px rgba(37,211,102,.2)' }
              : { background: 'linear-gradient(135deg,#EF4444,#B91C1C)', boxShadow: '0 0 0 3px rgba(239,68,68,.2)' }}
          >
            <span className="h-2 w-2 rounded-full bg-white" />
            {apiOnline ? 'API Online' : 'API Offline'}
          </span>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MiniKpi valor={nBr(totalDisparos)} rotulo="Disparos registrados" dica="últimos 30 dias" cor="#34D399" />
        <MiniKpi valor={nBr(entregues)} rotulo="Entregues" dica={`${nPct(taxaEntrega)} · ${nBr(apiStatusCounts?.read ?? 0)} lidas`} cor="#60A5FA" />
        <MiniKpi valor={nPct(taxaLeitura)} rotulo="Taxa de leitura" dica={taxaLeitura >= 58 ? 'acima da média (58%)' : 'abaixo da média (58%)'} cor="#C4B5FD" />
        <MiniKpi valor={nBr(apiStatusCounts?.failed ?? 0)} rotulo="Falhas" dica="números inválidos" cor="#F87171" />
        <MiniKpi valor={reaisBr(custoEstimado)} rotulo="Custo estimado" dica={`${nBr(effectiveContacts.length)} × R$ ${custoUnitario.toFixed(2).replace('.', ',')}`} cor="#FFE14D" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Painel principal */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          {/* Passos + totais */}
          <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border px-5 py-3">
            <div className="flex items-center gap-3">
              {['Número', 'Template', 'Público', 'Revisão'].map((rotulo, i) => {
                const n = i + 1;
                const estado = passoAtual === n ? 'atual' : passoAtual > n ? 'feito' : 'pendente';
                const alerta = faltando?.passo === n;
                return (
                  <div key={rotulo} className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-[13px]" style={{ color: alerta ? '#F87171' : estado === 'pendente' ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))', fontWeight: estado === 'atual' || alerta ? 600 : 500 }}>
                      <span className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold"
                        style={alerta ? { background: '#EF4444', color: '#fff' }
                          : estado === 'feito' ? { background: '#25D366', color: '#fff' }
                          : estado === 'atual' ? { background: '#FFE14D', color: '#111' }
                          : { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                        {alerta ? '!' : estado === 'feito' ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
                      </span>
                      <span className="flex flex-col leading-tight">
                        <span>{rotulo}</span>
                        {alerta && <span className="text-[10px] font-semibold text-red-400">{faltando.texto}</span>}
                      </span>
                    </div>
                    {i < 3 && <span className="hidden h-0.5 w-6 rounded-full xl:block" style={{ background: passoAtual > n ? '#25D366' : 'hsl(var(--border))' }} />}
                  </div>
                );
              })}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-5 whitespace-nowrap text-right">
              <div className="min-w-[80px]">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contatos</span>
                <strong className="block font-display text-lg leading-none">{nBr(effectiveContacts.length)}</strong>
              </div>
              <div className="min-w-[90px]">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Custo</span>
                <strong className="block font-display text-lg leading-none" style={{ color: '#FFE14D' }}>{reaisBr(custoEstimado)}</strong>
              </div>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 lg:grid-cols-2">
            {/* Número + templates */}
            <div className="flex min-h-0 flex-col border-border p-4 lg:border-r">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Número · {phoneNumbers.length}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {phoneNumbers.map((p) => {
                  const ativo = selectedPhones[0] === p.id;
                  return (
                    <button key={p.id} onClick={() => setSelectedPhones([p.id])}
                      className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-left transition-colors ${ativo ? 'border-[#25D366] bg-[#25D366]/10' : 'border-border hover:bg-muted/50'}`}>
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${ativo ? 'bg-[#25D366] text-white' : 'bg-[#25D366]/15 text-[#25D366]'}`}>
                        <MessageSquare className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-[13px] leading-tight">{p.verified_name || 'WhatsApp Business'}</strong>
                        <span className="block truncate text-[11px] text-muted-foreground">{p.display_phone_number}</span>
                      </span>
                    </button>
                  );
                })}
                {!phoneNumbers.length && <p className="text-sm text-muted-foreground">Nenhum número conectado.</p>}
              </div>

              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Templates aprovados · {templates.length}</p>
              <div className="mt-2 max-h-[340px] min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {templates.map((tpl) => {
                  const ativo = selectedTemplate === tpl.name;
                  const exigeImagem = tpl.components?.some((c) => c.type?.toUpperCase() === 'HEADER' && c.format?.toUpperCase() === 'IMAGE');
                  const utilidade = tpl.category === 'UTILITY';
                  return (
                    <button key={tpl.id || tpl.name} onClick={() => setSelectedTemplate(tpl.name)}
                      className={`flex w-full flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors ${ativo ? 'border-[#25D366] bg-[#25D366]/10' : 'border-border hover:bg-muted/50'}`}>
                      <span className="flex items-center justify-between gap-2">
                        <strong className="truncate text-sm">{tpl.name}</strong>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${utilidade ? 'bg-blue-500/15 text-blue-400' : 'bg-muted text-muted-foreground'}`}>
                          {utilidade ? 'Utilidade · R$ 0,06' : 'Marketing · R$ 0,36'}
                        </span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {previewTemplateText(templatePart(tpl, 'BODY')?.text) || 'Sem corpo de texto'}
                      </span>
                      {exigeImagem && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#FFE14D]">
                          <ImageIcon className="h-3 w-3" /> exige imagem no cabeçalho
                        </span>
                      )}
                    </button>
                  );
                })}
                {!templates.length && <p className="text-sm text-muted-foreground">Nenhum template aprovado na conta.</p>}
              </div>
            </div>

            {/* Públicos + listas */}
            <div className="flex min-h-0 flex-col overflow-y-auto p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Públicos do CRM</p>
                <span className="text-xs text-muted-foreground">
                  {selectedAudiences.length ? `${selectedAudiences.length} selecionado${selectedAudiences.length > 1 ? 's' : ''}` : 'escolha um ou mais'}
                </span>
              </div>
              {audiencesLoading ? (
                <div className="grid min-h-40 place-items-center"><RefreshCw className="h-5 w-5 animate-spin text-[#25D366]" /></div>
              ) : !audiences.length ? (
                <p className="mt-4 text-sm text-muted-foreground">Nenhum público disponível. Importe um CSV abaixo.</p>
              ) : (
                <div className="mt-2 grid max-h-[300px] gap-2 overflow-y-auto pr-1">
                  {audiences.map((a) => {
                    const ativo = selectedAudiences.includes(a.id);
                    return (
                      <button key={a.id}
                        onClick={() => setSelectedAudiences((atual) => (ativo ? atual.filter((x) => x !== a.id) : [...atual, a.id]))}
                        className={`flex min-w-0 items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-left transition-colors ${ativo ? 'border-[#FFE14D] bg-[#FFE14D]/10' : 'border-border hover:bg-muted/50'}`}>
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${ativo ? 'bg-[#FFE14D] text-black' : 'bg-muted text-muted-foreground'}`}>
                          <Users className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-[13px] leading-tight">{a.name}</strong>
                          <span className="block truncate text-[11px] text-muted-foreground">{a.description}</span>
                        </span>
                        <strong className="shrink-0 font-display text-sm leading-none">{nBr(a.count)}</strong>
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${ativo ? 'border-[#FFE14D] bg-[#FFE14D] text-black' : 'border-muted-foreground/30'}`}>
                          {ativo && <CheckCircle2 className="h-3 w-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              <input ref={exclusionFileRef} type="file" accept=".csv,.txt" onChange={handleExclusionFileUpload} className="hidden" />
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 hover:bg-muted/50">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Importar CSV{contacts.length && !selectedAudiences.length ? ` · ${nBr(contacts.length)}` : ''}
                </button>
                <button onClick={() => exclusionFileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 hover:bg-muted/50">
                  <UserMinus className="h-3.5 w-3.5" /> CSV de exclusão{exclusionCsvContacts.length ? ` · ${nBr(exclusionCsvContacts.length)}` : ''}
                </button>
                {exclusionCsvContacts.length > 0 && (
                  <button onClick={() => setExclusionCsvContacts([])} className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-muted-foreground">limpar</button>
                )}
              </div>
              {excludedFromCurrentAudience > 0 && (
                <p className="mt-2 text-[11px] text-red-400">−{nBr(excludedFromCurrentAudience)} contatos removidos pela lista de exclusão</p>
              )}

              {templateRequiresImage && (
                <div className="mt-3 rounded-xl border border-[#FFE14D]/40 bg-[#FFE14D]/5 p-3">
                  <p className="text-xs font-semibold">Este template exige imagem no cabeçalho</p>
                  <input type="file" accept="image/*" onChange={(e) => void handleTemplateImageUpload(e.target.files?.[0])} className="mt-2 w-full text-xs" />
                  {uploadingTemplateImage && <p className="mt-1 text-[11px] text-muted-foreground">Enviando imagem…</p>}
                  {templateImageUrl && <p className="mt-1 text-[11px] text-emerald-400">Imagem pronta: {templateImageName}</p>}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Prévia no celular */}
        <aside className="flex flex-col items-center">
          <div className="flex w-full max-w-[340px] flex-col rounded-[34px] border-4 border-[#0A0A0F] bg-[#0A0A0F] p-2 shadow-2xl">
            <div className="flex items-center gap-2 rounded-t-[26px] bg-[#075E54] px-3 py-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#25D366] text-white"><MessageSquare className="h-4 w-4" /></span>
              <span className="min-w-0">
                <strong className="block truncate text-xs text-white">{phoneNumbers.find((p) => p.id === selectedPhones[0])?.verified_name || 'Lagun'}</strong>
                <span className="block text-[10px] text-white/70">Conta comercial</span>
              </span>
            </div>
            <div className="min-h-[360px] flex-1 space-y-2 rounded-b-[26px] p-3"
              style={{ background: '#ECE5DD', backgroundImage: 'radial-gradient(rgba(0,0,0,.05) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
              <p className="mx-auto w-fit rounded-md bg-[#FDF4C3] px-2 py-1 text-center text-[9px] text-[#5B5443]">
                🔒 As mensagens são protegidas com criptografia de ponta a ponta.
              </p>
              {selectedTemplate ? (
                <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#DCF8C6] px-3 py-2 shadow-sm">
                  {templateImageUrl && <img src={templateImageUrl} alt="" className="mb-2 w-full rounded" />}
                  <p className="whitespace-pre-wrap text-[11px] leading-snug text-[#111]">
                    {corpoPrevia.replace(/\{\{\s*1\s*\}\}/, nomePrevia).replace(/\{\{[^}]+\}\}/g, '—') || 'Template sem corpo de texto.'}
                  </p>
                  {botoesPrevia.map((b, i) => (
                    <span key={i} className="mt-1.5 block rounded border-t border-black/10 pt-1.5 text-center text-[11px] font-medium text-[#0B84FF]">{b.text}</span>
                  ))}
                </div>
              ) : (
                <p className="mx-auto mt-6 w-fit rounded-lg bg-white px-3 py-2 text-[11px] text-muted-foreground shadow-sm">
                  Selecione um template para ver a mensagem.
                </p>
              )}
            </div>
          </div>

          <Button
            onClick={handleSend}
            disabled={sending || uploadingTemplateImage || Boolean(faltando)}
            size="lg"
            className="mt-3 w-full max-w-[340px] bg-[#25D366] text-white hover:bg-[#20BD5A]"
          >
            {sending
              ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Enviando…</>
              : <><Send className="mr-2 h-4 w-4" />Disparar {effectiveContacts.length ? nBr(effectiveContacts.length) : ''}</>}
          </Button>
          {faltando && <p className="mt-1.5 text-[11px] text-red-400">{faltando.texto}</p>}
        </aside>
      </div>
    </div>
  );
}
