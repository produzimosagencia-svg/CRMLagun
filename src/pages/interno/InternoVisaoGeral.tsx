import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity, AlertTriangle, ArrowDown, ArrowLeft, ArrowUpRight, BadgePercent, CalendarDays, Check, CheckCircle2,
  ChevronDown, Clock, CreditCard, Database, DollarSign, ExternalLink, Layers, MapPin, Megaphone, MessageCircle,
  Minus, Receipt, RefreshCw, ShoppingCart, Ticket, TrendingDown, TrendingUp, Wallet, XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CarrinhoZig } from '@/components/interno/CarrinhoZig';
import { CampanhasDoEvento, type Vinculo } from '@/components/interno/CampanhasDoEvento';
import { DisparosDoEvento, type Disparo } from '@/components/interno/DisparosDoEvento';

/**
 * Visão geral de vendas da Lagun: todos os eventos ligados à Zig (Superticket).
 * Período (24h, 7, 30 dias, tudo) e evento no topo; os números vêm da RPC
 * zig_dashboard, agregada no banco a partir de lagun_zig_orders e
 * lagun_zig_tickets (a lagun-zig-sync alimenta as duas a cada 10 min).
 * Custos de marketing: Meta Ads (meta-ads-api) e WhatsApp estimado pelos
 * templates enviados. Na visão geral é a conta inteira; no evento, só as
 * campanhas e os disparos vinculados a ele (lagun_event_campaigns,
 * lagun_event_disparos) mais os envios automáticos de carrinho e estorno.
 *
 * Visual da Lagun: fundo escuro, amarelo da marca para destaque. Verde,
 * laranja e vermelho só com significado (bom, atenção, ruim), sempre com
 * ícone e texto.
 */

// ── tipos ────────────────────────────────────────────────────────────────────
type Ponto = { t: string; bruto: number; ingressos: number; pedidos: number };
type Item = { nome: string; ingressos: number; pedidos?: number; valor: number };
type EventoZig = {
  id: string; nome: string; data: string | null; imagem: string | null; local: string | null; link: string | null;
  sincronizado_em: string | null; erro: string | null;
  bruto: number; pedidos: number; ingressos: number; ult7: number; ant7: number; ultima: string | null; nao_pagos: number;
  bruto_periodo: number; face_periodo: number; pedidos_periodo: number; ingressos_periodo: number;
};
type Dash = {
  hoje: string;
  atualizado_em: string | null;
  kpis: {
    bruto: number; face: number; taxa?: number; pedidos: number; ingressos: number; ingressos_detalhados: number;
    cupom_bruto: number; cupom_pedidos: number; desconto: number; primeira: string | null; ultima: string | null;
  };
  cortesias: number;
  passaportes: number;
  funil: Record<string, number>;
  por_dia: Ponto[];
  por_hora: Ponto[];
  setores: Item[];
  lotes: Item[];
  cupons: { codigo: string; ingressos: number; pedidos: number; valor: number; desconto: number }[];
  pagamento: Item[];
  hora_semana: { dow: number; hora: number; ingressos: number }[];
  eventos: EventoZig[];
};
type Tom = 'bom' | 'atencao' | 'ruim';
type Periodo = '24h' | '7d' | '30d' | 'tudo';

const PERIODOS: { id: Periodo; rotulo: string; dias: number | null }[] = [
  { id: '24h', rotulo: '24h', dias: 1 }, { id: '7d', rotulo: '7 dias', dias: 7 },
  { id: '30d', rotulo: '30 dias', dias: 30 }, { id: 'tudo', rotulo: 'Tudo', dias: null },
];
// Custo estimado por template de WhatsApp enviado (tabela da Meta para o Brasil, em reais).
const WHATSAPP_R$ = { marketing: 0.35, utilidade: 0.04 };
const CONTA_META_KEY = 'lagun-visao-geral-conta-meta';
const MIGRACAO = '20261028230000_zig_dashboard.sql';

// ── cores da Lagun ───────────────────────────────────────────────────────────
const AMARELO = '#FFE14D';
const MUTED = '#8F8A7C';
const cardCls = 'rounded-xl border border-[#2A2822] bg-[#1A1916]';
const vazioCls = 'py-8 text-center text-sm text-[#8F8A7C]';

