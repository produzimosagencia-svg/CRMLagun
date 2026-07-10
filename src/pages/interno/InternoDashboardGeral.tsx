import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import {
  DollarSign, Ticket, Users, TrendingUp, UserPlus, Trophy, Cake,
  ArrowUpRight, ArrowDownRight, Activity, Repeat2, CalendarCheck, Crown,
} from 'lucide-react';
import LoadingState from '@/components/interno/LoadingState';

// ── paleta da marca (sem azul/roxo) ──────────────────────────────────────────
const GOLD = '#E8C766';
const PINK = '#ec4899';
const CHART_PALETTE = [GOLD, PINK, '#10b981', '#f59e0b', '#f43f5e', '#fb923c', '#64748b', '#14b8a6'];
const CLASS_META: Record<string, { label: string; color: string }> = {
  vip:  { label: 'VIP',  color: GOLD },
  hot:  { label: 'Quente', color: '#f43f5e' },
  warm: { label: 'Morno', color: '#f59e0b' },
  cold: { label: 'Frio',  color: '#64748b' },
};

// ── tipos ────────────────────────────────────────────────────────────────────
interface Customer {
  id: string;
  full_name: string | null;
  classification: string | null;
  ltv: number | null;
  created_at: string;
  birth_date: string | null;
  previous_purchases_count: number | null;
  last_event: string | null;
}
interface Purchase {
  total_value: number | null;
  quantity: number | null;
  purchase_date: string | null;
  event_name: string | null;
  acquisition_channel: string | null;
  attendance_status: string | null;
  customer_id: string;
}

type PeriodKey = '30d' | '90d' | '12m' | 'all';
const PERIODS: { key: PeriodKey; label: string; days: number }[] = [
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
  { key: '12m', label: '12 meses', days: 365 },
  { key: 'all', label: 'Tudo', days: Infinity },
];

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtCompact = (v: number) =>
  v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : String(v);
const fmtNum = (v: number) => v.toLocaleString('pt-BR');
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  const size = 1000;
  // hard cap defensivo (250k linhas) só para não travar em bases gigantes
  while (from < 250_000) {
    const { data, error } = await supabase.from(table as any).select(columns).range(from, from + size - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < size) break;
    from += size;
  }
  return out;
}

