import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { callWhatsappApi } from '@/lib/whatsappApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Download, ChevronRight, ArrowLeft, Users, Plus, Upload, Radio, RefreshCw, Crown, Heart, UserPlus, DollarSign, Loader2, Phone, MessageCircle, Send } from 'lucide-react';
import { CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from '@/types/crm';
import type { ClientClassification } from '@/types/crm';
import { formatPhone } from '@/lib/formatPhone';
import { toast } from 'sonner';
import CustomerDetailsModal from '@/components/interno/CustomerDetailsModal';

interface DashboardKPIs {
  total_customers: number;
  new_customers_30d: number;
  superclientes: number;
  fans: number;
  cac: number | null;
}

interface TopPerson {
  customer_id: string;
  full_name: string;
  phone: string | null;
  total_spent: number;
  event_count: number;
  event_names?: string[];
}

const EXCLUDED_NAMES = [
  'pazito pdv',
  'gleyson santos brune',
  'tríade entretenimento',
  'triade entretenimento',
  'isis pecly baptista',
  'maves shopping moxuara',
  'mavericks vila velha',
  'clauber morais',
];

interface EventRecord {
  id: string;
  name: string;
  avatar_url: string | null;
  event_date: string | null;
  webhook_url: string | null;
  api_token: string | null;
  platform: string;
  status: string;
}

interface EventSummary extends EventRecord {
  totalSales: number;
  totalRevenue: number;
  uniqueCustomers: number;
}

interface CustomerRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  classification: ClientClassification;
  ltv: number;
  previous_purchases_count: number;
  ticket_type: string | null;
  total_value: number;
  purchase_date: string;
}

type CreateStep = null | 'choose' | 'import' | 'live';