// ── formatação ───────────────────────────────────────────────────────────────
const brl = (v: number, centavos = false) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: centavos ? 2 : 0 });
const brlCurto = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
    : v >= 10_000 ? `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
    : brl(v);
const num = (v: number) => (Number(v) || 0).toLocaleString('pt-BR');
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;

const somarDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400_000);

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Data do evento (coluna date, "AAAA-MM-DD"). */
const dataEvento = (dia: string | null) => {
  if (!dia) return 'sem data';
  const d = new Date(`${dia.slice(0, 10)}T12:00:00Z`);
  return `${SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const diaCurto = (dia: string) => {
  const [, m, d] = dia.split('-');
  return `${Number(d)}/${Number(m)}`;
};
const haQuanto = (iso: string | null) => {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
};
const quandoFalta = (faltam: number) => (faltam === 0 ? 'é hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias`);

const nomePagamento = (p: string) => {
  const s = p.trim();
  if (/^pix$/i.test(s)) return 'Pix';
  return s.charAt(0).toUpperCase() + s.slice(1);
};
// Cor fixa por forma de pagamento (identidade, não status); o resto em cinza.
const corPagamento = (p: string, i: number) => {
  const s = p.toLowerCase();
  if (s.includes('pix')) return 'bg-[#2DD4BF]';
  if (s.includes('crédito') || s.includes('credito') || s.includes('credit')) return 'bg-[#FFE14D]';
  if (s.includes('débito') || s.includes('debito') || s.includes('debit')) return 'bg-[#F59E0B]';
  if (s.includes('boleto')) return 'bg-[#F472B6]';
  return ['bg-white/60', 'bg-white/35', 'bg-white/20'][i % 3];
};

// ── tons (verde / laranja / vermelho) ─────────────────────────────────────────
const TOM: Record<Tom, { texto: string; fundo: string; borda: string; Icone: typeof CheckCircle2 }> = {
  bom: { texto: 'text-[#4ADE80]', fundo: 'bg-[#4ADE80]/10', borda: 'border-[#4ADE80]/25', Icone: CheckCircle2 },
  atencao: { texto: 'text-[#FB923C]', fundo: 'bg-[#FB923C]/10', borda: 'border-[#FB923C]/25', Icone: AlertTriangle },
  ruim: { texto: 'text-[#F87171]', fundo: 'bg-[#F87171]/10', borda: 'border-[#F87171]/25', Icone: XCircle },
};

function Selo({ tom, icone, children }: { tom: Tom; icone?: ReactNode; children: ReactNode }) {
  const t = TOM[tom];
  return (
    <span className={`inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${t.texto} ${t.fundo} ${t.borda}`}>
      {icone ?? <t.Icone size={12} />}{children}
    </span>
  );
}

/** Ritmo de venda: últimos 7 dias contra os 7 anteriores. */
function ritmo(ev: EventoZig): { tom: Tom; texto: string; icone: ReactNode } | null {
  if (ev.ingressos === 0) return null;
  const ult = ev.ult7, ant = ev.ant7;
  if (ult === 0 && ant === 0) return { tom: 'ruim', texto: 'sem vendas em 14 dias', icone: <Minus size={12} /> };
  if (ant === 0) return { tom: 'bom', texto: `${num(ult)} na semana`, icone: <TrendingUp size={12} /> };
  const r = ult / ant;
  if (r >= 1.1) return { tom: 'bom', texto: `acelerando +${pct(r - 1)}`, icone: <TrendingUp size={12} /> };
  if (r >= 0.85) return { tom: 'atencao', texto: 'ritmo estável', icone: <Minus size={12} /> };
  return { tom: 'ruim', texto: `desacelerando −${pct(1 - r)}`, icone: <TrendingDown size={12} /> };
}

// ── peças ────────────────────────────────────────────────────────────────────
function Painel({ titulo, subtitulo, icone, acao, className = '', children }: {
  titulo: string; subtitulo?: ReactNode; icone?: ReactNode; acao?: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <section className={`${cardCls} flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">{icone && <span className="text-[#FFE14D]">{icone}</span>}{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-[#8F8A7C]">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Kpi({ icone, rotulo, valor, sub, destaque }: { icone: ReactNode; rotulo: string; valor: string; sub?: ReactNode; destaque?: boolean }) {
  if (destaque) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-[#FFE14D] p-4 text-[#17160f] shadow-[0_12px_30px_-14px_rgba(255,225,77,.55)]">
        <span aria-hidden className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/25" />
        <div className="relative flex items-center gap-2 text-[#17160f]/75">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#17160f]/10">{icone}</span>
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.12em]">{rotulo}</span>
        </div>
        <p className="relative mt-2 truncate text-2xl font-black tabular-nums">{valor}</p>
        {sub && <div className="relative mt-1 truncate text-xs text-[#17160f]/70">{sub}</div>}
      </div>
    );
  }
  return (
    <div className={`${cardCls} min-w-0 p-4`}>
      <div className="flex items-center gap-2 text-[#8F8A7C]">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#FFE14D]/10 text-[#FFE14D]">{icone}</span>
        <span className="truncate text-[11px] font-bold uppercase tracking-[0.12em]">{rotulo}</span>
      </div>
      <p className="mt-2 truncate text-xl font-black tabular-nums text-white">{valor}</p>
      {sub && <div className="mt-1 truncate text-xs text-[#8F8A7C]">{sub}</div>}
    </div>
  );
}

function BarraDivisao({ partes }: { partes: { rotulo: string; valor: number; tom: string }[] }) {
  const visiveis = partes.filter((p) => p.valor > 0);
  const total = visiveis.reduce((s, p) => s + p.valor, 0) || 1;
  return (
    <div>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-white/5">
        {visiveis.map((p) => (
          <div key={p.rotulo} className={`${p.tom} h-full first:rounded-l-full last:rounded-r-full`} style={{ width: `${(p.valor / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8F8A7C]">
        {visiveis.map((p) => (
          <span key={p.rotulo} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${p.tom}`} />
            {p.rotulo} <span className="tabular-nums text-[#D8D2C7]">{pct(p.valor / total)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Ranking em barras horizontais (HTML: rótulo inteiro, sem quebrar). */
function Ranking({ itens, medida, cor = 'bg-gradient-to-r from-[#FFE14D] to-[#F5B700]' }: { itens: Item[]; medida: 'ingressos' | 'valor'; cor?: string }) {
  const maior = Math.max(1, ...itens.map((i) => i[medida]));
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.nome} className="text-xs" title={`${i.nome} · ${num(i.ingressos)} ingressos · ${brl(i.valor)}`}>
          <div className="flex justify-between gap-3">
            <span className="truncate text-[#D8D2C7]">{i.nome}</span>
            <span className="flex-none tabular-nums text-[#8F8A7C]">
              {medida === 'ingressos'
                ? <><span className="text-white">{num(i.ingressos)}</span> · {brlCurto(i.valor)}</>
                : <><span className="text-white">{brl(i.valor)}</span> · {num(i.ingressos)}</>}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-white/5"><div className={`h-full rounded-full ${cor}`} style={{ width: `${(i[medida] / maior) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

const dicaCls = 'rounded-lg border border-[#2A2822] bg-[#12110E] px-3 py-2 text-xs shadow-xl';
function DicaSerie({ active, payload }: { active?: boolean; payload?: { payload: Ponto & { rotulo: string } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className={dicaCls}>
      <p className="font-medium text-white">{d.rotulo}</p>
      <p className="mt-1 tabular-nums text-[#FFE14D]">{brl(d.bruto)}</p>
      <p className="tabular-nums text-[#8F8A7C]">{num(d.ingressos)} ingressos · {num(d.pedidos)} pedidos</p>
    </div>
  );
}
const eixoValor = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M` : v >= 1_000 ? `${Math.round(v / 1_000)}k` : String(v));
const eixo = { fontSize: 11, fill: MUTED };

function MapaHorarios({ dados }: { dados: Dash['hora_semana'] }) {
  const mapa = new Map(dados.map((d) => [`${d.dow}-${d.hora}`, d.ingressos]));
  const maior = Math.max(1, ...dados.map((d) => d.ingressos));
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const pico = dados.reduce((a, b) => (b.ingressos > (a?.ingressos ?? -1) ? b : a), null as Dash['hora_semana'][number] | null);
  if (dados.length === 0) return <p className={vazioCls}>Sem vendas no período.</p>;
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {ordem.map((dw) => (
            <div key={dw} className="flex items-center gap-[2px] py-[1px]">
              <span className="w-9 flex-none text-[10px] capitalize text-[#8F8A7C]">{SEMANA[dw]}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const n = mapa.get(`${dw}-${h}`) ?? 0;
                return (
                  <div key={h} title={`${SEMANA[dw]} ${h}h · ${num(n)} ingressos`} className="h-5 flex-1 rounded-[3px]"
                    style={{ background: n ? `rgba(255,225,77,${0.12 + 0.88 * Math.sqrt(n / maior)})` : 'rgba(255,255,255,.04)' }} />
                );
              })}
            </div>
          ))}
          <div className="ml-9 mt-1 flex text-[10px] text-[#8F8A7C]">
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="flex-1 text-center">{h % 3 === 0 ? `${h}h` : ''}</span>)}
          </div>
        </div>
      </div>
      {pico && pico.ingressos > 0 && (
        <p className="mt-3 text-xs text-[#8F8A7C]">Pico: <span className="font-medium text-white">{SEMANA[pico.dow]} às {pico.hora}h</span> · use esse horário para disparos e posts de virada de lote.</p>
      )}
    </div>
  );
}

function Flyer({ src, tamanho = 'h-8 w-8' }: { src: string | null; tamanho?: string }) {
  return src
    ? <img src={src} alt="" loading="lazy" className={`${tamanho} flex-none rounded-lg object-cover ring-1 ring-white/10`} />
    : <span className={`${tamanho} flex flex-none items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10`}><Ticket size={14} className="text-[#8F8A7C]" /></span>;
}

/** Seletor de evento no visual do sistema (no lugar do select nativo). */
function SeletorEvento({ eventos, hoje, valor, onChange }: { eventos: EventoZig[]; hoje: string; valor: string | null; onChange: (id: string | null) => void }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const atual = eventos.find((e) => e.id === valor) ?? null;
  const aVenda = eventos.filter((e) => !e.data || e.data >= hoje).sort((a, b) => (a.data ?? '9').localeCompare(b.data ?? '9'));
  const realizados = eventos.filter((e) => e.data && e.data < hoje).sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
  const escolher = (id: string | null) => { onChange(id); setAberto(false); };

  const Opcao = ({ ev }: { ev: EventoZig | null }) => {
    const sel = (ev?.id ?? null) === valor;
    return (
      <button onClick={() => escolher(ev?.id ?? null)}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${sel ? 'bg-[#FFE14D]/10' : 'hover:bg-white/5'}`}>
        {ev ? <Flyer src={ev.imagem} /> : <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10"><Layers size={14} className="text-[#FFE14D]" /></span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-white">{ev ? ev.nome : 'Todos os eventos'}</span>
          <span className="block truncate text-[11px] text-[#8F8A7C]">{ev ? dataEvento(ev.data) : 'Visão geral da Lagun'}</span>
        </span>
        {sel && <Check size={14} className="flex-none text-[#FFE14D]" />}
      </button>
    );
  };

  return (
    <div ref={caixa} className="relative min-w-0">
      <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
        className="flex h-8 max-w-[260px] items-center gap-2 rounded-lg border border-[#2A2822] bg-[#1A1916] pl-1.5 pr-2 text-xs text-white hover:border-[#FFE14D]/40">
        {atual ? <Flyer src={atual.imagem} tamanho="h-5 w-5" /> : <Layers size={14} className="ml-1 text-[#FFE14D]" />}
        <span className="truncate">{atual ? atual.nome : 'Todos os eventos'}</span>
        <ChevronDown size={14} className={`flex-none text-[#8F8A7C] transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="absolute left-0 z-30 mt-1.5 max-h-[420px] w-[min(300px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-[#2A2822] bg-[#1A1916] p-1.5 shadow-2xl shadow-black/60 sm:left-auto sm:right-0">
          <Opcao ev={null} />
          {aVenda.length > 0 && <p className="px-2 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8F8A7C]">À venda</p>}
          {aVenda.map((e) => <Opcao key={e.id} ev={e} />)}
          {realizados.length > 0 && <p className="px-2 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8F8A7C]">Realizados</p>}
          {realizados.map((e) => <Opcao key={e.id} ev={e} />)}
        </div>
      )}
    </div>
  );
}

/** Cartão de evento (à venda ou realizado). Clicar abre o dashboard do evento. */
function CartaoEvento({ ev, hoje, onAbrir }: { ev: EventoZig; hoje: string; onAbrir: () => void }) {
  const faltam = ev.data ? diasEntre(hoje, ev.data.slice(0, 10)) : null;
  const futuro = faltam === null || faltam >= 0;
  const r = futuro ? ritmo(ev) : null;
  const ticketMedio = ev.ingressos ? ev.bruto / ev.ingressos : 0;
  const projIngressos = futuro && faltam !== null && faltam > 0 && ev.ult7 > 0 ? Math.round(ev.ingressos + (ev.ult7 / 7) * faltam) : null;
  return (
    <button onClick={onAbrir} className={`${cardCls} group flex w-full min-w-0 items-stretch gap-3 p-3 text-left transition-colors hover:border-[#FFE14D]/40 sm:gap-4`}>
      <Flyer src={ev.imagem} tamanho="h-[72px] w-[72px] sm:h-[88px] sm:w-[88px]" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-bold text-white" title={ev.nome}>{ev.nome}</h3>
          <ArrowUpRight size={16} className="flex-none text-[#8F8A7C] transition-colors group-hover:text-[#FFE14D]" />
        </div>
        <p className="mt-0.5 truncate text-xs text-[#8F8A7C]">
          {dataEvento(ev.data)}
          {faltam !== null && faltam >= 0 && <span className="text-[#D8D2C7]"> · {quandoFalta(faltam)}</span>}
          {ev.local && <span> · {ev.local}</span>}
        </p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <p className="text-xl font-black leading-none tabular-nums text-white">{brl(ev.bruto)}</p>
            <p className="mt-1 text-[11px] text-[#8F8A7C]">
              <span className="tabular-nums text-[#D8D2C7]">{num(ev.ingressos)}</span> ingressos
              {futuro ? <> · <span className="tabular-nums">{num(ev.ult7)}</span> em 7 dias</> : <> · ticket médio <span className="tabular-nums">{brl(ticketMedio)}</span></>}
            </p>
          </div>
          {ev.erro ? <Selo tom="ruim">leitura falhou</Selo>
            : r ? <Selo tom={r.tom} icone={r.icone}>{r.texto}</Selo>
            : futuro ? <span className="text-[11px] text-[#8F8A7C]">vendas não começaram</span>
            : <span className="text-[11px] text-[#8F8A7C]">realizado</span>}
        </div>
        {projIngressos !== null && (
          <p className="mt-1.5 text-[11px] text-[#8F8A7C]">
            No ritmo da semana chega a <span className="tabular-nums text-white">{num(projIngressos)} ingressos</span> e <span className="tabular-nums text-white">{brlCurto(ev.bruto + (projIngressos - ev.ingressos) * ticketMedio)}</span> até o dia.
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * Funil do pedido na Zig: faixas que afinam em passos iguais, "% saíram" na
 * emenda e leituras ao lado. Status da Zig: finalizado (pago), pendente
 * (aguardando pagamento) e descartado (abandonado ou recusado).
 */
const PAGOS = new Set(['finalizado', 'aprovado', 'pago', 'paid', 'approved', 'concluido', 'concluído']);
function FunilPedidos({ funil }: { funil: Record<string, number> }) {
  const entradas = Object.entries(funil);
  const iniciados = entradas.reduce((s, [, n]) => s + n, 0);
  const pagos = entradas.reduce((s, [st, n]) => s + (PAGOS.has(st) ? n : 0), 0);
  const pendentes = funil.pendente ?? 0;
  const descartados = funil.descartado ?? 0;
  const outros = iniciados - pagos - pendentes - descartados;
  const conversao = iniciados ? pagos / iniciados : 0;
  const tom: Tom = conversao >= 0.8 ? 'bom' : conversao >= 0.6 ? 'atencao' : 'ruim';
  const motivo = [descartados && `${num(descartados)} descartados`, pendentes && `${num(pendentes)} pendentes`, outros > 0 && `${num(outros)} outros`]
    .filter(Boolean).join(' · ');
  const etapas = [
    { rotulo: 'Pedidos criados', n: iniciados, fundo: 'linear-gradient(180deg,#FFE14D,#F5C400)' },
    { rotulo: 'Pagos', n: pagos, fundo: 'linear-gradient(180deg,#4ADE80,#16A34A)' },
  ];

  const leituras: { tom: Tom; titulo: string; texto: string }[] = [];
  if (descartados) leituras.push({ tom: 'ruim', titulo: 'Pedidos descartados', texto: `${num(descartados)} pedidos foram abandonados ou recusados no pagamento. O disparo de carrinho abandonado no WhatsApp recupera parte deles.` });
  if (pendentes) leituras.push({ tom: 'atencao', titulo: 'Aguardando pagamento', texto: `${num(pendentes)} pedidos ainda estão em aberto na Zig e podem virar venda.` });
  leituras.push({
    tom, titulo: 'Conversão do checkout',
    texto: `${pct(conversao)} dos pedidos criados foram pagos. ${tom === 'bom' ? 'Checkout saudável.' : tom === 'atencao' ? 'Dá para melhorar recuperando os descartados.' : 'Muita gente travando no pagamento: vale oferecer o Pix para quem tentou no cartão.'}`,
  });

  if (!iniciados) return <p className={vazioCls}>Sem pedidos no período.</p>;
  return (
    <div className="flex flex-1 flex-col gap-5 md:flex-row">
      <div className="min-w-0 flex-1 self-center">
        {etapas.map((e, i) => {
          const topo = 100 - 30 * i, base = topo - 30;
          const recuo = ((topo - base) / 2 / topo) * 100;
          const prox = etapas[i + 1];
          const saiu = prox && e.n ? Math.round((1 - prox.n / e.n) * 100) : null;
          return (
            <div key={e.rotulo} className="relative flex justify-center">
              <div className="flex h-[96px] flex-col items-center justify-center pb-2 text-[#17160f]"
                style={{ width: `${topo}%`, background: e.fundo, clipPath: `polygon(0% 0%, 100% 0%, ${100 - recuo}% 100%, ${recuo}% 100%)` }}>
                <p className="text-[11px] font-bold">{e.rotulo}</p>
                <p className="text-[26px] font-black leading-tight tabular-nums">{num(e.n)}</p>
                <p className="text-[10px] tabular-nums opacity-75">{pct(iniciados ? e.n / iniciados : 0)} dos pedidos</p>
              </div>
              {saiu !== null && (
                <span className="absolute bottom-0 left-1/2 z-10 inline-flex max-w-[95%] -translate-x-1/2 translate-y-1/2 items-center gap-1 truncate whitespace-nowrap rounded-full border border-[#2A2822] bg-[#12110E] px-2.5 py-0.5 text-[10.5px]">
                  <ArrowDown size={11} className="flex-none text-[#F87171]" />
                  <span className="font-semibold text-[#F87171]">{saiu}% saíram</span>
                  {motivo && <span className="truncate text-[#8F8A7C]">· {motivo}</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 md:w-60 md:flex-none">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8F8A7C]">Leituras</p>
        {leituras.map((l) => {
          const I = TOM[l.tom].Icone;
          return (
            <div key={l.titulo} className="rounded-lg border border-[#2A2822] bg-white/[0.02] p-3">
              <p className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${TOM[l.tom].texto}`}><I size={12} />{l.titulo}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#B8B2A6]">{l.texto}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Estado vazio: RPC ainda não existe (migração não aplicada) ou nenhum evento ligado. */
function Aviso({ titulo, texto, acao }: { titulo: string; texto: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <div className={`${cardCls} p-6 text-center`}>
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFE14D]/10 text-[#FFE14D]"><Database size={20} /></span>
        <h1 className="mt-3 text-lg font-bold text-white">{titulo}</h1>
        <div className="mt-2 text-sm leading-relaxed text-[#8F8A7C]">{texto}</div>
        {acao && <div className="mt-4">{acao}</div>}
      </div>
    </div>
  );
}

const rpcAusente = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === '42883' || /zig_dashboard|could not find the function|lagun_zig_tickets|does not exist/i.test(e.message ?? '');

// ── página ───────────────────────────────────────────────────────────────────
export default function InternoVisaoGeral() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [erro, setErro] = useState<{ tipo: 'migracao' | 'outro'; msg: string } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>('tudo');
  // Evento na URL (?evento=id): o voltar do navegador sai do dashboard do evento.
  const [busca, setBusca] = useSearchParams();
  const evento = busca.get('evento') || null;
  const setEvento = useCallback((id: string | null) => {
    setBusca(id === null ? {} : { evento: id });
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, [setBusca]);
  const [rankCupom, setRankCupom] = useState<'ingressos' | 'valor'>('ingressos');
  const [atualizando, setAtualizando] = useState(false);
  const [meta, setMeta] = useState<{ estado: 'carregando' | 'ok' | 'desconectada'; gasto: number; conta?: string; contas: { account_id: string; name: string }[] }>({ estado: 'carregando', gasto: 0, contas: [] });
  // Campanhas vinculadas a eventos (todas, para mostrar onde cada uma está).
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [nomesEventos, setNomesEventos] = useState<Map<string, string>>(new Map());
  const [versaoVinculos, setVersaoVinculos] = useState(0);
  const [disparosEv, setDisparosEv] = useState<Disparo[]>([]);
  const [whats, setWhats] = useState({ marketing: 0, utilidade: 0 });

  const hoje = dash?.hoje ?? new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const dias = PERIODOS.find((p) => p.id === periodo)!.dias;

  const intervalo = useMemo(() => {
    const desde = dias ? new Date(Date.now() - dias * 86400_000).toISOString() : null;
    const desdeDia = dias ? somarDias(hoje, -(dias - 1)) : '2024-01-01';
    return { desde, desdeDia, ateDia: hoje };
  }, [dias, hoje]);

  const carregar = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc('zig_dashboard', { p_inicio: intervalo.desde, p_fim: null, p_event_id: evento });
    if (error) setErro({ tipo: rpcAusente(error) ? 'migracao' : 'outro', msg: error.message ?? String(error) });
    else { setDash(data as Dash); setErro(null); }
    setCarregando(false);
  }, [intervalo.desde, evento]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [{ data }, { data: evs }] = await Promise.all([
        (supabase as any).from('lagun_event_campaigns').select('campaign_id, event_id, campaign_name, account_id'),
        (supabase as any).from('lagun_events').select('id, nome'),
      ]);
      if (!vivo) return;
      setVinculos((data ?? []) as Vinculo[]);
      setNomesEventos(new Map(((evs ?? []) as any[]).map((e) => [e.id, e.nome ?? ''])));
    })();
    return () => { vivo = false; };
  }, [versaoVinculos]);

  // Meta Ads: contas da meta-ads-api; sem token configurado fica "desconectada".
  // No evento soma só as campanhas vinculadas, cada uma na própria conta.
  useEffect(() => {
    let vivo = true;
    (async () => {
      setMeta((m) => ({ ...m, estado: 'carregando' }));
      try {
        let contas = meta.contas;
        if (!contas.length) {
          const r = await supabase.functions.invoke('meta-ads-api?action=accounts', { method: 'GET' });
          contas = ((r.data as any)?.data ?? []) as { account_id: string; name: string }[];
        }
        if (!contas.length) { if (vivo) setMeta({ estado: 'desconectada', gasto: 0, contas: [] }); return; }
        let salva: string | null = null;
        try { salva = localStorage.getItem(CONTA_META_KEY); } catch { /* sem storage */ }
        const conta = meta.conta || contas.find((c) => c.account_id === salva)?.account_id || contas[0].account_id;
        const periodo = `since=${intervalo.desdeDia}&until=${intervalo.ateDia}`;
        if (!evento) {
          const r = await supabase.functions.invoke(`meta-ads-api?action=account_insights&account_id=${conta}&${periodo}`, { method: 'GET' });
          const gasto = Number((r.data as any)?.data?.[0]?.spend || 0);
          if (vivo) setMeta({ estado: r.error ? 'desconectada' : 'ok', gasto, conta, contas });
          return;
        }
        const porConta = new Map<string, string[]>();
        for (const v of vinculos.filter((x) => x.event_id === evento)) {
          const c = (v.account_id || conta).replace(/^act_/, '');
          porConta.set(c, [...(porConta.get(c) ?? []), v.campaign_id]);
        }
        const respostas = await Promise.all([...porConta].map(([c, ids]) => supabase.functions.invoke(
          `meta-ads-api?action=account_insights&account_id=${c}&campaign_ids=${ids.join(',')}&${periodo}`, { method: 'GET' })));
        const falhou = respostas.some((r) => r.error || (r.data as any)?.error);
        const gasto = respostas.reduce((s, r) => s + Number((r.data as any)?.data?.[0]?.spend || 0), 0);
        if (vivo) setMeta({ estado: falhou ? 'desconectada' : 'ok', gasto, conta, contas });
      } catch {
        if (vivo) setMeta({ estado: 'desconectada', gasto: 0, contas: [] });
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalo.desdeDia, intervalo.ateDia, meta.conta, evento, vinculos]);

  // WhatsApp: templates enviados no período (marketing x utilidade), só contagem.
  // No evento: os disparos vinculados a ele e os envios automáticos (carrinho é
  // template de marketing, por causa do cupom; estorno é utilidade).
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (evento) {
        const envios = (tipo: string) => {
          let q = (supabase as any).from('lagun_zig_carrinho_envios').select('order_id', { count: 'exact', head: true })
            .eq('event_id', evento).eq('tipo', tipo).eq('ok', true);
          if (intervalo.desde) q = q.gte('enviado_em', intervalo.desde);
          return q;
        };
        const [carrinho, estorno, disp] = await Promise.all([
          envios('carrinho'), envios('estorno'),
          (supabase as any).rpc('whatsapp_disparos', { p_desde: intervalo.desde ? intervalo.desdeDia : null }),
        ]);
        const doEvento = ((disp.data ?? []) as Disparo[]).filter((d) => d.event_id === evento);
        const soma = (util: boolean) => doEvento.filter((d) => (d.categoria === 'UTILITY') === util).reduce((s, d) => s + Number(d.enviados), 0);
        if (!vivo) return;
        setDisparosEv(doEvento);
        setWhats({ marketing: (carrinho.count ?? 0) + soma(false), utilidade: (estorno.count ?? 0) + soma(true) });
        return;
      }
      const base = () => {
        let q = (supabase as any).from('whatsapp_messages').select('id', { count: 'exact', head: true })
          .eq('direction', 'outgoing').eq('message_type', 'template');
        if (intervalo.desde) q = q.gte('timestamp', intervalo.desde);
        return q;
      };
      const [todos, util] = await Promise.all([base(), base().eq('template_category', 'UTILITY')]);
      const total = todos.count ?? 0, utilidade = util.count ?? 0;
      if (vivo) setWhats({ marketing: Math.max(0, total - utilidade), utilidade });
    })();
    return () => { vivo = false; };
  }, [intervalo.desde, intervalo.desdeDia, evento, versaoVinculos]);

  // Atualizar: lê a Zig agora (um evento ou todos os ligados) e recarrega.
  async function atualizar() {
    if (!dash) return;
    setAtualizando(true);
    try {
      const alvos = evento ? [evento] : dash.eventos.map((e) => e.id);
      await Promise.all(alvos.map((id) =>
        supabase.functions.invoke(`lagun-zig-sync?action=sincronizar&event_id=${encodeURIComponent(id)}`, { method: 'POST', body: {} }).catch(() => null)));
      await carregar();
    } finally { setAtualizando(false); }
  }

  // Série do gráfico: horas nas 24h; dias (com zeros) nos outros períodos.
  const serie = useMemo(() => {
    if (!dash) return [];
    if (periodo === '24h') {
      const mapa = new Map(dash.por_hora.map((p) => [p.t.slice(0, 13), p]));
      const agora = new Date(Date.now() - 3 * 3600_000);
      return Array.from({ length: 24 }, (_, i) => {
        const d = new Date(agora.getTime() - (23 - i) * 3600_000);
        const chave = d.toISOString().slice(0, 13); // horário de Brasília
        const p = mapa.get(chave) ?? { t: chave, bruto: 0, ingressos: 0, pedidos: 0 };
        const h = d.getUTCHours();
        return { ...p, curto: `${h}h`, rotulo: `${diaCurto(d.toISOString().slice(0, 10))} · ${h}h` };
      });
    }
    const mapa = new Map(dash.por_dia.map((p) => [p.t.slice(0, 10), p]));
    const inicio = dias ? somarDias(hoje, -(dias - 1)) : (dash.por_dia[0]?.t.slice(0, 10) ?? hoje);
    const total = Math.max(1, Math.min(400, diasEntre(inicio, hoje) + 1));
    return Array.from({ length: total }, (_, i) => {
      const dia = somarDias(inicio, i);
      const p = mapa.get(dia) ?? { t: dia, bruto: 0, ingressos: 0, pedidos: 0 };
      return { ...p, curto: diaCurto(dia), rotulo: `${diaCurto(dia)}${dia === hoje ? ' · hoje, até agora' : ''}` };
    });
  }, [dash, periodo, dias, hoje]);

  // ── estados de carga e erro ────────────────────────────────────────────────
  if (erro && !dash) {
    if (erro.tipo === 'migracao') {
      return (
        <Aviso titulo="Visão geral ainda não ligada ao banco"
          texto={<>Os números de venda da Zig dependem da migração <code className="rounded bg-white/5 px-1 py-0.5 text-[12px] text-[#D8D2C7]">{MIGRACAO}</code>, que ainda não foi aplicada. Depois de aplicar, clique em Atualizar no topo para ler a Zig e preencher setores, lotes e cupons.</>}
          acao={<button onClick={() => { setCarregando(true); void carregar(); }} className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2822] px-3 py-2 text-xs font-semibold text-white hover:border-[#FFE14D]/40"><RefreshCw size={14} /> Tentar de novo</button>} />
      );
    }
    return (
      <Aviso titulo="Não consegui carregar a visão geral" texto={erro.msg}
        acao={<button onClick={() => { setCarregando(true); void carregar(); }} className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2822] px-3 py-2 text-xs font-semibold text-white hover:border-[#FFE14D]/40"><RefreshCw size={14} /> Tentar de novo</button>} />
    );
  }
  if (!dash || (carregando && !dash)) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className={`${cardCls} h-24 animate-pulse`} />)}</div>
        <div className="grid gap-4 lg:grid-cols-3"><div className={`${cardCls} h-72 animate-pulse lg:col-span-2`} /><div className={`${cardCls} h-72 animate-pulse`} /></div>
      </div>
    );
  }
  if (dash.eventos.length === 0) {
    return (
      <Aviso titulo="Nenhum evento ligado à Zig"
        texto="Assim que um evento tiver o id e o token da Zig salvos, as vendas aparecem aqui sozinhas, a cada 10 minutos." />
    );
  }

  // ── números ────────────────────────────────────────────────────────────────
  const k = dash.kpis;
  const rotuloPeriodo = PERIODOS.find((p) => p.id === periodo)!.rotulo.toLowerCase();
  const temDetalhe = k.ingressos_detalhados > 0;
  // k.bruto já é a receita do produtor (soma dos ingressos, sem a taxa da Zig).
  const naoPagos = Object.entries(dash.funil).filter(([st]) => !PAGOS.has(st)).reduce((s, [, n]) => s + n, 0);
  const ticketMedio = k.ingressos ? k.bruto / k.ingressos : 0;
  const custoWhats = whats.marketing * WHATSAPP_R$.marketing + whats.utilidade * WHATSAPP_R$.utilidade;
  const custoTotal = (meta.estado === 'ok' ? meta.gasto : 0) + custoWhats;
  const roas = custoTotal > 0 ? k.bruto / custoTotal : null;
  const cupons = [...dash.cupons].sort((a, b) => b[rankCupom] - a[rankCupom]).slice(0, 8);
  const setores = dash.setores.slice(0, 8);
  const lotes = dash.lotes.slice(0, 8);
  const totalPag = dash.pagamento.reduce((s, p) => s + p.valor, 0);
  const aVenda = dash.eventos.filter((e) => !e.data || e.data >= hoje).sort((a, b) => (a.data ?? '9').localeCompare(b.data ?? '9'));
  const passados = dash.eventos.filter((e) => e.data && e.data < hoje).sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
  const ev = evento === null ? null : dash.eventos.find((e) => e.id === evento) ?? null;
  const campanhasEv = ev ? vinculos.filter((v) => v.event_id === ev.id) : [];
  const faltam = ev?.data ? diasEntre(hoje, ev.data.slice(0, 10)) : null;
  const semDetalhe = <p className={vazioCls}>Setor e lote chegam na próxima leitura da Zig.</p>;

  // ── painéis ────────────────────────────────────────────────────────────────
  const painelCupons = (
    <Painel titulo="Vendas por cupom" icone={<BadgePercent size={15} />}
      subtitulo={rankCupom === 'ingressos' ? 'Ranking por quantidade de ingressos' : 'Ranking por receita'}
      acao={(
        <div className="flex flex-none rounded-md border border-[#2A2822] p-0.5">
          {(['ingressos', 'valor'] as const).map((c) => (
            <button key={c} onClick={() => setRankCupom(c)}
              className={`rounded px-2 py-1 text-[10px] font-bold ${rankCupom === c ? 'bg-[#FFE14D] text-[#17160f]' : 'text-[#8F8A7C] hover:text-white'}`}>
              {c === 'ingressos' ? 'Qnt.' : 'R$'}
            </button>
          ))}
        </div>
      )}>
      {cupons.length === 0 ? <p className={vazioCls}>Nenhum pedido com cupom no período.</p> : (
        <>
          <Ranking itens={cupons.map((c) => ({ nome: c.codigo, ingressos: c.ingressos, valor: c.valor }))} medida={rankCupom} />
          {k.desconto > 0 && <p className="mt-3 text-[11px] text-[#8F8A7C]">{brl(k.desconto, true)} em descontos concedidos no período.</p>}
        </>
      )}
    </Painel>
  );

  const painelPagamento = (
    <Painel titulo="Formas de pagamento" icone={<CreditCard size={15} />} subtitulo="Parte da receita">
      {dash.pagamento.length === 0 ? <p className={vazioCls}>Sem vendas no período.</p> : (
        <>
          <BarraDivisao partes={dash.pagamento.slice(0, 5).map((p, i) => ({ rotulo: nomePagamento(p.nome), valor: p.valor, tom: corPagamento(p.nome, i) }))} />
          <ul className="mt-4 space-y-1.5 text-sm">
            {dash.pagamento.map((p, i) => (
              <li key={p.nome} className="flex justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-2 text-[#D8D2C7]"><span className={`h-2 w-2 flex-none rounded-full ${corPagamento(p.nome, i)}`} /><span className="truncate">{nomePagamento(p.nome)}</span> <span className="flex-none text-xs text-[#8F8A7C]">· {num(p.pedidos ?? 0)} pedidos</span></span>
                <span className="flex-none tabular-nums text-white">{totalPag ? pct(p.valor / totalPag) : '-'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Painel>
  );

  const painelSetores = (
    <Painel titulo="Ingressos por setor" icone={<Layers size={15} />} subtitulo="Setor do ingresso na Zig · valor sem taxa">
      {!temDetalhe && k.ingressos > 0 ? semDetalhe : setores.length === 0 ? <p className={vazioCls}>Sem vendas no período.</p> : (
        <Ranking cor="bg-gradient-to-r from-[#2DD4BF] to-[#5EEAD4]" itens={setores} medida="ingressos" />
      )}
    </Painel>
  );

  const painelLotes = (
    <Painel titulo="Lotes que mais faturam" icone={<Ticket size={15} />} subtitulo="Setor e lote como estão na Zig · valor sem taxa">
      {!temDetalhe && k.ingressos > 0 ? semDetalhe : lotes.length === 0 ? <p className={vazioCls}>Sem vendas no período.</p> : (
        <Ranking cor="bg-gradient-to-r from-[#F59E0B] to-[#FFE14D]" itens={lotes} medida="valor" />
      )}
    </Painel>
  );

  const painelHorarios = (
    <Painel titulo="Quando o público compra" icone={<Clock size={15} />} subtitulo={`Ingressos por dia da semana e hora · ${rotuloPeriodo}`}>
      <MapaHorarios dados={dash.hora_semana} />
    </Painel>
  );

  const painelFunil = (
    <Painel className="lg:col-span-2" titulo="Funil de pedidos" icone={<ShoppingCart size={15} />} subtitulo="Do pedido criado na Zig ao pago">
      <div className="flex flex-1 flex-col justify-center"><FunilPedidos funil={dash.funil} /></div>
    </Painel>
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        {ev ? (
          <div className="flex min-w-0 items-center gap-3">
            <Flyer src={ev.imagem} tamanho="h-14 w-14" />
            <div className="min-w-0">
              <button onClick={() => setEvento(null)} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8F8A7C] hover:text-[#FFE14D]">
                <ArrowLeft size={12} /> Visão geral
              </button>
              <h1 className="truncate text-xl font-bold text-white sm:text-2xl" title={ev.nome}>{ev.nome}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[#8F8A7C]">
                <span className="inline-flex items-center gap-1"><CalendarDays size={12} />{dataEvento(ev.data)}</span>
                {faltam !== null && faltam >= 0 && <span className="text-[#D8D2C7]">{quandoFalta(faltam)}</span>}
                {faltam !== null && faltam < 0 && <span>realizado</span>}
                {ev.local && <span className="inline-flex items-center gap-1"><MapPin size={12} />{ev.local}</span>}
                <span>· atualizada {haQuanto(dash.atualizado_em)}</span>
                {ev.link && <a href={ev.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[#FFE14D]">· Página de venda <ExternalLink size={11} /></a>}
              </p>
              {ev.erro && <p className="mt-1"><Selo tom="ruim">última leitura da Zig falhou: {ev.erro.slice(0, 80)}</Selo></p>}
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Activity size={20} className="text-[#FFE14D]" /><h1 className="text-xl font-bold text-white sm:text-2xl">Visão geral</h1></div>
            <p className="mt-0.5 text-xs text-[#8F8A7C]">
              Vendas da Zig · {num(dash.eventos.length)} {dash.eventos.length === 1 ? 'evento ligado' : 'eventos ligados'} · {num(k.pedidos)} pedidos pagos · atualizada {haQuanto(dash.atualizado_em)}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <SeletorEvento eventos={dash.eventos} hoje={hoje} valor={evento} onChange={setEvento} />
          <div className="flex items-center gap-0.5 rounded-lg border border-[#2A2822] bg-[#1A1916] p-0.5">
            {PERIODOS.map((p) => (
              <button key={p.id} onClick={() => setPeriodo(p.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${periodo === p.id ? 'bg-[#FFE14D] text-[#17160f]' : 'text-[#8F8A7C] hover:bg-white/5 hover:text-white'}`}>
                {p.rotulo}
              </button>
            ))}
          </div>
          <button onClick={() => void atualizar()} disabled={atualizando} title="Ler a Zig agora"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#2A2822] text-[#D8D2C7] hover:border-[#FFE14D]/40 hover:text-white disabled:opacity-50">
            <RefreshCw size={14} className={atualizando ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {erro && <p className="text-xs text-[#F87171]">Não consegui atualizar os números agora: {erro.msg}</p>}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi destaque icone={<DollarSign size={15} />} rotulo={`Receita (${rotuloPeriodo})`} valor={brl(k.bruto)}
          sub="do produtor · sem a taxa da Zig" />
        <Kpi icone={<XCircle size={15} />} rotulo="Pedidos não pagos" valor={num(naoPagos)}
          sub="pendentes e descartados no período" />
        <Kpi icone={<Ticket size={15} />} rotulo={`Ingressos (${rotuloPeriodo})`} valor={num(k.ingressos)}
          sub={dash.cortesias ? `${num(dash.cortesias)} cortesias${dash.passaportes ? ` · ${num(dash.passaportes)} passaportes` : ''}` : dash.passaportes ? `${num(dash.passaportes)} passaportes` : 'nenhuma cortesia'} />
        <Kpi icone={<ShoppingCart size={15} />} rotulo="Pedidos pagos" valor={num(k.pedidos)}
          sub={`${(k.pedidos ? k.ingressos / k.pedidos : 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ingressos por pedido`} />
        <Kpi icone={<Receipt size={15} />} rotulo="Ticket médio" valor={brl(ticketMedio, true)} sub="receita ÷ ingressos" />
        <Kpi icone={<BadgePercent size={15} />} rotulo="Vendas com cupom" valor={brl(k.cupom_bruto)}
          sub={k.bruto ? `${pct(k.cupom_bruto / k.bruto)} da receita · ${num(k.cupom_pedidos)} pedidos` : '-'} />
      </div>

      {/* Eventos à venda: clicar abre o dashboard do evento */}
      {!ev && aVenda.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-0.5">
            <h2 className="text-sm font-bold text-white">Eventos à venda</h2>
            <p className="text-[11px] text-[#8F8A7C]">Desde o início das vendas · clique para abrir o dashboard do evento</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {aVenda.map((e) => <CartaoEvento key={e.id} ev={e} hoje={hoje} onAbrir={() => setEvento(e.id)} />)}
          </div>
        </section>
      )}

      {/* Receita + custos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Painel className="lg:col-span-2" titulo="Receita" icone={<Activity size={15} />}
          subtitulo={`Receita do produtor ${periodo === '24h' ? 'por hora nas últimas 24h' : 'por dia'} · ${brl(k.bruto)}`}>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              {serie.length > 45 ? (
                <AreaChart data={serie} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vg-rec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={AMARELO} stopOpacity={0.35} /><stop offset="1" stopColor={AMARELO} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,.06)" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="curto" tick={eixo} axisLine={false} tickLine={false} minTickGap={28} />
                  <YAxis tick={eixo} axisLine={false} tickLine={false} tickFormatter={eixoValor} width={44} />
                  <Tooltip content={<DicaSerie />} cursor={{ stroke: 'rgba(255,225,77,.4)' }} />
                  <Area type="monotone" dataKey="bruto" stroke={AMARELO} strokeWidth={2} fill="url(#vg-rec)" isAnimationActive={false} />
                </AreaChart>
              ) : (
                <BarChart data={serie} margin={{ top: 5, right: 8, left: -8, bottom: 0 }} barCategoryGap={2}>
                  <defs>
                    <linearGradient id="vg-barra" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={AMARELO} /><stop offset="1" stopColor={AMARELO} stopOpacity={0.45} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,.06)" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="curto" tick={eixo} axisLine={false} tickLine={false} minTickGap={20} />
                  <YAxis tick={eixo} axisLine={false} tickLine={false} tickFormatter={eixoValor} width={44} />
                  <Tooltip content={<DicaSerie />} cursor={{ fill: 'rgba(255,225,77,.06)' }} />
                  <Bar dataKey="bruto" fill="url(#vg-barra)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel titulo="Custos de marketing" icone={<Megaphone size={15} />} subtitulo={`Investimento · ${rotuloPeriodo}${ev ? ' · só deste evento' : ' · conta inteira'}`}>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-[#2A2822] bg-white/[0.02] p-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#FFE14D]/10 text-[#FFE14D]"><Megaphone size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#8F8A7C]">Meta Ads</p>
                {meta.estado === 'carregando' ? <p className="mt-1 h-5 w-24 animate-pulse rounded bg-white/10" /> :
                  meta.estado === 'ok' ? <p className="text-xl font-bold tabular-nums text-white">{brl(meta.gasto)}</p> :
                    <p className="text-sm font-medium text-[#FB923C]">Conta de anúncios não conectada</p>}
                {ev && meta.estado !== 'desconectada' ? (
                  <>
                    <p className="text-[11px] text-[#8F8A7C]">{campanhasEv.length ? 'soma das campanhas vinculadas' : 'nenhuma campanha vinculada ainda'}</p>
                    {meta.conta && (
                      <CampanhasDoEvento eventoId={ev.id} conta={meta.conta} vinculos={vinculos} nomesEventos={nomesEventos}
                        onMudou={() => setVersaoVinculos((n) => n + 1)} />
                    )}
                  </>
                ) : meta.estado === 'ok' && meta.contas.length > 1 ? (
                  <select value={meta.conta} onChange={(e) => { try { localStorage.setItem(CONTA_META_KEY, e.target.value); } catch { /* ok */ } setMeta((m) => ({ ...m, conta: e.target.value })); }}
                    className="mt-1 max-w-full truncate bg-transparent text-[11px] text-[#8F8A7C] outline-none">
                    {meta.contas.map((c) => <option key={c.account_id} value={c.account_id} className="bg-[#1A1916]">{c.name}</option>)}
                  </select>
                ) : <p className="text-[11px] text-[#8F8A7C]">{meta.estado === 'ok' ? 'valor real da conta de anúncios' : 'entra sozinho quando a conta estiver ligada'}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-[#2A2822] bg-white/[0.02] p-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#FFE14D]/10 text-[#FFE14D]"><MessageCircle size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#8F8A7C]">WhatsApp <span className="text-[10px]">(estimado)</span></p>
                <p className="text-xl font-bold tabular-nums text-white">{brl(custoWhats, true)}</p>
                <p className="text-[11px] text-[#8F8A7C]">{num(whats.marketing)} marketing · {num(whats.utilidade)} utilidade{ev ? ' · disparos + carrinho e estorno' : ''}</p>
                {ev && <DisparosDoEvento eventoId={ev.id} vinculados={disparosEv} nomesEventos={nomesEventos} onMudou={() => setVersaoVinculos((n) => n + 1)} />}
              </div>
            </div>
            <div className="space-y-1.5 border-t border-[#2A2822] pt-3 text-xs">
              <div className="flex items-center justify-between"><span className="text-[#8F8A7C]">Custo total</span><span className="font-bold tabular-nums text-white">{brl(custoTotal)}</span></div>
              <div className="flex items-center justify-between">
                <span className="text-[#8F8A7C]">ROAS <span className="text-[10px]">(receita ÷ custo)</span></span>
                {roas === null ? <span className="text-[#8F8A7C]">-</span>
                  : <Selo tom={roas >= 5 ? 'bom' : roas >= 2 ? 'atencao' : 'ruim'}>{roas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x</Selo>}
              </div>
            </div>
          </div>
        </Painel>
      </div>

      {ev ? (
        <>
          {/* Dashboard do evento */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {painelFunil}
            <div className="flex flex-col gap-4 [&>section]:flex-1">
              {painelSetores}
              {painelPagamento}
              {painelCupons}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.4fr]">
            <CarrinhoZig eventoId={ev.id} cardCls={cardCls} />
            {painelHorarios}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {painelFunil}
            <div className="flex flex-col gap-4 [&>section]:flex-1">
              {painelSetores}
              {painelPagamento}
              {painelCupons}
            </div>
          </div>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_1.4fr]">
            {painelLotes}
            {painelHorarios}
          </div>

          {/* Eventos realizados */}
          {passados.length > 0 && (
            <section className="pt-2">
              <div className="mb-3">
                <h2 className="flex items-center gap-2 font-bold text-white"><CalendarDays size={16} className="text-[#FFE14D]" />Eventos realizados</h2>
                <p className="text-xs text-[#8F8A7C]">Fechamento de cada um desde o início das vendas · clique para ver setores, lotes, pagamento e cupons</p>
              </div>
              <div className="grid items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {passados.map((e) => <CartaoEvento key={e.id} ev={e} hoje={hoje} onAbrir={() => setEvento(e.id)} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
