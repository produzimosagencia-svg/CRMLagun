import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  MessageSquare, Phone, FileText, Send, DollarSign,
  RefreshCw, Upload, CheckCircle2, XCircle, AlertTriangle, Users, Plus, CalendarClock, Zap, BarChart3, ShoppingCart,
  Image as ImageIcon, Database, Search, FileSpreadsheet, UserMinus, ShieldX
} from 'lucide-react';
import { toast } from 'sonner';
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
    case 'sent': return { label: 'Enviado', cls: 'bg-[#E8C766]/10 text-[#E8C766]' };
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

export default function InternoWhatsApp() {
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
  const [view, setView] = useState<'dashboard' | 'create' | 'status'>('dashboard');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [apiStatusCounts, setApiStatusCounts] = useState<StatusSummary['counts'] | null>(null);
  const [apiStatusUpdatedAt, setApiStatusUpdatedAt] = useState('');
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
      const [statusResult, campaignsResult, cartCampaignResult, cartLogsResult] = await Promise.all([
        callApi('status_summary') as Promise<StatusSummary>,
        supabase.from('whatsapp_automation_campaigns' as any).select('*').order('created_at', { ascending: false }),
        supabase.from('bt_auto_dispatch').select('enabled').eq('event_id', '00000000-0000-0000-0000-000000000000').maybeSingle(),
        supabase.from('webhook_logs').select('payload, received_at').eq('source', 'zig_tickets'),
      ]);
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
        case 'sent': return { label: 'Enviado', cls: 'bg-[#E8C766]/10 text-[#E8C766]' };
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
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#25D366]" /><h1 className="text-lg font-bold text-[#E8C766]">Status dos Disparos</h1></div>
            <p className="mt-1 text-sm text-[#8F8A7C]">Acompanhe o percurso de cada envio e identifique falhas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadDashboard} className="border-white/10 bg-white/5 text-[#D8D2C7] hover:bg-white/10 hover:text-white"><RefreshCw className={`mr-1.5 h-4 w-4 ${dashboardLoading ? 'animate-spin' : ''}`} />Atualizar</Button>
            <Button variant="outline" size="sm" onClick={() => setView('dashboard')} className="border-white/10 bg-white/5 text-[#D8D2C7] hover:bg-white/10 hover:text-white">← Painel</Button>
          </div>
        </div>

        {dashboardError ? (
          <section className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4">
            <p className="text-sm font-semibold text-red-300">A API do WhatsApp não respondeu</p>
            <p className="mt-1 text-xs text-[#D5B8C5]">{dashboardError}</p>
          </section>
        ) : apiStatusCounts && (
          <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3">
            <p className="text-xs font-medium text-emerald-300">API sincronizada · {apiStatusCounts.total.toLocaleString('pt-BR')} disparos registrados{apiStatusUpdatedAt ? ` · ${new Date(apiStatusUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
          </section>
        )}

        {sending && (
          <section className="flex items-center gap-3 rounded-xl border border-[#E8C766]/25 bg-[#E8C766]/[0.06] p-4">
            <RefreshCw className="h-5 w-5 shrink-0 animate-spin text-[#E8C766]" />
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
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-white">Histórico de envios</h2><BarChart3 size={17} className="text-[#E8C766]" /></div>
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
    const kpis = [
      { label: 'Disparos enviados', value: apiStatusCounts?.total ?? recentDispatches.length, subtitle: 'histórico da API', icon: Send, color: 'text-emerald-400 bg-emerald-500/10' },
      { label: 'Enviados hoje', value: sentToday, subtitle: 'templates disparados', icon: Zap, color: 'text-[#E8C766] bg-[#E8C766]/10' },
      { label: 'Entregues', value: delivered, subtitle: 'status confirmado', icon: CheckCircle2, color: 'text-blue-400 bg-blue-500/10' },
      { label: 'Carrinhos abandonados', value: cartStats.abandoned, subtitle: 'há mais de 30 minutos', icon: ShoppingCart, color: 'text-orange-400 bg-orange-500/10' },
      { label: 'Carrinhos recuperados', value: cartStats.recovered, subtitle: 'compra identificada depois', icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10' },
      { label: 'Automações ativas', value: activeCampaigns, subtitle: 'campanhas recorrentes', icon: CalendarClock, color: 'text-[#E8C766] bg-[#E8C766]/10' },
      { label: 'Gasto estimado', value: estimatedSpend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), subtitle: `${marketingDispatches} marketing · ${utilityDispatches} utilidade`, icon: DollarSign, color: 'text-cyan-400 bg-cyan-500/10' },
    ];
    return (
      <div className="space-y-6 pb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#25D366]" /><h1 className="text-lg font-bold text-[#E8C766]">Disparos WhatsApp</h1></div>
            <p className="mt-1 text-sm text-[#8F8A7C]">Acompanhe os envios e mantenha campanhas automáticas ativas.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadDashboard} className="border-white/10 bg-white/5 text-[#D8D2C7] hover:bg-white/10 hover:text-white"><RefreshCw className={`mr-1.5 h-4 w-4 ${dashboardLoading ? 'animate-spin' : ''}`} />Atualizar</Button>
            <Button variant="outline" size="sm" onClick={() => setView('status')} className="border-white/10 bg-white/5 text-[#D8D2C7] hover:bg-white/10 hover:text-white"><BarChart3 className="mr-1.5 h-4 w-4" />Status</Button>
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

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {kpis.map((kpi) => <div key={kpi.label} className="min-w-0 rounded-xl border border-[#2A2822] bg-[#1A1916] p-4">
            <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${kpi.color}`}><kpi.icon size={16} /></div>
            <p className="break-words text-2xl font-bold text-white">{kpi.value.toLocaleString('pt-BR')}</p>
            <p className="mt-1 text-xs font-medium text-[#D8D2C7]">{kpi.label}</p><p className="break-words text-[11px] text-[#8F8A7C]">{kpi.subtitle}</p>
          </div>)}
        </div>

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
              <BarChart3 size={17} className="text-[#E8C766]" />
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
                <Link key={campaign.name} to={campaign.path} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] p-3 transition-colors hover:border-[#E8C766]/30 hover:bg-white/[0.06]">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E8C766]/10 text-[#E8C766]"><campaign.icon size={15} /></div>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Plataforma de Disparos WhatsApp</h2>
          <p className="text-sm text-muted-foreground mt-1">Envie mensagens em massa pela API oficial</p>
        </div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setView('dashboard')}>← Painel</Button><Button variant="outline" size="sm" onClick={loadData} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button></div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: 'Número', icon: Phone },
          { n: 2, label: 'Template', icon: FileText },
          { n: 3, label: 'Contatos', icon: Users },
          { n: 4, label: 'Enviar', icon: Send },
        ].map(({ n, label, icon: Icon }) => (
          <button
            key={n}
            onClick={() => setStep(n)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              step === n
                ? 'bg-[#25D366] text-white shadow-lg'
                : n < step && canAdvance(n)
                ? 'bg-[#25D366]/15 text-green-400'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {n < step && canAdvance(n) && <CheckCircle2 className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>

      {/* Step 1: Select Phone Numbers */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-foreground">Selecione o(s) número(s) de envio</h3>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" /> Carregando números...
            </div>
          ) : phoneNumbers.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum número encontrado na conta.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {phoneNumbers.map((phone) => (
                <Card
                  key={phone.id}
                  className={`cursor-pointer border-border transition-transform hover:scale-[1.02] ${
                    selectedPhones.includes(phone.id)
                      ? 'ring-2 ring-[#25D366] bg-card'
                      : 'bg-card hover:bg-muted/30'
                  }`}
                >
                  <button onClick={() => togglePhone(phone.id)} className="w-full text-left p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{phone.display_phone_number}</p>
                        <p className="text-muted-foreground text-xs mt-1">{phone.verified_name}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {selectedPhones.includes(phone.id) && (
                          <CheckCircle2 className="w-5 h-5 text-[#25D366]" />
                        )}
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${
                          phone.quality_rating === 'GREEN'
                            ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'
                        }`}>
                          <span className={`w-2 h-2 rounded-full animate-pulse ${
                            phone.quality_rating === 'GREEN' ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          {phone.quality_rating === 'GREEN' ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>
                  </button>
                </Card>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={!canAdvance(1)}
              className="bg-[#25D366] hover:bg-[#20BD5A] text-white"
            >
              Próximo →
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Select Template */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h3 className="font-semibold text-foreground">Escolha o template de mensagem</h3>
            <p className="mt-1 text-sm text-muted-foreground">Veja o conteúdo antes de selecionar o modelo que será enviado.</p>
          </div>
          {templates.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum template aprovado encontrado.</p>
          ) : (
            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid content-start grid-cols-1 gap-3 md:grid-cols-2">
                {templates.map((tpl) => {
                  const selected = selectedTemplate === tpl.name;
                  const body = previewTemplateText(templatePart(tpl, 'BODY')?.text);
                  const hasImage = templatePart(tpl, 'HEADER')?.format?.toUpperCase() === 'IMAGE';
                  return (
                    <Card
                      key={tpl.id}
                      className={`overflow-hidden border transition-all ${selected ? 'border-[#25D366] bg-[#25D366]/5 shadow-[0_0_0_1px_rgba(37,211,102,.35)]' : 'border-border bg-card hover:border-[#25D366]/40 hover:bg-muted/20'}`}
                    >
                      <button
                        onClick={() => {
                          setSelectedTemplate(tpl.name);
                          setTemplateImageUrl('');
                          setTemplateImageName('');
                        }}
                        className="flex h-full w-full flex-col p-4 text-left"
                      >
                        <div className="flex w-full items-start justify-between gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/10 text-[#25D366]">
                            {hasImage ? <ImageIcon className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                          </div>
                          {selected ? <span className="flex items-center gap-1 rounded-full bg-[#25D366] px-2 py-1 text-[10px] font-bold text-white"><CheckCircle2 className="h-3 w-3" /> Selecionado</span> : <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-medium text-muted-foreground">{templateCategoryLabel(tpl.category)}</span>}
                        </div>
                        <p className="mt-3 break-words text-sm font-semibold text-foreground">{tpl.name.replaceAll('_', ' ')}</p>
                        <p className="mt-2 line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-muted-foreground">{body || 'Template sem texto de prévia disponível.'}</p>
                        <div className="mt-3 flex w-full items-center gap-2 border-t border-border pt-3 text-[10px] text-muted-foreground">
                          <span>{tpl.language?.toUpperCase() || 'PT_BR'}</span><span>•</span><span>{hasImage ? 'Com imagem' : 'Somente texto'}</span>
                        </div>
                      </button>
                    </Card>
                  );
                })}
              </div>

              <div className="xl:sticky xl:top-4 xl:self-start">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b141a] shadow-2xl">
                  <div className="flex items-center gap-3 bg-[#202c33] px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-sm font-bold text-white">LA</div>
                    <div><p className="text-sm font-semibold text-white">Lagun</p><p className="text-[10px] text-[#aebac1]">conta comercial</p></div>
                  </div>
                  <div className="min-h-[360px] bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[length:18px_18px] p-4">
                    {selectedTemplateData ? (() => {
                      const header = templatePart(selectedTemplateData, 'HEADER');
                      const body = previewTemplateText(templatePart(selectedTemplateData, 'BODY')?.text);
                      const footer = previewTemplateText(templatePart(selectedTemplateData, 'FOOTER')?.text);
                      const buttons = templatePart(selectedTemplateData, 'BUTTONS')?.buttons || [];
                      const imageHeader = header?.format?.toUpperCase() === 'IMAGE';
                      return <div className="ml-auto max-w-[305px] overflow-hidden rounded-lg rounded-tr-none bg-[#005c4b] shadow-lg">
                        {imageHeader && <div className="flex aspect-[1.91/1] items-center justify-center bg-[#123f39] text-[#8fb9b1]"><div className="text-center"><ImageIcon className="mx-auto h-8 w-8" /><p className="mt-1 text-[10px]">Imagem do template</p></div></div>}
                        <div className="px-3 pb-2 pt-2.5">
                          {header?.text && <p className="mb-1 text-sm font-bold text-white">{previewTemplateText(header.text)}</p>}
                          <p className="whitespace-pre-wrap text-[13px] leading-[1.35rem] text-white">{body || 'O conteúdo deste template não foi disponibilizado pela Meta.'}</p>
                          <div className="mt-1 flex items-end justify-between gap-3">
                            <span className="text-[10px] text-[#a7c8c2]">{footer}</span><span className="shrink-0 text-[9px] text-[#a7c8c2]">22:02 ✓✓</span>
                          </div>
                        </div>
                        {buttons.map((button, index) => <div key={`${button.text}-${index}`} className="border-t border-white/10 px-3 py-2 text-center text-xs font-medium text-[#53bdeb]">{button.text || 'Botão'}</div>)}
                      </div>;
                    })() : <div className="flex min-h-[320px] flex-col items-center justify-center text-center text-[#8696a0]"><MessageSquare className="h-10 w-10" /><p className="mt-3 text-sm font-medium">Selecione um template</p><p className="mt-1 max-w-[220px] text-xs">A prévia da mensagem aparecerá aqui.</p></div>}
                  </div>
                  {selectedTemplateData && <div className="border-t border-white/10 bg-[#202c33] px-4 py-3"><p className="truncate text-xs font-medium text-white">{selectedTemplateData.name}</p><p className="mt-0.5 text-[10px] text-[#aebac1]">{templateCategoryLabel(selectedTemplateData.category)} · {selectedTemplateData.language?.toUpperCase()}</p></div>}
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>← Voltar</Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!canAdvance(2)}
              className="bg-[#25D366] hover:bg-[#20BD5A] text-white"
            >
              Próximo →
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Upload Contacts */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-foreground">Escolha o público do disparo</h3>
            <p className="mt-1 text-sm text-muted-foreground">Use os públicos vivos do CRM ou importe uma lista externa.</p>
          </div>

          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1">
            <button
              onClick={() => setContactMode('crm')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${contactMode === 'crm' ? 'bg-[#25D366] text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Database className="h-4 w-4" /> Públicos do CRM
            </button>
            <button
              onClick={() => setContactMode('csv')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${contactMode === 'csv' ? 'bg-[#25D366] text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <FileSpreadsheet className="h-4 w-4" /> Importar CSV
            </button>
            <button
              onClick={() => setContactMode('exclusion')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${contactMode === 'exclusion' ? 'bg-red-500 text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <UserMinus className="h-4 w-4" /> Exclusão
            </button>
          </div>

          {contactMode === 'crm' ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={audienceSearch}
                    onChange={(event) => setAudienceSearch(event.target.value)}
                    placeholder="Buscar evento ou público..."
                    className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none focus:border-[#25D366]"
                  />
                </div>
                <Button variant="outline" onClick={() => void loadCrmAudiences(true)} disabled={audiencesLoading}>
                  <RefreshCw className={`mr-1.5 h-4 w-4 ${audiencesLoading ? 'animate-spin' : ''}`} /> Atualizar públicos
                </Button>
              </div>

              {audiencesLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Carregando públicos e removendo telefones inválidos...
                </div>
              ) : (
                <div className="max-h-[430px] space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-4">
                  {([
                    ['group', 'Bases e cadastros'],
                    ['tag', 'Públicos por tag'],
                    ['category', 'Categorias de eventos'],
                    ['event', 'Eventos do CRM'],
                  ] as const).map(([kind, label]) => {
                    const visible = audiences.filter((audience) => audience.kind === kind && audience.name.toLowerCase().includes(audienceSearch.toLowerCase()));
                    if (visible.length === 0) return null;
                    return <div key={kind}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {visible.map((audience) => {
                          const selected = selectedAudiences.includes(audience.id);
                          return <button
                            key={audience.id}
                            onClick={() => toggleAudience(audience.id)}
                            className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? 'border-[#25D366] bg-[#25D366]/10' : 'border-border bg-background/30 hover:border-[#25D366]/40'}`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{audience.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{audience.description}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              {selected && <CheckCircle2 className="mb-1 ml-auto h-4 w-4 text-[#25D366]" />}
                              <span className="text-xs font-semibold text-foreground">{audience.count.toLocaleString('pt-BR')}</span>
                            </div>
                          </button>;
                        })}
                      </div>
                    </div>;
                  })}
                </div>
              )}

              <div className="flex flex-col gap-2 rounded-lg border border-[#25D366]/20 bg-[#25D366]/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedAudiences.length} público(s) selecionado(s)</p>
                  <p className="text-xs text-muted-foreground">Novos contatos e eventos adicionados ao CRM entram automaticamente nestas listas.</p>
                </div>
                <Button onClick={applySelectedAudiences} disabled={selectedAudiences.length === 0 || audiencesLoading} className="bg-[#25D366] text-white hover:bg-[#20BD5A]">
                  <Users className="mr-1.5 h-4 w-4" /> Usar públicos selecionados
                </Button>
              </div>
            </div>
          ) : contactMode === 'csv' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Arquivo CSV com duas colunas: <strong>Nome</strong> e <strong>Telefone</strong> (com DDD, ex: 27999999999)</p>
              <div
                onClick={() => fileRef.current?.click()}
                className="cursor-pointer rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-[#25D366] hover:bg-[#25D366]/10"
              >
                <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-foreground">Clique para selecionar o arquivo CSV</p>
                <p className="mt-1 text-xs text-muted-foreground">ou arraste e solte aqui</p>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Público que não receberá o disparo</p>
                  <p className="mt-1 text-xs text-muted-foreground">A exclusão é aplicada pelo número de telefone, mesmo quando ele estiver com máscara ou sem o código +55.</p>
                </div>
              </div>

              <div
                onClick={() => exclusionFileRef.current?.click()}
                className="cursor-pointer rounded-xl border-2 border-dashed border-border p-6 text-center transition-colors hover:border-red-500 hover:bg-red-500/5"
              >
                <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Importar planilha de exclusão</p>
                <p className="mt-1 text-xs text-muted-foreground">CSV ou TXT com coluna Telefone, WhatsApp, Celular ou Phone</p>
                <input ref={exclusionFileRef} type="file" accept=".csv,.txt" onChange={handleExclusionFileUpload} className="hidden" />
              </div>

              {exclusionCsvContacts.length > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Planilha carregada</p>
                    <p className="text-xs text-muted-foreground">{exclusionCsvContacts.length.toLocaleString('pt-BR')} contatos para excluir</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setExclusionCsvContacts([]);
                      if (exclusionFileRef.current) exclusionFileRef.current.value = '';
                    }}
                    className="text-muted-foreground hover:text-red-400"
                  >
                    Limpar
                  </Button>
                </div>
              )}

              <div className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Lista total de exclusão</span><strong className="text-foreground">{excludedContacts.length.toLocaleString('pt-BR')}</strong></div>
                {contacts.length > 0 && <>
                  <div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">Removidos do público atual</span><strong className="text-red-400">{excludedFromCurrentAudience.toLocaleString('pt-BR')}</strong></div>
                  <div className="mt-2 flex justify-between gap-3 border-t border-border pt-2"><span className="text-muted-foreground">Destinatários finais</span><strong className="text-[#25D366]">{effectiveContacts.length.toLocaleString('pt-BR')}</strong></div>
                </>}
              </div>
            </div>
          )}

          {contacts.length > 0 && (
            <Card className="border-border bg-card">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-foreground font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#25D366]" />
                    {effectiveContacts.length} destinatários finais
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setContacts([]); if (fileRef.current) fileRef.current.value = ''; }}
                    className="text-muted-foreground hover:text-red-400"
                  >
                    Limpar
                  </Button>
                </div>
                {excludedFromCurrentAudience > 0 && <p className="mb-3 text-xs text-red-400">{contacts.length.toLocaleString('pt-BR')} selecionados · {excludedFromCurrentAudience.toLocaleString('pt-BR')} removidos pela exclusão</p>}
                <div className="max-h-48 overflow-auto space-y-1">
                  {effectiveContacts.slice(0, 50).map((c, i) => (
                    <div key={i} className="flex justify-between border-b border-border py-1 text-xs">
                      <span className="text-foreground">{c.name}</span>
                      <span className="font-mono text-muted-foreground">{c.phone}</span>
                    </div>
                  ))}
                  {effectiveContacts.length > 50 && (
                    <p className="pt-2 text-center text-xs text-muted-foreground">
                      ... e mais {effectiveContacts.length - 50} contatos
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>← Voltar</Button>
            <Button
              onClick={() => setStep(4)}
              disabled={!canAdvance(3)}
              className="bg-[#25D366] hover:bg-[#20BD5A] text-white"
            >
              Próximo →
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Send */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-foreground">Revisar e Enviar</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <div className="p-4">
                <Phone className="w-6 h-6 text-[#25D366] mb-2" />
                <p className="text-muted-foreground text-xs">Número de envio</p>
                <p className="text-foreground font-semibold text-sm mt-1">
                  {phoneNumbers.find(p => p.id === selectedPhones[0])?.display_phone_number || '-'}
                </p>
              </div>
            </Card>
            <Card className="border-border bg-card">
              <div className="p-4">
                <FileText className="w-6 h-6 text-orange-400 mb-2" />
                <p className="text-muted-foreground text-xs">Template</p>
                <p className="text-foreground font-semibold text-sm mt-1">{selectedTemplate}</p>
              </div>
            </Card>
            <Card className="border-border bg-card">
              <div className="p-4">
                <Users className="w-6 h-6 text-[#E8C766] mb-2" />
                <p className="text-muted-foreground text-xs">Contatos</p>
                <p className="text-foreground font-semibold text-sm mt-1">{effectiveContacts.length} destinatários</p>
              </div>
            </Card>
            <Card className="border-border bg-card">
              <div className="p-4">
                <DollarSign className="w-6 h-6 text-blue-400 mb-2" />
                <p className="text-muted-foreground text-xs">Estimativa de custo</p>
                {(() => {
                  const tpl = templates.find(t => t.name === selectedTemplate);
                  const isMarketing = !tpl || tpl.category === 'MARKETING';
                  const rate = isMarketing ? 0.36 : 0.06;
                  const total = effectiveContacts.length * rate;
                  return (
                    <>
                      <p className="text-foreground font-semibold text-sm mt-1">
                        R$ {total.toFixed(2).replace('.', ',')}
                      </p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {effectiveContacts.length} × R$ {rate.toFixed(2).replace('.', ',')} ({isMarketing ? 'Marketing' : 'Utilidade'})
                      </p>
                    </>
                  );
                })()}
              </div>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E8C766]/10 text-[#E8C766]">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">Imagem do template</p>
                    {templateRequiresImage && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                        Obrigatória neste template
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Envie um JPG ou PNG de até 20 MB. Se necessário, o sistema reduz automaticamente para o limite da Meta e gera o link público.
                  </p>

                  <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/10">
                    {uploadingTemplateImage ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploadingTemplateImage ? 'Enviando imagem…' : 'Selecionar imagem'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      disabled={uploadingTemplateImage}
                      onChange={(event) => {
                        void handleTemplateImageUpload(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>

                  {templateImageName && (
                    <p className="mt-2 truncate text-xs text-muted-foreground">{templateImageName}</p>
                  )}
                  {templateImageUrl && (
                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <img
                        src={templateImageUrl}
                        alt="Prévia do cabeçalho do template"
                        className="h-14 w-14 rounded-md object-cover"
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Link gerado
                        </p>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">{templateImageUrl}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Warning */}
          <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4 text-sm text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Atenção antes de disparar</p>
              <p className="mt-1">
                O envio será feito usando a API oficial do WhatsApp. Templates devem estar aprovados pela Meta.
                Disparos em massa podem levar alguns minutos dependendo da quantidade de contatos.
              </p>
            </div>
          </div>

          {/* Send Button */}
          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={() => setStep(3)}>← Voltar</Button>
            <Button
              onClick={handleSend}
              disabled={sending || uploadingTemplateImage || (templateRequiresImage && !templateImageUrl)}
              size="lg"
              className="bg-[#25D366] hover:bg-[#20BD5A] text-white px-8 shadow-lg"
            >
              {sending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Disparar {effectiveContacts.length} mensagens
                </>
              )}
            </Button>
          </div>

          {/* Results */}
          {sendResults && (
            <Card className="border-border bg-card">
              <div className="p-4">
                <h4 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                  <MessageSquare className="w-5 h-5 text-[#25D366]" />
                  Resultado do Disparo
                </h4>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{sendResults.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-400">{sendResults.sent}</p>
                    <p className="text-xs text-muted-foreground">Aceitos pela Meta</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-400">{sendResults.errors}</p>
                    <p className="text-xs text-muted-foreground">Erros</p>
                  </div>
                </div>
                {sendResults.errors > 0 && (
                  <div className="max-h-40 overflow-auto space-y-1">
                    {sendResults.details.filter(d => d.status === 'error').map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <span className="text-foreground">{d.name}</span>
                        <span className="font-mono text-muted-foreground">{d.to}</span>
                        <span className="text-red-400 ml-auto truncate max-w-[200px]">{d.error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
