import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, Users, DollarSign, Trophy, ChevronLeft, ChevronRight,
  X, Download, Loader2, TrendingUp, Calendar, Repeat2,
} from 'lucide-react';

const PAGE_SIZE = 50;
const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' };

// ── helpers ────────────────────────────────────────────────────────────────
function formatPhone(phone: string | null) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}

function formatDate(date: string | null) {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

function calcAge(date: string | null) {
  if (!date) return null;
  const birth = new Date(date);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

// ── interfaces ─────────────────────────────────────────────────────────────
interface Customer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  neighborhood: string | null;
  city: string | null;
  created_at: string;
}

interface EnrichedCustomer extends Customer {
  total_spent: number;
  event_count: number;
  event_names: string[];
}

interface EventStat { name: string; customers: number; revenue: number; }
interface Top10Entry { id: string; name: string; phone: string | null; total_spent: number; event_count: number; }

// ── component ──────────────────────────────────────────────────────────────
export default function InternoCrmVisaoGeral() {
  const [contacts, setContacts]           = useState<EnrichedCustomer[]>([]);
  const [total, setTotal]                 = useState(0);
  const [page, setPage]                   = useState(0);
  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading]             = useState(true);
  const [expanded, setExpanded]           = useState<string | null>(null);

  // stats
  const [totalContacts, setTotalContacts] = useState(0);
  const [superfans, setSuperfans]         = useState(0);
  const [totalRevenue, setTotalRevenue]   = useState(0);
  const [newCustomers30d, setNewCustomers30d] = useState(0);
  const [eventStats, setEventStats]       = useState<EventStat[]>([]);
  const [top10, setTop10]                 = useState<Top10Entry[]>([]);
  const [freqTop10, setFreqTop10]         = useState<Top10Entry[]>([]);

  // filters / sidebar
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab]       = useState<'eventos' | 'rankings'>('eventos');
  const [eventSearch, setEventSearch]     = useState('');
  const [exportingEvent, setExportingEvent] = useState<string | null>(null);

  // purchase map: customerId → { total, events }
  const [purchaseMap, setPurchaseMap] =
    useState<Map<string, { total: number; events: string[] }>>(new Map());
  // event → Set of customerIds (for fast filter)
  const [eventCustomerIds, setEventCustomerIds] =
    useState<Map<string, string[]>>(new Map());

  // ── CSV export ─────────────────────────────────────────────────────────
  async function exportCSV(eventName: string) {
    setExportingEvent(eventName);
    try {
      const cids = eventCustomerIds.get(eventName) ?? [];
      if (cids.length === 0) return;
      const allRows: Customer[] = [];
      for (let i = 0; i < cids.length; i += 500) {
        const { data } = await supabase
          .from('crm_customers')
          .select('*')
          .in('id', cids.slice(i, i + 500));
        if (data) allRows.push(...(data as Customer[]));
      }
      const headers = ['Nome', 'Email', 'Telefone', 'Nascimento', 'Cidade', 'Bairro'];
      const rows = allRows.map(c => [
        c.full_name ?? '', c.email ?? '', c.phone ?? '',
        c.birth_date ?? '', (c as any).city ?? '', (c as any).neighborhood ?? '',
      ]);
      const csv = [headers, ...rows]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${eventName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingEvent(null);
    }
  }

  // ── bootstrap ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function bootstrap() {
      // 1. All purchases
      const allPurchases: { customer_id: string; event_name: string; total_value: number | null }[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('crm_purchases')
          .select('customer_id, event_name, total_value')
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        allPurchases.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }

      // Build purchaseMap
      const pm = new Map<string, { total: number; events: string[] }>();
      const evCids = new Map<string, Set<string>>();
      const evRevenue = new Map<string, number>();
      let totalRev = 0;

      for (const p of allPurchases) {
        const cid = p.customer_id;
        const ev = p.event_name ?? 'Desconhecido';
        const val = Number(p.total_value) || 0;
        totalRev += val;

        if (!pm.has(cid)) pm.set(cid, { total: 0, events: [] });
        const entry = pm.get(cid)!;
        entry.total += val;
        if (!entry.events.includes(ev)) entry.events.push(ev);

        if (!evCids.has(ev)) evCids.set(ev, new Set());
        evCids.get(ev)!.add(cid);
        evRevenue.set(ev, (evRevenue.get(ev) ?? 0) + val);
      }

      // Freeze event customer id lists
      const ecMap = new Map<string, string[]>();
      evCids.forEach((set, ev) => ecMap.set(ev, [...set]));
      setEventCustomerIds(ecMap);
      setPurchaseMap(pm);
      setTotalRevenue(totalRev);

      // Event stats sorted by customer count
      const evStats: EventStat[] = [...evCids.entries()]
        .map(([name, set]) => ({ name, customers: set.size, revenue: evRevenue.get(name) ?? 0 }))
        .sort((a, b) => b.customers - a.customers);
      setEventStats(evStats);

      // Top 10 by total spent + Top 10 by event count
      const t10: Top10Entry[] = [];
      pm.forEach(({ total, events }, cid) => {
        t10.push({ id: cid, name: '', phone: null, total_spent: total, event_count: events.length });
      });
      t10.sort((a, b) => b.total_spent - a.total_spent);

      const freq10 = [...t10].sort((a, b) => b.event_count - a.event_count);

      const allTop20ids = [...new Set([
        ...t10.slice(0, 10).map(e => e.id),
        ...freq10.slice(0, 10).map(e => e.id),
      ])];

      if (allTop20ids.length > 0) {
        const { data: topCustomers } = await supabase
          .from('crm_customers')
          .select('id, full_name, phone')
          .in('id', allTop20ids);
        const nameMap = new Map((topCustomers ?? []).map(c => [c.id, { name: c.full_name, phone: c.phone }]));
        setTop10(
          t10.slice(0, 10).map(e => ({
            ...e,
            name: nameMap.get(e.id)?.name ?? '—',
            phone: nameMap.get(e.id)?.phone ?? null,
          }))
        );
        setFreqTop10(
          freq10.slice(0, 10).map(e => ({
            ...e,
            name: nameMap.get(e.id)?.name ?? '—',
            phone: nameMap.get(e.id)?.phone ?? null,
          }))
        );
      }

      // Superfans (2+ distinct events)
      let sf = 0;
      pm.forEach(({ events }) => { if (events.length >= 2) sf++; });
      setSuperfans(sf);

      // Total & new 30d
      const { count } = await supabase
        .from('crm_customers')
        .select('*', { count: 'exact', head: true });
      setTotalContacts(count ?? 0);

      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count: newCount } = await supabase
        .from('crm_customers')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', cutoff);
      setNewCustomers30d(newCount ?? 0);
    }
    bootstrap();
  }, []);

  // ── debounce ───────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); setExpanded(null); }, [selectedEvent]);

  // ── fetch contacts ─────────────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('crm_customers')
      .select('*', { count: 'exact' })
      .order('full_name', { ascending: true })
      .range(from, to);

    if (debouncedSearch.trim()) {
      const s = debouncedSearch.trim();
      query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
    }

    if (selectedEvent) {
      const cids = eventCustomerIds.get(selectedEvent) ?? [];
      if (cids.length === 0) {
        setContacts([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      query = query.in('id', cids);
    }

    const { data, count, error } = await query;
    if (!error && data) {
      const enriched: EnrichedCustomer[] = (data as Customer[]).map(c => {
        const p = purchaseMap.get(c.id) ?? { total: 0, events: [] };
        return { ...c, total_spent: p.total, event_count: p.events.length, event_names: p.events };
      });
      setContacts(enriched);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [page, debouncedSearch, selectedEvent, eventCustomerIds, purchaseMap]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const filteredEvents = eventStats.filter(e =>
    e.name.toLowerCase().includes(eventSearch.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users size={16} />}      label="Clientes"       value={totalContacts.toLocaleString('pt-BR')}  color="blue" />
        <StatCard icon={<Calendar size={16} />}   label="Eventos"        value={eventStats.length.toLocaleString('pt-BR')} color="purple" />
        <StatCard icon={<Trophy size={16} />}     label="Superfãs (2+)"  value={superfans.toLocaleString('pt-BR')}      color="green" />
        <StatCard icon={<TrendingUp size={16} />} label="Novos (30d)"    value={newCustomers30d.toLocaleString('pt-BR')} color="orange" />
      </div>

      {/* ── Body ── */}
      <div className="flex gap-4 items-start">

        {/* ── Sidebar ── */}
        <div className="hidden lg:flex flex-col w-60 shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            {(['eventos', 'rankings'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors ${
                  sidebarTab === tab
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {tab === 'eventos' ? 'Eventos' : 'Rankings'}
              </button>
            ))}
          </div>

          {sidebarTab === 'eventos' ? (
            <div className="overflow-y-auto max-h-[520px]">
              {/* Busca evento */}
              <div className="px-3 pt-2.5 pb-2">
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar evento…"
                    value={eventSearch}
                    onChange={e => setEventSearch(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
              {/* All */}
              <button
                onClick={() => setSelectedEvent(null)}
                className={`flex items-center justify-between w-full px-3 py-2 text-xs transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                  !selectedEvent ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <span>Todos</span>
                <span className="text-gray-400">{totalContacts.toLocaleString('pt-BR')}</span>
              </button>
              {filteredEvents.map(ev => (
                <div
                  key={ev.name}
                  className={`group flex items-center border-t border-gray-50 dark:border-gray-800/50 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                    selectedEvent === ev.name ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <button
                    onClick={() => setSelectedEvent(selectedEvent === ev.name ? null : ev.name)}
                    className={`flex-1 flex items-center justify-between px-3 py-2 text-xs min-w-0 ${
                      selectedEvent === ev.name ? 'text-blue-700 dark:text-blue-300 font-semibold' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span className="truncate text-left mr-1">{ev.name}</span>
                    <span className="shrink-0 tabular-nums text-gray-400">{ev.customers.toLocaleString()}</span>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); exportCSV(ev.name); }}
                    disabled={exportingEvent === ev.name}
                    title="Exportar CSV"
                    className="shrink-0 mr-2 p-1.5 rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
                  >
                    {exportingEvent === ev.name
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Download size={12} />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            /* Rankings tab */
            <div className="overflow-y-auto max-h-[520px] p-2 space-y-1">
              <p className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Por gasto total</p>
              {top10.map((e, i) => (
                <div key={e.id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <span className="text-sm shrink-0 w-5 text-center">
                    {MEDAL[i] !== undefined ? MEDAL[i] : <span className="text-xs font-bold text-gray-400">{i + 1}</span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{e.name}</p>
                    <p className="text-[10px] text-gray-400">{e.event_count} evento{e.event_count !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">{fmtBRL(e.total_spent)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Main ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Mobile event filter */}
          <div className="lg:hidden">
            <select
              value={selectedEvent ?? ''}
              onChange={e => setSelectedEvent(e.target.value || null)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none"
            >
              <option value="">Todos os eventos</option>
              {eventStats.map(ev => <option key={ev.name} value={ev.name}>{ev.name}</option>)}
            </select>
          </div>

          {/* Event pills */}
          <div className="flex flex-wrap gap-2">
            {eventStats.map(ev => (
              <button
                key={ev.name}
                onClick={() => setSelectedEvent(selectedEvent === ev.name ? null : ev.name)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  selectedEvent === ev.name
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-600'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                }`}
              >
                {ev.name}
              </button>
            ))}
          </div>

          {/* Rankings — dois Top 10 lado a lado */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Top 10 por gasto */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy size={14} className="text-yellow-500" />
                  <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Top 10 — maiores gastadores</h2>
                </div>
                <div className="flex items-center gap-1">
                  <DollarSign size={12} className="text-emerald-500" />
                  <span className="text-xs text-gray-400">{fmtBRL(totalRevenue)} total</span>
                </div>
              </div>
              <div>
                {top10.length === 0
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-gray-800/70">
                        <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse flex-1" />
                      </div>
                    ))
                  : top10.map((c, i) => (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-gray-800/70 last:border-0">
                        <span className="w-6 text-sm text-center shrink-0">
                          {MEDAL[i] !== undefined ? MEDAL[i] : <span className="text-xs font-bold text-gray-400">{i + 1}</span>}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.name}</p>
                          <p className="text-xs text-gray-400">{formatPhone(c.phone)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmtBRL(c.total_spent)}</p>
                          <p className="text-xs text-gray-400">{c.event_count}× evento{c.event_count !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    ))
                }
              </div>
            </div>

            {/* Top 10 por frequência */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat2 size={14} className="text-blue-500" />
                  <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Top 10 — mais eventos</h2>
                </div>
                <div className="flex items-center gap-1">
                  <Users size={12} className="text-blue-400" />
                  <span className="text-xs text-gray-400">{superfans.toLocaleString('pt-BR')} superfãs</span>
                </div>
              </div>
              <div>
                {freqTop10.length === 0
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-gray-800/70">
                        <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse flex-1" />
                      </div>
                    ))
                  : freqTop10.map((c, i) => (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-gray-800/70 last:border-0">
                        <span className="w-6 text-sm text-center shrink-0">
                          {MEDAL[i] !== undefined ? MEDAL[i] : <span className="text-xs font-bold text-gray-400">{i + 1}</span>}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.name}</p>
                          <p className="text-xs text-gray-400">{formatPhone(c.phone)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{c.event_count}× eventos</p>
                          <p className="text-xs text-gray-400">{fmtBRL(c.total_spent)}</p>
                        </div>
                      </div>
                    ))
                }
              </div>
            </div>

          </div>

          {/* Active filter badge */}
          {selectedEvent && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium border border-blue-200 dark:border-blue-700 max-w-xs truncate">
                {selectedEvent}
                <button onClick={() => setSelectedEvent(null)}><X size={10} /></button>
              </span>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, e-mail ou telefone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
            />
          </div>

          {/* Table */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nome</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Contato</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Nascimento</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Eventos</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Gasto Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-40" /></td>
                        <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-32" /></td>
                        <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-24" /></td>
                        <td className="px-4 py-3"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-8 mx-auto" /></td>
                        <td className="px-4 py-3 hidden sm:table-cell"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-20 ml-auto" /></td>
                      </tr>
                    ))
                  ) : contacts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">Nenhum cliente encontrado</td>
                    </tr>
                  ) : (
                    contacts.map(c => (
                      <>
                        <tr
                          key={c.id}
                          onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900 dark:text-gray-100">{c.full_name ?? '—'}</div>
                            {c.email && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{c.email}</div>}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-gray-500 dark:text-gray-400 text-sm">{formatPhone(c.phone)}</td>
                          <td className="px-4 py-3 hidden lg:table-cell text-gray-500 dark:text-gray-400 text-sm">
                            {c.birth_date ? (
                              <span>{formatDate(c.birth_date)}{calcAge(c.birth_date) !== null && <span className="ml-1 text-xs text-gray-400">({calcAge(c.birth_date)} anos)</span>}</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                              c.event_count >= 3 ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' :
                              c.event_count >= 2 ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                              c.event_count >= 1 ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' :
                              'bg-gray-50 dark:bg-gray-900 text-gray-400'
                            }`}>
                              {c.event_count}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-right">
                            {c.total_spent > 0
                              ? <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fmtBRL(c.total_spent)}</span>
                              : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                            }
                          </td>
                        </tr>
                        {expanded === c.id && (
                          <tr key={`${c.id}-exp`} className="bg-gray-50 dark:bg-gray-800/30">
                            <td colSpan={5} className="px-4 pb-4 pt-2">
                              <div className="space-y-2">
                                {c.city && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    <span className="font-medium text-gray-700 dark:text-gray-300">Cidade:</span> {c.city}{c.neighborhood ? ` · ${c.neighborhood}` : ''}
                                  </p>
                                )}
                                {c.event_names.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Eventos:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {c.event_names.map((ev, i) => (
                                        <button
                                          key={i}
                                          onClick={e => { e.stopPropagation(); setSelectedEvent(ev); setExpanded(null); }}
                                          className={`px-2 py-0.5 text-xs rounded-full border transition-colors hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300 ${
                                            selectedEvent === ev
                                              ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300'
                                              : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                                          }`}
                                        >
                                          {ev}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {total > 0
                  ? <>Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total.toLocaleString('pt-BR')} clientes</>
                  : 'Nenhum resultado'}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs text-gray-500 px-1">{page + 1} / {totalPages || 1}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    blue:   'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
    purple: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20',
    green:  'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
    orange: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20',
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{value}</p>
      </div>
    </div>
  );
}