// ── subcomponentes reutilizáveis ─────────────────────────────────────────────
function KpiCard({
  icon, label, value, sub, delta, accent = GOLD,
}: {
  icon: ReactNode; label: string; value: string; sub?: string;
  delta?: number | null; accent?: string;
}) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const up = (delta ?? 0) >= 0;
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          {icon}
        </div>
        {hasDelta && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
              up
                ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10'
                : 'text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10'
            }`}
          >
            {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(delta as number).toFixed(0)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground leading-tight truncate">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Panel({
  title, subtitle, icon, children, className = '',
}: {
  title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-card p-4 flex flex-col ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--popover-foreground)',
} as const;

// ── componente principal ─────────────────────────────────────────────────────
export default function InternoDashboardGeral() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('30d');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, p] = await Promise.all([
          fetchAll<Customer>('crm_customers', 'id, full_name, classification, ltv, created_at, birth_date, previous_purchases_count, last_event'),
          fetchAll<Purchase>('crm_purchases', 'total_value, quantity, purchase_date, event_name, acquisition_channel, attendance_status, customer_id'),
        ]);
        setCustomers(c);
        setPurchases(p);
      } catch (e) {
        console.error('[DashboardGeral]', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const m = useMemo(() => {
    const now = new Date();
    const cfg = PERIODS.find(p => p.key === period)!;
    const curStart = cfg.days === Infinity ? new Date(0) : new Date(now.getTime() - cfg.days * 864e5);
    const prevStart = cfg.days === Infinity ? new Date(0) : new Date(now.getTime() - 2 * cfg.days * 864e5);

    const parse = (s: string | null) => (s ? new Date(s) : null);
    const inRange = (d: Date | null, a: Date, b: Date) => !!d && d >= a && d < b;

    // ── período atual x anterior ──
    let revCur = 0, revPrev = 0, qtyCur = 0;
    for (const p of purchases) {
      const d = parse(p.purchase_date);
      const val = Number(p.total_value) || 0;
      const q = Number(p.quantity) || 0;
      if (inRange(d, curStart, now)) { revCur += val; qtyCur += q; }
      else if (inRange(d, prevStart, curStart)) { revPrev += val; }
    }
    let newCur = 0, newPrev = 0;
    for (const c of customers) {
      const d = parse(c.created_at);
      if (inRange(d, curStart, now)) newCur++;
      else if (inRange(d, prevStart, curStart)) newPrev++;
    }
    const delta = (cur: number, prev: number): number | null => {
      if (cfg.days === Infinity) return null;
      if (prev === 0) return cur > 0 ? 100 : null;
      return ((cur - prev) / prev) * 100;
    };

    // ── totais ──
    const totalRevenue = purchases.reduce((s, p) => s + (Number(p.total_value) || 0), 0);
    const totalTickets = purchases.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const avgTicket = totalTickets > 0 ? totalRevenue / totalTickets : 0;
    const ltvValues = customers.map(c => Number(c.ltv) || 0).filter(v => v > 0);
    const avgLtv = ltvValues.length ? ltvValues.reduce((a, b) => a + b, 0) / ltvValues.length : 0;
    const repeatCount = customers.filter(c => (Number(c.previous_purchases_count) || 0) > 1).length;
    const repeatRate = customers.length ? (repeatCount / customers.length) * 100 : 0;

    // ── evolução mensal (12 meses) ──
    const months: { key: string; label: string; receita: number }[] = [];
    const monthIdx = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthIdx.set(key, months.length);
      months.push({ key, label: MONTH_ABBR[d.getMonth()], receita: 0 });
    }
    for (const p of purchases) {
      if (!p.purchase_date) continue;
      const key = p.purchase_date.slice(0, 7);
      const idx = monthIdx.get(key);
      if (idx !== undefined) months[idx].receita += Number(p.total_value) || 0;
    }

    // ── classificação (donut) ──
    const classCount: Record<string, number> = { vip: 0, hot: 0, warm: 0, cold: 0 };
    for (const c of customers) {
      const k = (c.classification || 'cold').toLowerCase();
      if (k in classCount) classCount[k]++;
    }
    const classData = Object.keys(CLASS_META)
      .map(k => ({ name: CLASS_META[k].label, value: classCount[k] || 0, color: CLASS_META[k].color }))
      .filter(d => d.value > 0);

    // ── top eventos por receita ──
    const evMap = new Map<string, number>();
    for (const p of purchases) {
      const name = p.event_name || '—';
      evMap.set(name, (evMap.get(name) || 0) + (Number(p.total_value) || 0));
    }
    const topEvents = [...evMap.entries()]
      .map(([name, receita]) => ({ name, receita }))
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 8);

    // ── receita por canal ──
    const chMap = new Map<string, number>();
    for (const p of purchases) {
      const ch = p.acquisition_channel?.trim() || 'Não informado';
      chMap.set(ch, (chMap.get(ch) || 0) + (Number(p.total_value) || 0));
    }
    const channels = [...chMap.entries()]
      .map(([name, receita]) => ({ name, receita }))
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 6);

    // ── top clientes (LTV) ──
    const topCustomers = [...customers]
      .sort((a, b) => (Number(b.ltv) || 0) - (Number(a.ltv) || 0))
      .slice(0, 10);

    // ── compras recentes ──
    const nameById = new Map(customers.map(c => [c.id, c.full_name || 'Sem nome']));
    const recent = [...purchases]
      .filter(p => p.purchase_date)
      .sort((a, b) => (b.purchase_date! > a.purchase_date! ? 1 : -1))
      .slice(0, 8)
      .map(p => ({
        name: nameById.get(p.customer_id) || '—',
        event: p.event_name || '—',
        value: Number(p.total_value) || 0,
        date: p.purchase_date!,
      }));

    // ── aniversariantes do mês ──
    const curMonth = now.getMonth() + 1;
    const birthdays = customers.filter(c => c.birth_date && parseInt(c.birth_date.slice(5, 7), 10) === curMonth).length;

    // ── comparecimento ──
    const attendedStatuses = new Set(['attended', 'present', 'compareceu', 'checked_in', 'checkin', 'confirmed']);
    let attended = 0, attTotal = 0;
    for (const p of purchases) {
      if (!p.attendance_status) continue;
      attTotal++;
      if (attendedStatuses.has(p.attendance_status.toLowerCase())) attended++;
    }
    const attendanceRate = attTotal ? (attended / attTotal) * 100 : null;

    return {
      revCur, qtyCur, newCur,
      revDelta: delta(revCur, revPrev), newDelta: delta(newCur, newPrev),
      totalCustomers: customers.length, totalRevenue, totalTickets, avgTicket, avgLtv,
      repeatRate, months, classData, topEvents, channels, topCustomers, recent, birthdays, attendanceRate,
      vipCount: classCount.vip,
    };
  }, [customers, purchases, period]);

  if (loading) return <LoadingState label="Dashboard" />;

  const periodLabel = PERIODS.find(p => p.key === period)!.label.toLowerCase();

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Dashboard Geral</h2>
          <p className="text-xs text-muted-foreground">Visão executiva da operação · {fmtNum(m.totalCustomers)} clientes na base</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                period === p.key
                  ? 'bg-[#E8C766] text-[#1A0800]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon={<DollarSign size={16} />} label={`Receita (${periodLabel})`} value={fmtBRL(m.revCur)} delta={m.revDelta} accent={GOLD} />
        <KpiCard icon={<Ticket size={16} />} label={`Ingressos (${periodLabel})`} value={fmtNum(m.qtyCur)} accent={PINK} />
        <KpiCard icon={<UserPlus size={16} />} label={`Novos clientes (${periodLabel})`} value={fmtNum(m.newCur)} delta={m.newDelta} accent="#10b981" />
        <KpiCard icon={<Users size={16} />} label="Base total" value={fmtNum(m.totalCustomers)} sub={`${fmtNum(m.vipCount)} VIPs`} accent="#f59e0b" />
        <KpiCard icon={<TrendingUp size={16} />} label="Ticket médio" value={fmtBRL(m.avgTicket)} accent="#fb923c" />
        <KpiCard icon={<Trophy size={16} />} label="LTV médio" value={fmtBRL(m.avgLtv)} accent="#f43f5e" />
      </div>

      {/* ── Evolução + Classificação ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Evolução da receita" subtitle="Últimos 12 meses" icon={<Activity size={15} />} className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={m.months} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={fmtCompact} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtBRL(v), 'Receita']} cursor={{ stroke: GOLD, strokeOpacity: 0.3 }} />
                <Area type="monotone" dataKey="receita" stroke={GOLD} strokeWidth={2} fill="url(#gRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Base por classificação" subtitle="Distribuição de clientes" icon={<Crown size={15} />}>
          {m.classData.length === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">Sem dados.</p>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-40 w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={m.classData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
                      {m.classData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => [fmtNum(v), n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                {m.classData.map(d => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground flex-1 truncate">{d.name}</span>
                    <span className="font-semibold text-foreground tabular-nums">{fmtNum(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Top eventos + Canais ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Top eventos por receita" subtitle="8 maiores" icon={<Trophy size={15} />}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.topEvents} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={fmtCompact} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={96} tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + '…' : v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtBRL(v), 'Receita']} cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }} />
                <Bar dataKey="receita" fill={GOLD} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Receita por canal" subtitle="Aquisição" icon={<TrendingUp size={15} />}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.channels} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v: string) => (v.length > 10 ? v.slice(0, 9) + '…' : v)} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={fmtCompact} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtBRL(v), 'Receita']} cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }} />
                <Bar dataKey="receita" radius={[4, 4, 0, 0]}>
                  {m.channels.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* ── Ranking + Recentes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Top 10 clientes" subtitle="Por LTV" icon={<Crown size={15} />}>
          <div className="space-y-0.5">
            {m.topCustomers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 py-1.5 px-1 rounded-lg hover:bg-muted/50">
                <span className={`w-6 text-center text-xs font-bold shrink-0 ${i < 3 ? 'text-[#E8C766]' : 'text-muted-foreground'}`}>
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0 text-sm text-foreground truncate">{c.full_name || 'Sem nome'}</span>
                {c.last_event && <span className="hidden sm:inline text-[10px] text-muted-foreground truncate max-w-[120px]">{c.last_event}</span>}
                <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">{fmtBRL(Number(c.ltv) || 0)}</span>
              </div>
            ))}
            {m.topCustomers.length === 0 && <p className="text-xs text-muted-foreground py-8 text-center">Sem dados.</p>}
          </div>
        </Panel>

        <Panel title="Compras recentes" subtitle="Operação recente" icon={<Activity size={15} />}>
          <div className="space-y-0.5">
            {m.recent.map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 px-1 rounded-lg hover:bg-muted/50">
                <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0">
                  {r.name.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{r.event}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-foreground tabular-nums">{fmtBRL(r.value)}</p>
                  <p className="text-[10px] text-muted-foreground">{r.date.split('-').reverse().join('/')}</p>
                </div>
              </div>
            ))}
            {m.recent.length === 0 && <p className="text-xs text-muted-foreground py-8 text-center">Sem compras registradas.</p>}
          </div>
        </Panel>
      </div>

      {/* ── Indicadores operacionais ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${PINK}22`, color: PINK }}>
            <Cake size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-foreground">{fmtNum(m.birthdays)}</p>
            <p className="text-[11px] text-muted-foreground">Aniversariantes no mês</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#10b98122', color: '#10b981' }}>
            <Repeat2 size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-foreground">{m.repeatRate.toFixed(0)}%</p>
            <p className="text-[11px] text-muted-foreground">Taxa de recompra</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${GOLD}22`, color: GOLD }}>
            <CalendarCheck size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-foreground">{m.attendanceRate !== null ? `${m.attendanceRate.toFixed(0)}%` : '—'}</p>
            <p className="text-[11px] text-muted-foreground">Comparecimento</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#f59e0b22', color: '#f59e0b' }}>
            <DollarSign size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-foreground">{fmtBRL(m.totalRevenue)}</p>
            <p className="text-[11px] text-muted-foreground">Receita acumulada</p>
          </div>
        </div>
      </div>
    </div>
  );
}
