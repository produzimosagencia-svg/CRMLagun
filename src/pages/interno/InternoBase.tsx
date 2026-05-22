import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, Users, Ticket, CheckCircle, XCircle,
  ChevronLeft, ChevronRight, Trophy, X, Tag, Download, Loader2
} from 'lucide-react';

const PAGE_SIZE = 50;

interface Contact {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  data_nascimento: string | null;
  eventos: string[];
  total_eventos: number | null;
  checkins_realizados: number;
  checkins_nao_realizados: number;
}

interface EventStat { name: string; total: number; categoria?: string; }
interface CategoryStat { categoria: string; eventos: number; }

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

const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' };

const CATEGORY_COLORS: Record<string, string> = {
  'Funk':      'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700',
  'Pagode':    'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700',
  'Stoked':    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700',
  'Calourada': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700',
  'Privê':     'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700',
  'Sertanejo': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
  'Sundae':    'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-700',
};

const CATEGORY_ORDER = ['Funk', 'Pagode', 'Stoked', 'Calourada', 'Privê', 'Sertanejo', 'Sundae'];

// ── component ──────────────────────────────────────────────────────────────
export default function InternoBase() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [totalContacts, setTotalContacts] = useState(0);
  const [superfans, setSuperfans] = useState(0);
  const [eventStats, setEventStats] = useState<EventStat[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [top10, setTop10] = useState<Contact[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [eventSearch, setEventSearch] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'categorias' | 'eventos'>('categorias');
  const [exportingEvent, setExportingEvent] = useState<string | null>(null);
  const [exportingCategory, setExportingCategory] = useState<string | null>(null);

  async function downloadCSV(rows: Contact[], filename: string) {
    const headers = ['Nome', 'Email', 'Telefone', 'CPF', 'Nascimento', 'Qtd Eventos', 'Check-ins Realizados', 'Check-ins Não Realizados'];
    const data = rows.map(c => [
      c.nome, c.email ?? '', c.telefone ?? '', c.documento ?? '',
      c.data_nascimento ?? '', c.total_eventos ?? 0,
      c.checkins_realizados, c.checkins_nao_realizados,
    ]);
    const csv = [headers, ...data]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportCSV(eventName: string) {
    setExportingEvent(eventName);
    try {
      const allRows: Contact[] = [];
      let from = 0;
      const size = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('base_crm').select('*')
          .contains('eventos', [eventName])
          .order('nome', { ascending: true })
          .range(from, from + size - 1);
        if (error || !data || data.length === 0) break;
        allRows.push(...(data as Contact[]));
        if (data.length < size) break;
        from += size;
      }
      await downloadCSV(allRows, eventName);
    } finally {
      setExportingEvent(null);
    }
  }

  async function exportCategoryCSV(categoria: string) {
    setExportingCategory(categoria);
    try {
      const { data: catEvents } = await supabase
        .from('base_crm_event_categories').select('event_name').eq('categoria', categoria);
      const eventNames = catEvents?.map((r: { event_name: string }) => r.event_name) ?? [];
      if (eventNames.length === 0) return;

      const allRows: Contact[] = [];
      let from = 0;
      const size = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('base_crm').select('*')
          .overlaps('eventos', eventNames)
          .order('nome', { ascending: true })
          .range(from, from + size - 1);
        if (error || !data || data.length === 0) break;
        allRows.push(...(data as Contact[]));
        if (data.length < size) break;
        from += size;
      }
      await downloadCSV(allRows, `Categoria_${categoria}`);
    } finally {
      setExportingCategory(null);
    }
  }

  // ── bootstrap ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function bootstrap() {
      const { count } = await supabase.from('base_crm').select('*', { count: 'exact', head: true });
      setTotalContacts(count ?? 0);

      const { count: superfansCount } = await supabase
        .from('base_crm').select('*', { count: 'exact', head: true })
        .gt('total_eventos', 5);
      setSuperfans(superfansCount ?? 0);

      const { data: topData } = await supabase
        .from('base_crm').select('*')
        .order('total_eventos', { ascending: false })
        .order('checkins_realizados', { ascending: false })
        .limit(10);
      if (topData) setTop10(topData as Contact[]);

      // event categories
      const { data: catData } = await supabase
        .from('base_crm_event_categories')
        .select('event_name, categoria');

      if (catData) {
        // build event stats with category
        const eventList: EventStat[] = [
          { name: 'Arraiá Stoked 2024 - Mestrinho e Mariana Aydar', total: 1096 },
          { name: 'Arraiá Stoked 2023', total: 959 },
          { name: 'Privê Vix - 16ª Edição', total: 955 },
          { name: 'Bota a Base no Oásis | 8 de Junho', total: 928 },
          { name: 'Stoked Vibes Anos 2000', total: 823 },
          { name: 'Bota a Base no Oásis', total: 713 },
          { name: "Cheers of the Samba | Leandro Sapucahy convida Marcelo D2!", total: 591 },
          { name: "Quem tem joga | Let's Guarapari", total: 556 },
          { name: 'Bota a Base no Oásis | 14 de Setembro', total: 516 },
          { name: 'Bota a Base 4ª Ed', total: 495 },
          { name: "Santa Sexta | Let's Guarapari", total: 482 },
          { name: 'SIDOKA | Bota a Base 3ª Ed', total: 445 },
          { name: "Cheers Of The Samba com DI PROPÓSITO no Silva's", total: 376 },
          { name: 'CALOURADA FDV 2025', total: 373 },
          { name: 'Bota a Base 2 Ed', total: 357 },
          { name: 'Bota a Base no Ilha', total: 354 },
          { name: 'Baile da Justiça | 22.06', total: 350 },
          { name: 'Noite Capixaba', total: 320 },
          { name: 'Finobeat - Garden', total: 285 },
          { name: 'Rio Caraíva em Vitória', total: 278 },
          { name: 'Resenha do Deixa #3', total: 276 },
          { name: 'Finobeat - 2° Edição', total: 271 },
          { name: 'Velocidade135', total: 262 },
          { name: 'GINGADU - Volume 02', total: 259 },
          { name: 'Finobeat Premium - GARDEN', total: 244 },
          { name: 'SEM JUÍZO - GARDEN', total: 227 },
          { name: 'Stoked #7 em Carapebus', total: 215 },
          { name: 'Correndo Atrás de Festa - Edição Garden', total: 199 },
          { name: 'Baile de Máscaras - Garden', total: 194 },
          { name: 'Bass - Especial Halloween', total: 193 },
        ];
        const catMap: Record<string, string> = {};
        catData.forEach((r: { event_name: string; categoria: string }) => { catMap[r.event_name] = r.categoria; });
        setEventStats(eventList.map(e => ({ ...e, categoria: catMap[e.name] })));

        // category totals
        const totals: Record<string, number> = {};
        catData.forEach((r: { event_name: string; categoria: string }) => {
          totals[r.categoria] = (totals[r.categoria] ?? 0) + 1;
        });
        setCategoryStats(
          CATEGORY_ORDER
            .filter(c => totals[c])
            .map(c => ({ categoria: c, eventos: totals[c] }))
        );
      }
    }
    bootstrap();
  }, []);

  // ── debounce ───────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); setExpanded(null); }, [selectedEvent, selectedCategory]);

  // ── fetch contacts ─────────────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // If filtering by category, get event names for that category first
    let eventNamesForCategory: string[] | null = null;
    if (selectedCategory) {
      const { data: catEvents } = await supabase
        .from('base_crm_event_categories')
        .select('event_name')
        .eq('categoria', selectedCategory);
      eventNamesForCategory = catEvents?.map((r: { event_name: string }) => r.event_name) ?? [];
    }

    let query = supabase
      .from('base_crm')
      .select('*', { count: 'exact' })
      .order('total_eventos', { ascending: false })
      .order('nome', { ascending: true })
      .range(from, to);

    if (debouncedSearch.trim()) {
      const s = debouncedSearch.trim();
      query = query.or(`nome.ilike.%${s}%,email.ilike.%${s}%,telefone.ilike.%${s}%,documento.ilike.%${s}%`);
    }

    if (selectedEvent) {
      query = query.contains('eventos', [selectedEvent]);
    } else if (eventNamesForCategory && eventNamesForCategory.length > 0) {
      // contacts that have at least one event from this category
      query = query.overlaps('eventos', eventNamesForCategory);
    }

    const { data, count, error } = await query;
    if (!error) {
      setContacts((data as Contact[]) || []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [page, debouncedSearch, selectedEvent, selectedCategory]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const filteredEvents = eventStats.filter(e =>
    e.name.toLowerCase().includes(eventSearch.toLowerCase()) &&
    (!selectedCategory || e.categoria === selectedCategory)
  );

  function clearFilters() { setSelectedEvent(null); setSelectedCategory(null); }

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users size={16} />} label="Contatos" value={totalContacts.toLocaleString('pt-BR')} color="blue" />
        <StatCard icon={<Ticket size={16} />} label="Eventos" value={eventStats.length > 0 ? eventStats.length.toLocaleString('pt-BR') : '0'} color="purple" />
        <StatCard icon={<Trophy size={16} />} label="Superfãs" value={superfans.toLocaleString('pt-BR')} color="green" />
        <StatCard icon={<Trophy size={16} />} label="Média eventos/pessoa" value="2.3×" color="orange" />
      </div>

      {/* ── Body ── */}
      <div className="flex gap-4 items-start">

        {/* ── Sidebar ── */}
        <div className="hidden lg:flex flex-col w-60 shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            {(['categorias', 'eventos'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors ${
                  sidebarTab === tab
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {tab === 'categorias' ? 'Categorias' : 'Eventos'}
              </button>
            ))}
          </div>

          {sidebarTab === 'categorias' ? (
            <div className="overflow-y-auto">
              <button
                onClick={clearFilters}
                className={`flex items-center justify-between w-full px-3 py-2.5 text-xs transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                  !selectedCategory && !selectedEvent ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <span>Todos os contatos</span>
                <span className="text-gray-400">{totalContacts.toLocaleString('pt-BR')}</span>
              </button>
              {categoryStats.map(c => (
                <div key={c.categoria} className="flex items-center border-t border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                  <button
                    onClick={() => { setSelectedCategory(selectedCategory === c.categoria ? null : c.categoria); setSelectedEvent(null); }}
                    className={`flex-1 flex items-center justify-between px-3 py-2.5 text-xs ${
                      selectedCategory === c.categoria ? 'bg-blue-50 dark:bg-blue-900/20 font-semibold' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${CATEGORY_COLORS[c.categoria] ?? 'bg-gray-100 text-gray-600'}`}>
                        {c.categoria}
                      </span>
                    </div>
                    <span className="text-gray-400 tabular-nums">{c.eventos} eventos</span>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); exportCategoryCSV(c.categoria); }}
                    disabled={exportingCategory === c.categoria}
                    title={`Exportar CSV — ${c.categoria}`}
                    className="shrink-0 mr-2 p-1.5 rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
                  >
                    {exportingCategory === c.categoria
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Download size={12} />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[480px]">
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
              <button
                onClick={clearFilters}
                className={`flex items-center justify-between w-full px-3 py-2 text-xs transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                  !selectedEvent && !selectedCategory ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold' : 'text-gray-700 dark:text-gray-300'
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
                    onClick={() => { setSelectedEvent(selectedEvent === ev.name ? null : ev.name); setSelectedCategory(null); }}
                    className={`flex-1 flex items-center justify-between px-3 py-2 text-xs min-w-0 ${
                      selectedEvent === ev.name ? 'text-blue-700 dark:text-blue-300 font-semibold' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span className="truncate text-left mr-1">{ev.name}</span>
                    <span className="shrink-0 tabular-nums text-gray-400">{ev.total.toLocaleString()}</span>
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
          )}
        </div>

        {/* ── Main ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Mobile filters */}
          <div className="lg:hidden flex gap-2">
            <select
              value={selectedCategory ?? ''}
              onChange={e => { setSelectedCategory(e.target.value || null); setSelectedEvent(null); }}
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none"
            >
              <option value="">Todas as categorias</option>
              {categoryStats.map(c => <option key={c.categoria} value={c.categoria}>{c.categoria}</option>)}
            </select>
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            {CATEGORY_ORDER.map(cat => (
              <button
                key={cat}
                onClick={() => { setSelectedCategory(selectedCategory === cat ? null : cat); setSelectedEvent(null); }}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  selectedCategory === cat
                    ? CATEGORY_COLORS[cat]
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Top 10 */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <Trophy size={14} className="text-yellow-500" />
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Top 10 — mais eventos</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2">
              {top10.length === 0
                ? Array.from({ length: 10 }).map((_, i) => (
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
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.nome}</p>
                        <p className="text-xs text-gray-400 truncate">{formatPhone(c.telefone)}</p>
                      </div>
                      <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold shrink-0 ${
                        (c.total_eventos ?? 0) >= 5 ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' :
                        (c.total_eventos ?? 0) >= 3 ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                        'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}>
                        {c.total_eventos ?? 0}
                      </span>
                    </div>
                  ))
              }
            </div>
          </div>

          {/* Active filter badge */}
          {(selectedEvent || selectedCategory) && (
            <div className="flex items-center gap-2 flex-wrap">
              {selectedCategory && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full font-medium border ${CATEGORY_COLORS[selectedCategory]}`}>
                  <Tag size={10} /> {selectedCategory}
                  <button onClick={() => setSelectedCategory(null)}><X size={10} /></button>
                </span>
              )}
              {selectedEvent && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium border border-blue-200 dark:border-blue-700 max-w-xs truncate">
                  {selectedEvent}
                  <button onClick={() => setSelectedEvent(null)}><X size={10} /></button>
                </span>
              )}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, e-mail, telefone ou CPF…"
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
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Check-ins</th>
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
                        <td className="px-4 py-3 hidden sm:table-cell"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-10 mx-auto" /></td>
                      </tr>
                    ))
                  ) : contacts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">Nenhum contato encontrado</td>
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
                            <div className="font-medium text-gray-900 dark:text-gray-100">{c.nome}</div>
                            {c.email && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{c.email}</div>}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-gray-500 dark:text-gray-400 text-sm">{formatPhone(c.telefone)}</td>
                          <td className="px-4 py-3 hidden lg:table-cell text-gray-500 dark:text-gray-400 text-sm">
                            {c.data_nascimento ? (
                              <span>{formatDate(c.data_nascimento)}{calcAge(c.data_nascimento) !== null && <span className="ml-1 text-xs text-gray-400">({calcAge(c.data_nascimento)} anos)</span>}</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                              (c.total_eventos ?? 0) >= 5 ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' :
                              (c.total_eventos ?? 0) >= 3 ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                              (c.total_eventos ?? 0) >= 1 ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' :
                              'bg-gray-50 dark:bg-gray-900 text-gray-400'
                            }`}>
                              {c.total_eventos ?? 0}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <div className="flex items-center justify-center gap-2">
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                <CheckCircle size={12} /> {c.checkins_realizados}
                              </span>
                              {c.checkins_nao_realizados > 0 && (
                                <span className="flex items-center gap-1 text-red-400 text-xs">
                                  <XCircle size={12} /> {c.checkins_nao_realizados}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded === c.id && (
                          <tr key={`${c.id}-exp`} className="bg-gray-50 dark:bg-gray-800/30">
                            <td colSpan={5} className="px-4 pb-4 pt-2">
                              <div className="space-y-2">
                                {c.documento && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    <span className="font-medium text-gray-700 dark:text-gray-300">CPF:</span> {c.documento}
                                  </p>
                                )}
                                {c.eventos?.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Eventos:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {c.eventos.map((ev, i) => (
                                        <button
                                          key={i}
                                          onClick={e => { e.stopPropagation(); setSelectedEvent(ev); setSelectedCategory(null); setExpanded(null); }}
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
                  ? <>Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total.toLocaleString('pt-BR')} contatos</>
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

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
    purple: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20',
    green: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
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