export default function InternoEventos() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [topFans, setTopFans] = useState<TopPerson[]>([]);
  const [topSuperclientes, setTopSuperclientes] = useState<TopPerson[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [loadingAllCustomers, setLoadingAllCustomers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState('');
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [search, setSearch] = useState('');
  const [createStep, setCreateStep] = useState<CreateStep>(null);
  const [detailsCustomerId, setDetailsCustomerId] = useState<string | null>(null);

  // WhatsApp contact
  const [contactTarget, setContactTarget] = useState<TopPerson | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [apiPhones, setApiPhones] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateLang, setTemplateLang] = useState('pt_BR');
  const [selectedPhoneId, setSelectedPhoneId] = useState('');
  const [sendingContact, setSendingContact] = useState(false);

  // Create event form
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newWebhook, setNewWebhook] = useState('');
  const [newApiToken, setNewApiToken] = useState('');
  const [newPlatform, setNewPlatform] = useState('blueticket');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null);
  const [revenue, setRevenue] = useState('');

  const [showAllNeighborhoods, setShowAllNeighborhoods] = useState(false);

  const topCities = useMemo(() => {
    const map = new Map<string, number>();
    allCustomers.forEach(c => { if (c.city) map.set(c.city, (map.get(c.city) || 0) + 1); });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [allCustomers]);

  const allNeighborhoods = useMemo(() => {
    const map = new Map<string, number>();
    allCustomers.forEach(c => { if (c.neighborhood) map.set(c.neighborhood, (map.get(c.neighborhood) || 0) + 1); });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [allCustomers]);

  const topNeighborhoods = useMemo(() => allNeighborhoods.slice(0, 5), [allNeighborhoods]);

  useEffect(() => {
    loadKpis();
    loadTopLists();
    loadEvents();
    loadTemplatesAndPhones();
    loadAllCustomers();
  }, []);

  async function loadTemplatesAndPhones() {
    try {
      const result = await callWhatsappApi('templates');
      if (result?.data) {
        const approved = result.data.filter((t: any) => t.status === 'APPROVED');
        setTemplates(approved);
        if (approved.length > 0) {
          setSelectedTemplate(approved[0].name);
          setTemplateLang(approved[0].language || 'pt_BR');
        }
      }
      const phonesData = await callWhatsappApi('phone_numbers');
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

  async function loadKpis() {
    setLoadingKpis(true);
    try {
      const { data, error } = await supabase.rpc('crm_dashboard_stats');
      if (error) throw error;
      const stats = data as unknown as { total_customers: number; new_customers_30d: number; superclientes: number; fans: number };

      let cac: number | null = null;
      try {
        const { data: session } = await supabase.auth.getSession();
        if (session.session) {
          const accountsRes = await supabase.functions.invoke('meta-ads-api?action=accounts', { method: 'GET' });
          if (accountsRes.data?.data?.[0]) {
            const accountId = accountsRes.data.data[0].account_id;
            const spendRes = await supabase.functions.invoke(
              `meta-ads-api?action=account_insights&account_id=${accountId}&date_preset=last_year`,
              { method: 'GET' }
            );
            if (spendRes.data?.data?.[0]) {
              const totalSpend = Number(spendRes.data.data[0].spend || 0);
              cac = totalSpend / (stats.total_customers || 1);
            }
          }
        }
      } catch {
        // CAC calculation failed silently
      }

      setKpis({
        total_customers: stats.total_customers,
        new_customers_30d: stats.new_customers_30d,
        superclientes: stats.superclientes,
        fans: stats.fans,
        cac,
      });
    } catch (err) {
      console.error('Failed to load KPIs:', err);
    } finally {
      setLoadingKpis(false);
    }
  }

  async function loadTopLists() {
    setLoadingLists(true);
    try {
      const [fansRes, superRes] = await Promise.all([
        supabase.rpc('crm_top_fans', { lim: 40 }),
        supabase.rpc('crm_top_superclientes', { lim: 40 }),
      ]);
      const filterExcluded = (list: any[]) =>
        list
          .filter(r => !EXCLUDED_NAMES.includes(r.full_name?.toLowerCase?.() || ''))
          .map(r => ({ ...r, total_spent: Number(r.total_spent), event_count: Number(r.event_count), event_names: r.event_names || [] }));
      if (fansRes.data) setTopFans(filterExcluded(fansRes.data as any[]).slice(0, 20));
      if (superRes.data) setTopSuperclientes(filterExcluded(superRes.data as any[]).slice(0, 20));
    } catch (err) {
      console.error('Failed to load top lists:', err);
    } finally {
      setLoadingLists(false);
    }
  }

  async function loadAllCustomers() {
    setLoadingAllCustomers(true);
    try {
      const all: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await (supabase as any)
          .from('crm_customers')
          .select('id, full_name, phone, city, neighborhood, ltv, previous_purchases_count, last_event, classification')
          .order('ltv', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setAllCustomers(all);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoadingAllCustomers(false);
    }
  }

  async function loadEvents() {
    setLoadingEvents(true);
    const { data: eventsData } = await supabase.from('events').select('*').order('created_at', { ascending: false });

    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('crm_purchases')
        .select('event_name, total_value, customer_id')
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const purchaseMap = new Map<string, { sales: number; revenue: number; customers: Set<string> }>();
    all.forEach((p) => {
      const entry = purchaseMap.get(p.event_name) || { sales: 0, revenue: 0, customers: new Set<string>() };
      entry.sales++;
      entry.revenue += Number(p.total_value);
      entry.customers.add(p.customer_id);
      purchaseMap.set(p.event_name, entry);
    });

    const eventsList: EventSummary[] = (eventsData || []).map((ev: any) => {
      const stats = purchaseMap.get(ev.name);
      return { ...ev, totalSales: stats?.sales || 0, totalRevenue: stats?.revenue || 0, uniqueCustomers: stats?.customers.size || 0 };
    });

    purchaseMap.forEach((v, name) => {
      if (!eventsList.find(e => e.name === name)) {
        eventsList.push({
          id: name, name, avatar_url: null, event_date: null, webhook_url: null, api_token: null, platform: 'manual', status: 'active',
          totalSales: v.sales, totalRevenue: v.revenue, uniqueCustomers: v.customers.size,
        });
      }
    });

    eventsList.sort((a, b) => b.totalRevenue - a.totalRevenue);
    setEvents(eventsList);
    setLoadingEvents(false);
  }

  async function loadCustomersForEvent(eventName: string) {
    setSelectedEvent(eventName);
    setLoadingCustomers(true);
    setSearch('');

    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('crm_purchases')
        .select('customer_id, total_value, ticket_type, purchase_date, crm_customers(id, full_name, email, phone, city, classification, ltv, previous_purchases_count)')
        .eq('event_name', eventName)
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const customerMap = new Map<string, CustomerRow>();
    all.forEach((p: any) => {
      const c = p.crm_customers;
      if (!c) return;
      const existing = customerMap.get(c.id);
      if (!existing || p.purchase_date > existing.purchase_date) {
        customerMap.set(c.id, {
          id: c.id, full_name: c.full_name, email: c.email, phone: c.phone,
          city: c.city, classification: c.classification, ltv: Number(c.ltv),
          previous_purchases_count: c.previous_purchases_count,
          ticket_type: p.ticket_type, total_value: Number(p.total_value),
          purchase_date: p.purchase_date,
        });
      }
    });

    setCustomers(Array.from(customerMap.values()));
    setLoadingCustomers(false);
  }

  const filtered = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter(c =>
      c.full_name.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  }, [customers, search]);

  function exportCSV() {
    const headers = ['Nome', 'Email', 'Telefone', 'Cidade', 'Tipo Ingresso', 'Valor', 'Classificação'];
    const rows = filtered.map(c => [
      c.full_name, c.email || '', c.phone || '', c.city || '',
      c.ticket_type || '', c.total_value, CLASSIFICATION_LABELS[c.classification]
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-${selectedEvent}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function sendWhatsAppToContact() {
    if (!contactTarget?.phone) { toast.error('Esse contato não tem telefone cadastrado.'); return; }
    if (!selectedTemplate) { toast.error('Selecione um modelo de mensagem.'); return; }
    if (!selectedPhoneId) { toast.error('Selecione um número de WhatsApp.'); return; }

    setSendingContact(true);
    try {
      const tmpl = templates.find((t: any) => t.name === selectedTemplate);
      const formattedPhone = formatPhone(contactTarget.phone);
      const result = await callWhatsappApi('send_bulk', {
        phone_number_id: selectedPhoneId,
        template_name: selectedTemplate,
        template_language: templateLang,
        template_components: tmpl?.components || [],
        contacts: [{ phone: formattedPhone, name: contactTarget.full_name || 'cliente' }],
      });
      if (result.sent > 0) {
        const bodyComponent = (tmpl?.components || []).find((c: any) => c.type === 'BODY');
        const messageText = bodyComponent?.text || `[Template: ${selectedTemplate}]`;
        const wamid = result.details?.[0]?.wamid || result.details?.[0]?.message_id || result.details?.[0]?.messages?.[0]?.id || null;

        await supabase.from('whatsapp_messages').insert({
          phone: formattedPhone, contact_name: contactTarget.full_name || null, direction: 'outgoing',
          message_type: 'template', message_text: messageText, status: 'sent', wamid,
        });

        await supabase.from('whatsapp_bot_settings')
          .upsert({ phone: formattedPhone, bot_enabled: false, updated_at: new Date().toISOString() }, { onConflict: 'phone' });

        toast.success(`Mensagem enviada para ${contactTarget.full_name}!`);
        setContactTarget(null);
      } else {
        toast.error('Falha ao enviar mensagem.');
      }
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSendingContact(false);
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleCreateEvent(mode: 'import' | 'live') {
    if (!newName.trim()) { toast.error('Nome do evento é obrigatório'); return; }
    setSaving(true);

    let avatarUrl: string | null = null;
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('event-avatars').upload(path, avatarFile);
      if (!error) {
        const { data: urlData } = supabase.storage.from('event-avatars').getPublicUrl(path);
        avatarUrl = urlData.publicUrl;
      }
    }

    const { error } = await supabase.from('events').insert({
      name: newName.trim(),
      avatar_url: avatarUrl,
      event_date: newDate || null,
      webhook_url: mode === 'live' ? newWebhook || null : null,
      api_token: mode === 'live' ? newApiToken || null : null,
      platform: mode === 'live' ? newPlatform : 'manual',
    });

    if (error) {
      toast.error('Erro ao criar evento');
    } else {
      toast.success('Evento criado!');
      resetForm();
      loadEvents();
    }
    setSaving(false);
  }

  function resetForm() {
    setCreateStep(null);
    setNewName(''); setNewDate(''); setNewWebhook(''); setNewApiToken('');
    setNewPlatform('blueticket'); setAvatarFile(null); setAvatarPreview(null);
    setSpreadsheetFile(null); setRevenue('');
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Customer list for selected event
  if (selectedEvent) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setSelectedEvent(null); setCustomers([]); }}>
              <ArrowLeft size={16} className="mr-1" /> Voltar
            </Button>
            <h2 className="text-sm font-semibold text-foreground truncate">{selectedEvent}</h2>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { loadCustomersForEvent(selectedEvent); toast.success('Dados atualizados!'); }}>
            <RefreshCw size={14} className={loadingCustomers ? 'animate-spin' : ''} />
            <span className="ml-1">Atualizar</span>
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download size={16} className="mr-1" /> Exportar CSV
          </Button>
        </div>
        <Card className="border-border">
          <CardContent className="p-0">
            {loadingCustomers ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhum cliente encontrado.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead className="hidden md:table-cell">Email</TableHead>
                      <TableHead className="hidden md:table-cell">Telefone</TableHead>
                      <TableHead className="hidden lg:table-cell">Cidade</TableHead>
                      <TableHead>Ingresso</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Classificação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.full_name}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{c.email || '—'}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{formatPhone(c.phone)}</TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">{c.city || '—'}</TableCell>
                        <TableCell className="text-xs">{c.ticket_type || '—'}</TableCell>
                        <TableCell className="font-medium">{fmt(c.total_value)}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${CLASSIFICATION_COLORS[c.classification]}`}>
                            {CLASSIFICATION_LABELS[c.classification]}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground text-right">{filtered.length} cliente(s)</p>
      </div>
    );
  }

  // Main CRM Dashboard
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPICard icon={Users} label="Total de Clientes" value={kpis?.total_customers?.toLocaleString('pt-BR') ?? '—'} loading={loadingKpis} color="text-blue-500" bgColor="bg-blue-500/10" />
        <KPICard icon={UserPlus} label="Novos (30 dias)" value={kpis?.new_customers_30d?.toLocaleString('pt-BR') ?? '—'} loading={loadingKpis} color="text-green-500" bgColor="bg-green-500/10" />
        <KPICard icon={DollarSign} label="CAC" value={kpis?.cac != null ? `R$ ${kpis.cac.toFixed(2).replace('.', ',')}` : '—'} loading={loadingKpis} color="text-amber-500" bgColor="bg-amber-500/10" />
        <KPICard icon={Crown} label="Superclientes" value={kpis?.superclientes?.toLocaleString('pt-BR') ?? '—'} loading={loadingKpis} color="text-purple-500" bgColor="bg-purple-500/10" subtitle="LTV > R$ 1.000" />
        <KPICard icon={Heart} label="Fãs" value={kpis?.fans?.toLocaleString('pt-BR') ?? '—'} loading={loadingKpis} color="text-pink-500" bgColor="bg-pink-500/10" subtitle="4+ eventos" />
      </div>

      {/* Top Cidades & Bairros */}
      {!loadingAllCustomers && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                🏙️ Top 5 Cidades
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {topCities.map(([city, count], i) => {
                  const pct = Math.round((count / allCustomers.length) * 100);
                  return (
                    <div key={city}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="font-medium text-foreground">{i + 1}. {city}</span>
                        <span className="text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  📍 Top 5 Bairros
                </CardTitle>
                {allNeighborhoods.length > 5 && (
                  <button
                    onClick={() => setShowAllNeighborhoods(true)}
                    className="text-[11px] text-blue-500 hover:text-blue-700 hover:underline transition-colors"
                  >
                    Ver mais ({allNeighborhoods.length})
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {topNeighborhoods.map(([nb, count], i) => {
                  const pct = Math.round((count / allCustomers.length) * 100);
                  return (
                    <div key={nb}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="font-medium text-foreground">{i + 1}. {nb}</span>
                        <span className="text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Lista de Clientes */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users size={16} className="text-blue-500" /> Clientes
              <span className="text-xs text-muted-foreground font-normal">({allCustomers.length} total)</span>
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingAllCustomers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Telefone</TableHead>
                    <TableHead className="hidden lg:table-cell">Cidade</TableHead>
                    <TableHead>Compras</TableHead>
                    <TableHead>LTV</TableHead>
                    <TableHead className="hidden md:table-cell">Último Evento</TableHead>
                    <TableHead>Classificação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allCustomers
                    .filter(c => {
                      if (!customerSearch.trim()) return true;
                      const q = customerSearch.toLowerCase();
                      return (
                        c.full_name?.toLowerCase().includes(q) ||
                        c.phone?.includes(q)
                      );
                    })
                    .slice(0, 20)
                    .map((c, i) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setDetailsCustomerId(c.id)}
                      >
                        <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{c.full_name}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-xs">{formatPhone(c.phone)}</TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">{c.city || '—'}</TableCell>
                        <TableCell className="text-sm">{c.previous_purchases_count ?? 0}</TableCell>
                        <TableCell className="font-semibold text-sm">
                          {Number(c.ltv).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-xs truncate max-w-[140px]">{c.last_event || '—'}</TableCell>
                        <TableCell>
                          {c.classification && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${CLASSIFICATION_COLORS[c.classification as ClientClassification]}`}>
                              {CLASSIFICATION_LABELS[c.classification as ClientClassification]}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Eventos</h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => { loadEvents(); loadKpis(); loadTopLists(); toast.success('Dados atualizados!'); }}>
              <RefreshCw size={14} className={loadingEvents ? 'animate-spin' : ''} />
            </Button>
            <Button size="sm" onClick={() => setCreateStep('choose')} className="bg-[#FF0080] hover:bg-[#FF0080]/90 text-white">
              <Plus size={16} className="mr-1" /> Adicionar
            </Button>
          </div>
        </div>

        {loadingEvents ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-3">
            {events.map((ev) => (
              <Card
                key={ev.id}
                className="border-border shadow-sm cursor-pointer hover:shadow-md hover:border-primary/20 transition-all"
                onClick={() => loadCustomersForEvent(ev.name)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    {ev.avatar_url ? <AvatarImage src={ev.avatar_url} alt={ev.name} /> : null}
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs font-bold">
                      {ev.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{ev.name}</p>
                      {ev.platform !== 'manual' && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                          <Radio size={8} /> Ao vivo
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                      <span><Users size={12} className="inline mr-1" />{ev.uniqueCustomers.toLocaleString('pt-BR')} clientes</span>
                      <span>{ev.totalSales.toLocaleString('pt-BR')} vendas</span>
                      <span className="text-emerald-600 font-medium">{fmt(ev.totalRevenue)}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
            {events.length === 0 && (
              <div className="text-center text-muted-foreground py-12">Nenhum evento cadastrado.</div>
            )}
          </div>
        )}
      </div>

      {/* Todos os Bairros Dialog */}
      <Dialog open={showAllNeighborhoods} onOpenChange={setShowAllNeighborhoods}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              📍 Todos os Bairros
              <span className="text-xs font-normal text-muted-foreground">({allNeighborhoods.length} bairros)</span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1 mt-2 space-y-2">
            {allNeighborhoods.map(([nb, count], i) => {
              const pct = Math.round((count / allCustomers.length) * 100);
              return (
                <div key={nb}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-medium text-foreground">{i + 1}. {nb}</span>
                    <span className="text-muted-foreground">{count} cliente{count > 1 ? 's' : ''} · {pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Contact Dialog */}
      <Dialog open={!!contactTarget} onOpenChange={(open) => !open && setContactTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle size={18} className="text-green-500" />
              Contato via WhatsApp
            </DialogTitle>
          </DialogHeader>
          {contactTarget && (
            <div className="space-y-4 mt-2">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="font-semibold text-sm text-foreground">{contactTarget.full_name}</p>
                <p className="text-xs text-muted-foreground">{formatPhone(contactTarget.phone)}</p>
                <p className="text-xs text-muted-foreground mt-1">LTV: {fmt(contactTarget.total_spent)}</p>
              </div>

              <div>
                <Label className="text-xs">Número de envio</Label>
                <Select value={selectedPhoneId} onValueChange={setSelectedPhoneId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {apiPhones.map((p: any) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.display_phone_number} {p.verified_name ? `(${p.verified_name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Template</Label>
                <Select value={selectedTemplate} onValueChange={(v) => {
                  setSelectedTemplate(v);
                  const tmpl = templates.find((t: any) => t.name === v);
                  if (tmpl) setTemplateLang(tmpl.language || 'pt_BR');
                }}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t: any) => (
                      <SelectItem key={t.name} value={t.name} className="text-xs">
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    if (contactTarget.phone) {
                      window.open(`tel:${contactTarget.phone}`, '_blank');
                    }
                  }}
                  disabled={!contactTarget.phone}
                >
                  <Phone size={14} className="mr-1" /> Ligar
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={sendWhatsAppToContact}
                  disabled={sendingContact || !selectedTemplate || !selectedPhoneId}
                >
                  {sendingContact ? (
                    <Loader2 size={14} className="animate-spin mr-1" />
                  ) : (
                    <Send size={14} className="mr-1" />
                  )}
                  Enviar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Event Dialog */}
      <Dialog open={createStep !== null} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-md">
          {createStep === 'choose' && (
            <>
              <DialogHeader>
                <DialogTitle>Adicionar Evento</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                  onClick={() => setCreateStep('import')}
                  className="flex flex-col items-center gap-3 p-6 border border-border rounded-xl hover:border-[#FF0080] hover:bg-[#FF0080]/5 transition-all"
                >
                  <Upload size={24} className="text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Importar Planilha</p>
                    <p className="text-xs text-muted-foreground mt-1">Upload de CSV com leads</p>
                  </div>
                </button>
                <button
                  onClick={() => setCreateStep('live')}
                  className="flex flex-col items-center gap-3 p-6 border border-border rounded-xl hover:border-[#FF0080] hover:bg-[#FF0080]/5 transition-all"
                >
                  <Radio size={24} className="text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Evento ao Vivo</p>
                    <p className="text-xs text-muted-foreground mt-1">Conectar API ou Webhook</p>
                  </div>
                </button>
              </div>
            </>
          )}

          {(createStep === 'import' || createStep === 'live') && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {createStep === 'import' ? 'Importar Planilha de Leads' : 'Evento ao Vivo'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="flex items-center gap-4">
                  <label className="cursor-pointer">
                    <Avatar className="h-16 w-16 border-2 border-dashed border-border hover:border-[#FF0080] transition-colors">
                      {avatarPreview ? <AvatarImage src={avatarPreview} /> : null}
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                        <Plus size={20} />
                      </AvatarFallback>
                    </Avatar>
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  </label>
                  <div>
                    <p className="text-sm font-medium text-foreground">Avatar do evento</p>
                    <p className="text-xs text-muted-foreground">300×300 recomendado</p>
                  </div>
                </div>

                <div>
                  <Label>Nome do evento</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Maestria" />
                </div>

                <div>
                  <Label>Data do evento</Label>
                  <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
                </div>

                {createStep === 'import' && (
                  <>
                    <div>
                      <Label>Planilha de Leads (CSV/XLSX)</Label>
                      <div className="mt-1">
                        <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-[#FF0080] hover:bg-[#FF0080]/5 transition-colors">
                          <Upload size={18} className="text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {spreadsheetFile ? spreadsheetFile.name : 'Clique para selecionar o arquivo'}
                          </span>
                          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => setSpreadsheetFile(e.target.files?.[0] || null)} />
                        </label>
                      </div>
                    </div>
                    <div>
                      <Label>Faturamento do evento (R$)</Label>
                      <Input type="number" step="0.01" min="0" placeholder="Ex: 50000.00" value={revenue} onChange={e => setRevenue(e.target.value)} />
                    </div>
                  </>
                )}

                {createStep === 'live' && (
                  <>
                    <div>
                      <Label>Plataforma</Label>
                      <select value={newPlatform} onChange={e => setNewPlatform(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="blueticket">Blueticket</option>
                        <option value="superticket">SuperTicket</option>
                        <option value="sympla">Sympla</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>
                    <div>
                      <Label>URL do Webhook</Label>
                      <Input value={newWebhook} onChange={e => setNewWebhook(e.target.value)} placeholder="https://..." />
                      <p className="text-xs text-muted-foreground mt-1">A plataforma enviará dados para esta URL</p>
                    </div>
                    <div>
                      <Label>Token da API (opcional)</Label>
                      <Input value={newApiToken} onChange={e => setNewApiToken(e.target.value)} placeholder="Token de autenticação" />
                    </div>
                  </>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setCreateStep('choose')} className="flex-1">Voltar</Button>
                  <Button onClick={() => handleCreateEvent(createStep)} disabled={saving} className="flex-1 bg-[#FF0080] hover:bg-[#FF0080]/90 text-white">
                    {saving ? 'Salvando...' : 'Criar Evento'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CustomerDetailsModal customerId={detailsCustomerId} onClose={() => setDetailsCustomerId(null)} />
    </div>
  );
}

function KPICard({ icon: Icon, label, value, loading, color, bgColor, subtitle }: {
  icon: any; label: string; value: string; loading: boolean; color: string; bgColor: string; subtitle?: string;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl ${bgColor}`}>
            <Icon size={18} className={color} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
            {loading ? (
              <div className="h-6 w-16 bg-muted animate-pulse rounded mt-1" />
            ) : (
              <p className="text-lg font-bold text-foreground leading-tight mt-0.5">{value}</p>
            )}
            {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


