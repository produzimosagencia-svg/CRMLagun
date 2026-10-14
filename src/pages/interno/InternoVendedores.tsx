import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, Copy, Crown, Flame, Loader2, MessageCircle, Pencil, Plus, Target, Ticket, Trash2, UserPlus, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { confirmDialog } from '@/components/ConfirmDialog';
import { BarraIndicadores, CORES } from '@/components/interno/BarraIndicadores';
import { formatPhone } from '@/lib/formatPhone';
import { toast } from 'sonner';
import {
  META_VAZIA, RESUMO_VAZIO, fmtBRL, fmtNum, inicioDaSemana, limitesDoMes, mesAtual, nomeDoMes, pct, somarMeses,
  ultimasSemanas, useListaVendedores, useResumoDoMes,
  type MensagensDia, type Meta, type Resumo, type VendaEvento, type VendaManual, type Vendedor,
} from '@/components/vendedores/useVendedores';

/**
 * Vendedores (/interno/vendedores/:aba).
 *
 * Abas: ranking mensal · panorama geral · performance (mensagens por semana e
 * vendas por evento) · metas pessoais do mês · cadastro dos vendedores.
 * As somas vêm prontas do banco (ver a migration de vendedores).
 */

const OURO = '#D9B14E';
const ABAS = ['ranking', 'panorama', 'performance', 'metas', 'cadastro'] as const;
type Aba = typeof ABAS[number];

const TITULOS: Record<Aba, { titulo: string; sub: string }> = {
  ranking: { titulo: 'Ranking mensal', sub: 'Quem mais vendeu no mês.' },
  panorama: { titulo: 'Panorama geral', sub: 'Todos os vendedores lado a lado, com as metas do mês.' },
  performance: { titulo: 'Performance', sub: 'Mensagens por semana e vendas por evento.' },
  metas: { titulo: 'Metas pessoais', sub: 'As metas de cada vendedor, definidas todo mês.' },
  cadastro: { titulo: 'Cadastro de vendedores', sub: 'Nome, telefone e os cupons que contam como venda de cada um.' },
};

export default function InternoVendedores() {
  const { aba = 'ranking' } = useParams<{ aba: string }>();
  const lista = useListaVendedores();
  const [mes, setMes] = useState(mesAtual());
  const [versao, setVersao] = useState(0);
  const [lancando, setLancando] = useState(false);
  const atualizar = () => setVersao((v) => v + 1);

  if (!ABAS.includes(aba as Aba)) return <Navigate to="/interno/vendedores/ranking" replace />;
  const atual = aba as Aba;
  const semVendedores = !lista.carregando && lista.vendedores.length === 0;

  return (
    <div className="space-y-5 max-md:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold text-foreground max-md:text-lg">{TITULOS[atual].titulo}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{TITULOS[atual].sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {atual !== 'cadastro' && atual !== 'performance' && <SeletorMes mes={mes} onChange={setMes} />}
          {atual !== 'cadastro' && !semVendedores && (
            <button onClick={() => setLancando(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white transition-colors hover:brightness-110" style={{ background: OURO }}>
              <Plus size={15} /> Lançar venda
            </button>
          )}
        </div>
      </div>

      {lista.carregando ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div>
      ) : semVendedores && atual !== 'cadastro' ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <UserPlus size={28} className="text-muted-foreground/60" />
          <p className="text-sm text-foreground/80">Nenhum vendedor cadastrado ainda.</p>
          <Link to="/interno/vendedores/cadastro" className="rounded-lg px-4 py-2 text-xs font-semibold text-white" style={{ background: OURO }}>Cadastrar vendedores</Link>
        </div>
      ) : atual === 'ranking' ? <Ranking vendedores={lista.ativos} mes={mes} versao={versao} />
        : atual === 'panorama' ? <Panorama vendedores={lista.ativos} mes={mes} versao={versao} />
        : atual === 'performance' ? <Performance vendedores={lista.ativos} versao={versao} onMudou={atualizar} />
        : atual === 'metas' ? <Metas vendedores={lista.ativos} mes={mes} versao={versao} />
        : <Cadastro vendedores={lista.vendedores} onMudou={lista.recarregar} />}

      <DialogoVenda aberto={lancando} onFechar={() => setLancando(false)} vendedores={lista.ativos} onSalvou={atualizar} />
    </div>
  );
}

// ── Peças comuns ───────────────────────────────────────────────────────────
function SeletorMes({ mes, onChange }: { mes: string; onChange: (m: string) => void }) {
  const noFuturo = mes >= mesAtual();
  return (
    <div className="flex h-9 items-center rounded-lg border border-border bg-card">
      <button onClick={() => onChange(somarMeses(mes, -1))} className="flex h-full w-8 items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Mês anterior"><ChevronLeft size={15} /></button>
      <span className="min-w-[132px] text-center text-xs font-semibold text-foreground">{nomeDoMes(mes)}</span>
      <button onClick={() => onChange(somarMeses(mes, 1))} disabled={noFuturo} className="flex h-full w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Próximo mês"><ChevronRight size={15} /></button>
    </div>
  );
}

function Quadro({ titulo, extra, children, className = '' }: { titulo: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-foreground">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Barra({ valor, cor = OURO }: { valor: number; cor?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, valor))}%`, background: cor }} />
    </div>
  );
}

const Vazio = ({ children }: { children: ReactNode }) => <p className="px-4 py-10 text-center text-xs text-muted-foreground">{children}</p>;

// ── Ranking mensal ─────────────────────────────────────────────────────────
type Criterio = 'ingressos' | 'receita' | 'mensagens';
const CRITERIOS: { chave: Criterio; rotulo: string; fmt: (v: number) => string }[] = [
  { chave: 'ingressos', rotulo: 'Ingressos', fmt: fmtNum },
  { chave: 'receita', rotulo: 'Receita', fmt: fmtBRL },
  { chave: 'mensagens', rotulo: 'Mensagens', fmt: fmtNum },
];

const PODIO = [
  { cor: '#FFD54A', brilho: 'rgba(255,213,74,.55)', altura: 'h-28 max-md:h-24', titulo: 'CAMPEÃO' },
  { cor: '#C9D6E8', brilho: 'rgba(201,214,232,.4)', altura: 'h-20 max-md:h-16', titulo: 'VICE' },
  { cor: '#E08A4A', brilho: 'rgba(224,138,74,.4)', altura: 'h-14 max-md:h-12', titulo: '3º LUGAR' },
];
const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

const ANIMACOES_RANKING = `
@keyframes rk-sobe { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes rk-entra { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes rk-pulsa { 0%, 100% { box-shadow: 0 0 0 3px #FFD54A, 0 0 26px rgba(255,213,74,.55); } 50% { box-shadow: 0 0 0 3px #FFD54A, 0 0 46px rgba(255,213,74,.9); } }
@keyframes rk-flutua { 0%, 100% { transform: translateY(0) rotate(-6deg); } 50% { transform: translateY(-4px) rotate(4deg); } }
.rk-sobe { transform-origin: bottom; animation: rk-sobe .7s cubic-bezier(.2,.8,.2,1) both; }
.rk-entra { animation: rk-entra .5s cubic-bezier(.2,.7,.2,1) both; }
.rk-pulsa { animation: rk-pulsa 2.4s ease-in-out infinite; }
.rk-flutua { animation: rk-flutua 3s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .rk-sobe, .rk-entra, .rk-pulsa, .rk-flutua { animation: none !important; } }
`;

/**
 * Ranking em clima de placar de jogo: arena com o pódio, placar da temporada
 * ao lado (total do time, meta, dias restantes, destaques) e a classificação
 * completa embaixo.
 */
function Ranking({ vendedores, mes, versao }: { vendedores: Vendedor[]; mes: string; versao: number }) {
  const { resumo, metas, carregando } = useResumoDoMes(mes, versao);
  const [criterio, setCriterio] = useState<Criterio>('ingressos');
  const c = CRITERIOS.find((x) => x.chave === criterio)!;
  const linhas = useMemo(() => vendedores.map((v) => ({ v, r: resumo.get(v.id) ?? RESUMO_VAZIO })), [vendedores, resumo]);
  const ordenados = useMemo(
    () => [...linhas].sort((a, b) => b.r[criterio] - a.r[criterio] || a.v.nome.localeCompare(b.v.nome)),
    [linhas, criterio],
  );
  const maior = Math.max(1, ...ordenados.map((x) => x.r[criterio]));
  const chaveMeta = `meta_${criterio}` as keyof Meta;
  const metaDe = (id: string) => pct((resumo.get(id) ?? RESUMO_VAZIO)[criterio], (metas.get(id) ?? META_VAZIA)[chaveMeta]);
  const podio = ordenados.slice(0, 3);
  // Ordem visual do pódio: 2º, 1º, 3º.
  const ordemPodio = [1, 0, 2].filter((i) => podio[i]);
  const [a, m] = mes.split('-').map(Number);
  const temporada = `${new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })} ${a}`.toUpperCase();

  // Placar da temporada.
  const totalTime = linhas.reduce((t, x) => t + x.r[criterio], 0);
  const metaTime = vendedores.reduce((t, v) => t + (metas.get(v.id) ?? META_VAZIA)[chaveMeta], 0);
  const pctTime = pct(totalTime, metaTime);
  const ultimoDia = new Date(a, m, 0).getDate();
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const diasRestantes = mes === mesAtual() ? ultimoDia - Number(hoje.slice(8, 10)) : null;
  const lider = (k: Criterio) => [...linhas].sort((x, y) => y.r[k] - x.r[k])[0];
  const destaques = CRITERIOS.map((k) => ({ ...k, l: lider(k.chave) })).filter((d) => d.l && d.l.r[d.chave] > 0);

  if (carregando) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-[#FFD54A]" size={24} /></div>;

  return (
    <div className="space-y-4">
      <style>{ANIMACOES_RANKING}</style>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Arena */}
        <section
          className="relative overflow-hidden rounded-2xl border border-[#FFD54A]/20"
          style={{ background: 'radial-gradient(70% 55% at 50% 38%, rgba(255,213,74,.20), transparent 70%), radial-gradient(50% 45% at 8% 100%, rgba(122,90,255,.18), transparent 70%), radial-gradient(45% 40% at 95% 95%, rgba(255,120,80,.10), transparent 70%), #07070C' }}
        >
          {/* Holofotes atrás do pódio. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-full opacity-60" style={{ background: 'conic-gradient(from 180deg at 50% -10%, transparent 150deg, rgba(255,213,74,.10) 165deg, transparent 178deg, rgba(255,213,74,.12) 180deg, transparent 182deg, rgba(255,213,74,.10) 195deg, transparent 210deg)' }} />

          <div className="relative flex flex-wrap items-center justify-between gap-3 px-6 pt-5 max-md:px-4">
            <div>
              <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[.3em] text-[#FFD54A]"><Flame size={12} /> TEMPORADA</p>
              <p className="font-display text-2xl font-bold tracking-wide text-white max-md:text-lg">{temporada}</p>
            </div>
            <div className="flex rounded-full border border-white/15 bg-black/40 p-1">
              {CRITERIOS.map((x) => (
                <button
                  key={x.chave}
                  onClick={() => setCriterio(x.chave)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${criterio === x.chave ? 'text-black' : 'text-white/55 hover:text-white'}`}
                  style={criterio === x.chave ? { background: '#FFD54A', boxShadow: '0 0 18px rgba(255,213,74,.55)' } : undefined}
                >
                  {x.rotulo}
                </button>
              ))}
            </div>
          </div>

          <div key={`${mes}-${criterio}`} className="relative mx-auto mt-10 flex max-w-[760px] items-end justify-center gap-4 px-5 max-md:mt-8 max-md:gap-2 max-md:px-4">
            {ordemPodio.map((i) => {
              const { v, r } = podio[i];
              const estilo = PODIO[i];
              const pontuou = r[criterio] > 0;
              const cor = pontuou ? estilo.cor : '#4B4B57';
              const p = metaDe(v.id);
              return (
                <div key={v.id} className="rk-entra flex min-w-0 flex-1 flex-col items-center" style={{ animationDelay: `${i * 120}ms` }}>
                  {i === 0 && pontuou && <Crown size={34} className="rk-flutua -mb-1 text-[#FFD54A] drop-shadow-[0_0_12px_rgba(255,213,74,.85)] max-md:h-6 max-md:w-6" fill="#FFD54A" />}
                  <div
                    className={`flex items-center justify-center rounded-full bg-[#12121A] font-display font-bold text-white ${i === 0 ? 'h-28 w-28 text-4xl max-md:h-16 max-md:w-16 max-md:text-xl' : 'h-20 w-20 text-2xl max-md:h-12 max-md:w-12 max-md:text-base'} ${i === 0 && pontuou ? 'rk-pulsa' : ''}`}
                    style={i === 0 && pontuou ? undefined : { boxShadow: `0 0 0 3px ${cor}, 0 0 26px ${pontuou ? estilo.brilho : 'transparent'}` }}
                  >
                    {iniciais(v.nome)}
                  </div>
                  <p className="mt-3 w-full truncate text-center text-base font-bold text-white max-md:mt-2 max-md:text-xs" title={v.nome}>{v.nome}</p>
                  <p className={`font-display font-black tabular-nums ${i === 0 ? 'text-4xl max-md:text-lg' : 'text-2xl max-md:text-base'}`} style={{ color: cor, textShadow: pontuou ? `0 0 18px ${estilo.brilho}` : undefined }}>{c.fmt(r[criterio])}</p>
                  <p className="h-4 text-[10px] font-semibold text-white/50">{p !== null ? (p >= 100 ? <span className="text-emerald-400">META BATIDA · {p}%</span> : `${p}% da meta`) : ''}</p>
                  <div
                    className={`rk-sobe mt-3 flex w-full flex-col items-center justify-start rounded-t-2xl border border-b-0 pt-3 ${i === 0 ? 'h-44 max-md:h-24' : i === 1 ? 'h-32 max-md:h-16' : 'h-24 max-md:h-12'}`}
                    style={{ borderColor: `${cor}66`, background: `linear-gradient(180deg, ${cor}4D, ${cor}0A)`, boxShadow: `inset 0 1px 0 ${cor}80`, animationDelay: `${200 + i * 120}ms` }}
                  >
                    <span className="font-display text-5xl font-black leading-none max-md:text-2xl" style={{ color: cor }}>{i + 1}</span>
                    <span className="mt-1.5 text-[9px] font-bold tracking-[.25em] text-white/60 max-md:hidden">{estilo.titulo}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {ordenados.length < 3 && <p className="relative border-t border-white/10 px-5 py-3 text-center text-[11px] text-white/40">Cadastre mais vendedores para completar o pódio.</p>}
        </section>

        {/* Placar da temporada */}
        <aside className="grid grid-cols-2 gap-3 xl:grid-cols-1 xl:content-start">
          <CartaoPlacar rotulo={`${c.rotulo} do time`} cor="#FFD54A">
            <p className="font-display text-3xl font-black tabular-nums text-white max-md:text-xl">{c.fmt(totalTime)}</p>
            {pctTime !== null ? (
              <>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, pctTime)}%`, background: pctTime >= 100 ? '#34D399' : 'linear-gradient(90deg, #7A5AFF, #FFD54A)' }} /></div>
                <p className="mt-1.5 text-[11px] text-white/55"><b className={pctTime >= 100 ? 'text-emerald-400' : 'text-white'}>{pctTime}%</b> da meta de {c.fmt(metaTime)}</p>
              </>
            ) : <p className="mt-1 text-[11px] text-white/45">sem meta definida no mês</p>}
          </CartaoPlacar>
          <CartaoPlacar rotulo="Tempo de jogo" cor="#7A5AFF">
            <p className="font-display text-3xl font-black tabular-nums text-white max-md:text-xl">{diasRestantes === null ? 'Encerrada' : diasRestantes}</p>
            <p className="mt-1 text-[11px] text-white/55">{diasRestantes === null ? 'temporada finalizada' : diasRestantes === 1 ? 'dia para o fim da temporada' : 'dias para o fim da temporada'}</p>
          </CartaoPlacar>
          <div className="col-span-2 rounded-2xl border border-white/10 bg-[#0B0B12] p-4 xl:col-span-1">
            <p className="text-[10px] font-bold tracking-[.25em] text-white/50">DESTAQUES</p>
            {destaques.length === 0 ? <p className="mt-3 text-[11px] text-white/40">Ainda sem pontuação nesta temporada.</p> : (
              <div className="mt-3 space-y-2.5">
                {destaques.map((d) => (
                  <div key={d.chave} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#15151E] text-[11px] font-bold text-white ring-1 ring-[#FFD54A]/50">{iniciais(d.l.v.nome)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#FFD54A]">Líder em {d.rotulo.toLowerCase()}</p>
                      <p className="truncate text-sm font-semibold text-white">{d.l.v.nome}</p>
                    </div>
                    <p className="shrink-0 font-display text-sm font-bold tabular-nums text-white">{d.fmt(d.l.r[d.chave])}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Classificação completa */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B12]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3 max-md:px-4">
          <p className="text-[10px] font-bold tracking-[.25em] text-white/50">CLASSIFICAÇÃO</p>
          <p className="text-[11px] text-white/40">{ordenados.length} {ordenados.length === 1 ? 'vendedor' : 'vendedores'} · por {c.rotulo.toLowerCase()}</p>
        </div>
        {ordenados.map(({ v, r }, i) => {
          const acima = i > 0 ? ordenados[i - 1] : null;
          const falta = acima ? acima.r[criterio] - r[criterio] : 0;
          const p = metaDe(v.id);
          const cor = PODIO[i]?.cor;
          return (
            <div key={v.id} className="rk-entra flex items-center gap-4 border-b border-white/[0.06] px-5 py-3.5 last:border-0 max-md:gap-3 max-md:px-4" style={{ animationDelay: `${300 + i * 60}ms` }}>
              <span className="w-8 shrink-0 font-display text-base font-black tabular-nums" style={{ color: cor && r[criterio] > 0 ? cor : 'rgba(255,255,255,.4)' }}>#{i + 1}</span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#15151E] text-xs font-bold text-white/85" style={{ boxShadow: `0 0 0 1.5px ${cor && r[criterio] > 0 ? cor : 'rgba(255,255,255,.15)'}` }}>{iniciais(v.nome)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-white">{v.nome}</p>
                  <p className="shrink-0 font-display text-base font-bold tabular-nums text-[#FFD54A]">{c.fmt(r[criterio])}</p>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(r[criterio] / maior) * 100}%`, background: 'linear-gradient(90deg, #7A5AFF, #FFD54A)' }} />
                </div>
                <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-white/45">
                  <span>{!acima ? 'Na liderança' : falta > 0 ? `Faltam ${c.fmt(falta)} para passar ${acima.v.nome.split(' ')[0]}` : `Empatado com ${acima.v.nome.split(' ')[0]}`}</span>
                  {p !== null && <span className={`font-semibold ${p >= 100 ? 'text-emerald-400' : 'text-white/60'}`}>{p}% da meta</span>}
                  <span className="max-md:hidden">{fmtNum(r.ingressos)} ingressos · {fmtBRL(r.receita)} · {fmtNum(r.mensagens)} mensagens</span>
                </p>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function CartaoPlacar({ rotulo, cor, children }: { rotulo: string; cor: string; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B12] p-4">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: cor, boxShadow: `0 0 16px ${cor}` }} />
      <p className="text-[10px] font-bold uppercase tracking-[.25em] text-white/50">{rotulo}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// ── Panorama geral ─────────────────────────────────────────────────────────
function Panorama({ vendedores, mes, versao }: { vendedores: Vendedor[]; mes: string; versao: number }) {
  const { resumo, metas, carregando } = useResumoDoMes(mes, versao);
  const anterior = useResumoDoMes(somarMeses(mes, -1), versao);
  const soma = (m: Map<string, Resumo>) => vendedores.reduce((t, v) => {
    const r = m.get(v.id) ?? RESUMO_VAZIO;
    return { ingressos: t.ingressos + r.ingressos, receita: t.receita + r.receita, mensagens: t.mensagens + r.mensagens };
  }, { ...RESUMO_VAZIO });
  const total = soma(resumo);
  const antes = soma(anterior.resumo);
  const metaTotal = vendedores.reduce((t, v) => {
    const m = metas.get(v.id) ?? META_VAZIA;
    return { meta_ingressos: t.meta_ingressos + m.meta_ingressos, meta_receita: t.meta_receita + m.meta_receita, meta_mensagens: t.meta_mensagens + m.meta_mensagens };
  }, { ...META_VAZIA });
  const variacao = (agora: number, ant: number) => (ant > 0 ? `${agora >= ant ? '+' : ''}${Math.round(((agora - ant) / ant) * 100)}% vs. mês anterior` : 'sem base no mês anterior');
  const comWhats = vendedores.filter((v) => v.whatsapp_instancia).length;

  return (
    <div className="space-y-4">
      <BarraIndicadores
        titulo={nomeDoMes(mes)}
        subtitulo={`${vendedores.length} ${vendedores.length === 1 ? 'vendedor ativo' : 'vendedores ativos'}`}
        carregando={carregando}
        itens={[
          { label: 'Ingressos', valor: fmtNum(total.ingressos), sub: variacao(total.ingressos, antes.ingressos), cor: CORES.ouro, barra: pct(total.ingressos, metaTotal.meta_ingressos) ?? undefined },
          { label: 'Receita', valor: fmtBRL(total.receita), sub: variacao(total.receita, antes.receita), cor: CORES.verde, barra: pct(total.receita, metaTotal.meta_receita) ?? undefined },
          { label: 'Mensagens', valor: fmtNum(total.mensagens), sub: variacao(total.mensagens, antes.mensagens), cor: CORES.azul, barra: pct(total.mensagens, metaTotal.meta_mensagens) ?? undefined },
          { label: 'WhatsApp conectado', valor: `${comWhats}/${vendedores.length}`, sub: 'vendedores com o número ligado', cor: CORES.branco, soWeb: true },
        ]}
      />
      <Quadro titulo="Vendedores">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Vendedor</th>
                <th className="px-3 py-2 font-medium">Ingressos</th>
                <th className="px-3 py-2 font-medium">Receita</th>
                <th className="px-3 py-2 font-medium">Mensagens</th>
                <th className="px-4 py-2 font-medium">Cupons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vendedores.map((v) => {
                const r = resumo.get(v.id) ?? RESUMO_VAZIO;
                const m = metas.get(v.id) ?? META_VAZIA;
                return (
                  <tr key={v.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{v.nome}</p>
                      <p className="text-[11px] text-muted-foreground">{v.telefone ? formatPhone(v.telefone) : 'sem telefone'}</p>
                    </td>
                    <CelulaMeta feito={r.ingressos} meta={m.meta_ingressos} fmt={fmtNum} />
                    <CelulaMeta feito={r.receita} meta={m.meta_receita} fmt={fmtBRL} />
                    <CelulaMeta feito={r.mensagens} meta={m.meta_mensagens} fmt={fmtNum} />
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {v.cupons.length ? v.cupons.map((c) => <span key={c} className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground/80">{c}</span>) : <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Quadro>
    </div>
  );
}

function CelulaMeta({ feito, meta, fmt }: { feito: number; meta: number; fmt: (v: number) => string }) {
  const p = pct(feito, meta);
  return (
    <td className="px-3 py-3 align-top">
      <p className="font-semibold tabular-nums text-foreground">{fmt(feito)}</p>
      {p === null ? <p className="text-[10px] text-muted-foreground">sem meta</p> : (
        <div className="mt-1 w-24">
          <Barra valor={p} cor={p >= 100 ? '#34D399' : OURO} />
          <p className={`mt-0.5 text-[10px] ${p >= 100 ? 'font-semibold text-emerald-400' : 'text-muted-foreground'}`}>{p}% de {fmt(meta)}</p>
        </div>
      )}
    </td>
  );
}

// ── Performance ────────────────────────────────────────────────────────────
const PERIODOS = [
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: '3m', rotulo: 'Últimos 3 meses' },
  { chave: 'tudo', rotulo: 'Todo o período' },
] as const;
type Periodo = typeof PERIODOS[number]['chave'];

function Performance({ vendedores, versao, onMudou }: { vendedores: Vendedor[]; versao: number; onMudou: () => void }) {
  const [quem, setQuem] = useState('todos');
  const [periodo, setPeriodo] = useState<Periodo>('3m');
  const [mensagens, setMensagens] = useState<MensagensDia[]>([]);
  const [vendas, setVendas] = useState<VendaEvento[]>([]);
  const [manuais, setManuais] = useState<VendaManual[]>([]);
  const [carregando, setCarregando] = useState(true);
  const semanas = useMemo(() => ultimasSemanas(8), []);
  const nome = (id: string) => vendedores.find((v) => v.id === id)?.nome || 'Vendedor';

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    (async () => {
      const hoje = limitesDoMes(mesAtual());
      const de = periodo === 'mes' ? hoje.de : periodo === '3m' ? limitesDoMes(somarMeses(mesAtual(), -2)).de : '2000-01-01';
      const [m, v, l] = await Promise.all([
        (supabase as any).from('lagun_vendedor_mensagens').select('vendedor_id, dia, enviadas').gte('dia', semanas[0].inicio).order('dia'),
        (supabase.rpc as any)('lagun_vendedores_vendas_evento', { p_de: de, p_ate: hoje.ate }),
        (supabase as any).from('lagun_vendedor_vendas').select('id, vendedor_id, evento, dia, ingressos, receita, observacao').gte('dia', de).order('dia', { ascending: false }).limit(200),
      ]);
      if (cancelado) return;
      setMensagens((m.data || []) as MensagensDia[]);
      setVendas(((v.data || []) as any[]).map((x) => ({ ...x, ingressos: Number(x.ingressos) || 0, receita: Number(x.receita) || 0, por_cupom: Number(x.por_cupom) || 0, manuais: Number(x.manuais) || 0 })));
      setManuais((l.data || []) as VendaManual[]);
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [periodo, semanas, versao]);

  const filtra = <T extends { vendedor_id: string }>(l: T[]) => (quem === 'todos' ? l.filter((x) => vendedores.some((v) => v.id === x.vendedor_id)) : l.filter((x) => x.vendedor_id === quem));

  // Mensagens por semana (gráfico) e por vendedor (tabela).
  const porSemana = useMemo(() => semanas.map((s) => ({
    semana: s.rotulo,
    mensagens: filtra(mensagens).filter((m) => inicioDaSemana(m.dia) === s.inicio).reduce((t, m) => t + m.enviadas, 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [mensagens, semanas, quem, vendedores]);
  const totalMensagens = porSemana.reduce((t, s) => t + s.mensagens, 0);

  // Vendas por evento, com o detalhe de cada vendedor.
  const porEvento = useMemo(() => {
    const mapa = new Map<string, { evento: string; ingressos: number; receita: number; por_cupom: number; manuais: number; vendedores: { id: string; ingressos: number }[] }>();
    for (const v of filtra(vendas)) {
      const e = mapa.get(v.evento) ?? { evento: v.evento, ingressos: 0, receita: 0, por_cupom: 0, manuais: 0, vendedores: [] };
      e.ingressos += v.ingressos; e.receita += v.receita; e.por_cupom += v.por_cupom; e.manuais += v.manuais;
      e.vendedores.push({ id: v.vendedor_id, ingressos: v.ingressos });
      mapa.set(v.evento, e);
    }
    return [...mapa.values()].map((e) => ({ ...e, vendedores: e.vendedores.sort((a, b) => b.ingressos - a.ingressos) })).sort((a, b) => b.ingressos - a.ingressos);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendas, quem, vendedores]);
  const maiorEvento = Math.max(1, ...porEvento.map((e) => e.ingressos));

  async function apagarLancamento(l: VendaManual) {
    const ok = await confirmDialog({ title: 'Excluir lançamento', description: `${fmtNum(l.ingressos)} ingressos de ${nome(l.vendedor_id)} em ${l.evento}.`, confirmText: 'Excluir', destructive: true });
    if (!ok) return;
    const { error } = await (supabase as any).from('lagun_vendedor_vendas').delete().eq('id', l.id);
    if (error) { toast.error('Não foi possível excluir.'); return; }
    toast.success('Lançamento excluído');
    onMudou();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={quem} onChange={(e) => setQuem(e.target.value)} className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground">
          <option value="todos">Todos os vendedores</option>
          {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
        </select>
      </div>

      <Quadro
        titulo={<span className="flex items-center gap-2"><MessageCircle size={15} style={{ color: OURO }} /> Mensagens por semana</span>}
        extra={<span className="text-[11px] text-muted-foreground">últimas 8 semanas · {fmtNum(totalMensagens)} mensagens</span>}
      >
        {carregando ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>
          : totalMensagens === 0 ? <Vazio>Nenhuma mensagem registrada nas últimas 8 semanas. A contagem começa quando o WhatsApp do vendedor é conectado.</Vazio> : (
            <>
              <div className="h-56 px-2 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porSemana} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="semana" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelFormatter={(l) => `Semana de ${l}`} formatter={(v: number) => [fmtNum(v), 'Mensagens']} />
                    <Bar dataKey="mensagens" fill={OURO} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {quem === 'todos' && (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2 text-left font-medium">Vendedor</th>
                        {semanas.map((s) => <th key={s.inicio} className="px-2 py-2 text-right font-medium">{s.rotulo}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {vendedores.map((v) => (
                        <tr key={v.id}>
                          <td className="px-4 py-2 font-medium text-foreground">{v.nome}</td>
                          {semanas.map((s) => {
                            const n = mensagens.filter((m) => m.vendedor_id === v.id && inicioDaSemana(m.dia) === s.inicio).reduce((t, m) => t + m.enviadas, 0);
                            return <td key={s.inicio} className={`px-2 py-2 text-right tabular-nums ${n ? 'text-foreground' : 'text-muted-foreground/50'}`}>{n ? fmtNum(n) : '—'}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
      </Quadro>

      <Quadro
        titulo={<span className="flex items-center gap-2"><Ticket size={15} style={{ color: OURO }} /> Vendas por evento</span>}
        extra={(
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] font-medium text-foreground">
            {PERIODOS.map((p) => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}
          </select>
        )}
      >
        {carregando ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>
          : porEvento.length === 0 ? <Vazio>Nenhuma venda no período. As vendas entram pelo cupom do vendedor ou por lançamento manual.</Vazio> : (
            <div className="divide-y divide-border">
              {porEvento.map((e) => (
                <div key={e.evento} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-foreground" title={e.evento}>{e.evento}</p>
                    <p className="shrink-0 text-sm tabular-nums"><b className="font-bold" style={{ color: OURO }}>{fmtNum(e.ingressos)}</b> <span className="text-xs text-muted-foreground">ingressos · {fmtBRL(e.receita)}</span></p>
                  </div>
                  <div className="mt-1.5"><Barra valor={(e.ingressos / maiorEvento) * 100} /></div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{fmtNum(e.por_cupom)} por cupom · {fmtNum(e.manuais)} lançados</span>
                    {quem === 'todos' && e.vendedores.map((x) => (
                      <span key={x.id} className="rounded-full border border-border px-2 py-0.5 text-foreground/80">{nome(x.id)} · {fmtNum(x.ingressos)}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
      </Quadro>

      {filtra(manuais).length > 0 && (
        <Quadro titulo="Vendas lançadas à mão" extra={<span className="text-[11px] text-muted-foreground">{filtra(manuais).length} no período</span>}>
          <div className="divide-y divide-border">
            {filtra(manuais).map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{nome(l.vendedor_id)} · {l.evento}</p>
                  <p className="text-[11px] text-muted-foreground">{l.dia.split('-').reverse().join('/')}{l.observacao ? ` · ${l.observacao}` : ''}</p>
                </div>
                <p className="shrink-0 tabular-nums text-foreground">{fmtNum(l.ingressos)} ingressos · {fmtBRL(Number(l.receita))}</p>
                <button onClick={() => void apagarLancamento(l)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500" aria-label="Excluir lançamento"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </Quadro>
      )}
    </div>
  );
}

// ── Metas pessoais ─────────────────────────────────────────────────────────
function Metas({ vendedores, mes, versao }: { vendedores: Vendedor[]; mes: string; versao: number }) {
  const { resumo, metas, setMetas, carregando } = useResumoDoMes(mes, versao);
  const [copiando, setCopiando] = useState(false);
  const { de } = limitesDoMes(mes);

  async function salvar(vendedorId: string, campo: keyof Meta, valor: number) {
    const atual = metas.get(vendedorId) ?? META_VAZIA;
    if (atual[campo] === valor) return;
    const nova = { ...atual, [campo]: valor };
    setMetas((m) => new Map(m).set(vendedorId, nova));
    const { error } = await (supabase as any).from('lagun_vendedor_metas')
      .upsert({ vendedor_id: vendedorId, mes: de, ...nova, updated_at: new Date().toISOString() }, { onConflict: 'vendedor_id,mes' });
    if (error) {
      setMetas((m) => new Map(m).set(vendedorId, atual));
      toast.error('Não foi possível salvar a meta.');
      return;
    }
    toast.success('Meta salva');
  }

  async function copiarDoMesAnterior() {
    setCopiando(true);
    const anterior = limitesDoMes(somarMeses(mes, -1)).de;
    const { data } = await (supabase as any).from('lagun_vendedor_metas').select('vendedor_id, meta_ingressos, meta_receita, meta_mensagens').eq('mes', anterior);
    const linhas = ((data || []) as any[]).filter((x) => vendedores.some((v) => v.id === x.vendedor_id));
    if (!linhas.length) { setCopiando(false); toast.error(`Não há metas em ${nomeDoMes(somarMeses(mes, -1)).toLowerCase()}.`); return; }
    const { error } = await (supabase as any).from('lagun_vendedor_metas')
      .upsert(linhas.map((x) => ({ ...x, mes: de, updated_at: new Date().toISOString() })), { onConflict: 'vendedor_id,mes' });
    setCopiando(false);
    if (error) { toast.error('Não foi possível copiar as metas.'); return; }
    setMetas(new Map(linhas.map((x) => [x.vendedor_id, { meta_ingressos: Number(x.meta_ingressos), meta_receita: Number(x.meta_receita), meta_mensagens: Number(x.meta_mensagens) }])));
    toast.success('Metas copiadas do mês anterior');
  }

  const semMetas = !carregando && vendedores.every((v) => !metas.has(v.id));

  return (
    <div className="space-y-3">
      {semMetas && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">Nenhuma meta definida para {nomeDoMes(mes).toLowerCase()}. Preencha abaixo ou copie as do mês anterior.</p>
          <button onClick={() => void copiarDoMesAnterior()} disabled={copiando} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60">
            <Copy size={13} /> {copiando ? 'Copiando…' : 'Copiar do mês anterior'}
          </button>
        </div>
      )}
      {carregando ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" size={22} /></div> : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {vendedores.map((v) => {
            const r = resumo.get(v.id) ?? RESUMO_VAZIO;
            const m = metas.get(v.id) ?? META_VAZIA;
            return (
              <section key={`${v.id}-${mes}`} className="rounded-xl border border-border bg-card p-4">
                <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-foreground"><Target size={15} style={{ color: OURO }} /> {v.nome}</h2>
                <div className="mt-3 space-y-3">
                  <LinhaMeta icone={<Ticket size={13} />} rotulo="Ingressos" feito={r.ingressos} meta={m.meta_ingressos} fmt={fmtNum} onSalvar={(n) => void salvar(v.id, 'meta_ingressos', n)} />
                  <LinhaMeta icone={<Wallet size={13} />} rotulo="Receita" feito={r.receita} meta={m.meta_receita} fmt={fmtBRL} prefixo="R$" onSalvar={(n) => void salvar(v.id, 'meta_receita', n)} />
                  <LinhaMeta icone={<MessageCircle size={13} />} rotulo="Mensagens" feito={r.mensagens} meta={m.meta_mensagens} fmt={fmtNum} onSalvar={(n) => void salvar(v.id, 'meta_mensagens', n)} />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LinhaMeta({ icone, rotulo, feito, meta, fmt, prefixo, onSalvar }: {
  icone: ReactNode; rotulo: string; feito: number; meta: number; fmt: (v: number) => string; prefixo?: string; onSalvar: (n: number) => void;
}) {
  const [texto, setTexto] = useState(meta ? String(meta) : '');
  useEffect(() => { setTexto(meta ? String(meta) : ''); }, [meta]);
  const p = pct(feito, meta);
  const confirmar = () => onSalvar(Math.max(0, Math.round(Number(texto.replace(/\./g, '').replace(',', '.')) || 0)));
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icone} {rotulo}</p>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Meta {prefixo}
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value.replace(/[^\d.,]/g, ''))}
            onBlur={confirmar}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            inputMode="numeric"
            placeholder="0"
            aria-label={`Meta de ${rotulo.toLowerCase()}`}
            className="h-7 w-24 rounded-md border border-border bg-background px-2 text-right text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-[#D9B14E]"
          />
        </label>
      </div>
      <div className="mt-1.5"><Barra valor={p ?? 0} cor={p !== null && p >= 100 ? '#34D399' : OURO} /></div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        <b className="font-semibold text-foreground">{fmt(feito)}</b> {meta > 0 ? <>de {fmt(meta)} · <span className={p! >= 100 ? 'font-semibold text-emerald-400' : ''}>{p}%</span></> : '· sem meta'}
      </p>
    </div>
  );
}

// ── Cadastro ───────────────────────────────────────────────────────────────
const formVazio = { nome: '', telefone: '', cupons: '', ativo: true };

function Cadastro({ vendedores, onMudou }: { vendedores: Vendedor[]; onMudou: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Vendedor | null>(null);
  const [form, setForm] = useState(formVazio);
  const [salvando, setSalvando] = useState(false);

  function abrir(v: Vendedor | null) {
    setEditando(v);
    setForm(v ? { nome: v.nome, telefone: v.telefone ?? '', cupons: v.cupons.join(', '), ativo: v.ativo } : formVazio);
    setAberto(true);
  }

  async function salvar() {
    const nome = form.nome.trim();
    const telefone = form.telefone.replace(/\D/g, '');
    const cupons = [...new Set(form.cupons.split(/[,;\n]/).map((c) => c.trim().toUpperCase()).filter(Boolean))];
    if (nome.length < 2) { toast.error('Informe o nome do vendedor'); return; }
    if (telefone && (telefone.length < 10 || telefone.length > 13)) { toast.error('Telefone inválido: use DDD + número'); return; }
    const repetido = vendedores.find((v) => v.id !== editando?.id && v.cupons.some((c) => cupons.includes(c.toUpperCase())));
    if (repetido) { toast.error(`O cupom já está com ${repetido.nome}. Cada cupom conta para um vendedor só.`); return; }
    setSalvando(true);
    const payload = { nome, telefone: telefone || null, cupons, ativo: form.ativo, updated_at: new Date().toISOString() };
    const { error } = editando
      ? await (supabase as any).from('lagun_vendedores').update(payload).eq('id', editando.id)
      : await (supabase as any).from('lagun_vendedores').insert(payload);
    setSalvando(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success(editando ? 'Vendedor atualizado' : 'Vendedor cadastrado');
    setAberto(false);
    onMudou();
  }

  async function excluir(v: Vendedor) {
    const ok = await confirmDialog({ title: 'Excluir vendedor', description: `${v.nome} sai do ranking e perde as metas, as vendas lançadas e a contagem de mensagens. Para só tirar do ranking, desative em vez de excluir.`, confirmText: 'Excluir', destructive: true });
    if (!ok) return;
    const { error } = await (supabase as any).from('lagun_vendedores').delete().eq('id', v.id);
    if (error) { toast.error('Erro ao excluir: ' + error.message); return; }
    toast.success('Vendedor excluído');
    onMudou();
  }

  return (
    <>
      <Quadro
        titulo={`Vendedores (${vendedores.length})`}
        extra={<button onClick={() => abrir(null)} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white hover:brightness-110" style={{ background: OURO }}><Plus size={15} /> Novo vendedor</button>}
      >
        {vendedores.length === 0 ? <Vazio>Nenhum vendedor cadastrado ainda.</Vazio> : (
          <div className="divide-y divide-border">
            {vendedores.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {v.nome}
                    {!v.ativo && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-normal text-muted-foreground">Inativo</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {v.telefone ? formatPhone(v.telefone) : 'sem telefone'} · WhatsApp {v.whatsapp_instancia ? <span className="text-emerald-400">conectado</span> : 'não conectado'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {v.cupons.length ? v.cupons.map((c) => <span key={c} className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground/80">{c}</span>) : <span className="text-[11px] text-amber-400">sem cupom: só entram vendas lançadas à mão</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => abrir(v)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Editar ${v.nome}`}><Pencil size={14} /></button>
                  <button onClick={() => void excluir(v)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500" aria-label={`Excluir ${v.nome}`}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Quadro>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editando ? 'Editar vendedor' : 'Novo vendedor'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Campo rotulo="Nome *"><input autoFocus value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome do vendedor" className={ENTRADA} /></Campo>
            <Campo rotulo="Telefone (WhatsApp)"><input value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} placeholder="(27) 99999-9999" inputMode="tel" className={ENTRADA} /></Campo>
            <Campo rotulo="Cupons" ajuda="Separe por vírgula. Toda compra feita com um desses cupons conta como venda dele.">
              <input value={form.cupons} onChange={(e) => setForm((f) => ({ ...f, cupons: e.target.value }))} placeholder="ex: CLAUBIN, CLAUBIN10" className={`${ENTRADA} uppercase`} />
            </Campo>
            <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm text-foreground">
              Ativo no ranking
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} className="h-4 w-4 accent-[#D9B14E]" />
            </label>
            <BotoesDialogo onCancelar={() => setAberto(false)} onSalvar={() => void salvar()} salvando={salvando} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Lançar venda à mão ─────────────────────────────────────────────────────
const OUTRO_EVENTO = '__outro__';

function DialogoVenda({ aberto, onFechar, vendedores, onSalvou }: { aberto: boolean; onFechar: () => void; vendedores: Vendedor[]; onSalvou: () => void }) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const [eventos, setEventos] = useState<string[]>([]);
  const [form, setForm] = useState({ vendedor: '', evento: '', outro: '', dia: hoje, ingressos: '', receita: '', observacao: '' });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setForm((f) => ({ ...f, vendedor: f.vendedor || vendedores[0]?.id || '', dia: hoje, ingressos: '', receita: '', observacao: '' }));
    (supabase as any).from('lagun_events').select('nome, data').order('data', { ascending: false, nullsFirst: false }).limit(40)
      .then(({ data }: { data: { nome: string | null }[] | null }) => {
        const nomes = [...new Set((data || []).map((e) => String(e.nome || '').trim()).filter(Boolean))];
        setEventos(nomes);
        setForm((f) => ({ ...f, evento: f.evento || nomes[0] || OUTRO_EVENTO }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  async function salvar() {
    const evento = (form.evento === OUTRO_EVENTO ? form.outro : form.evento).trim();
    const ingressos = Math.round(Number(form.ingressos) || 0);
    const receita = Number(form.receita.replace(/\./g, '').replace(',', '.')) || 0;
    if (!form.vendedor) { toast.error('Escolha o vendedor'); return; }
    if (!evento) { toast.error('Informe o evento'); return; }
    if (ingressos <= 0 && receita <= 0) { toast.error('Informe a quantidade de ingressos ou a receita'); return; }
    setSalvando(true);
    const { error } = await (supabase as any).from('lagun_vendedor_vendas')
      .insert({ vendedor_id: form.vendedor, evento, dia: form.dia, ingressos, receita, observacao: form.observacao.trim() || null });
    setSalvando(false);
    if (error) { toast.error('Erro ao lançar: ' + error.message); return; }
    toast.success('Venda lançada');
    onFechar();
    onSalvou();
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Lançar venda</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Campo rotulo="Vendedor *">
            <select value={form.vendedor} onChange={(e) => setForm((f) => ({ ...f, vendedor: e.target.value }))} className={ENTRADA}>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Evento *">
            <select value={form.evento} onChange={(e) => setForm((f) => ({ ...f, evento: e.target.value }))} className={ENTRADA}>
              {eventos.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={OUTRO_EVENTO}>Outro evento…</option>
            </select>
          </Campo>
          {form.evento === OUTRO_EVENTO && <Campo rotulo="Nome do evento *"><input value={form.outro} onChange={(e) => setForm((f) => ({ ...f, outro: e.target.value }))} className={ENTRADA} /></Campo>}
          <div className="grid grid-cols-3 gap-2">
            <Campo rotulo="Data"><input type="date" value={form.dia} max={hoje} onChange={(e) => setForm((f) => ({ ...f, dia: e.target.value }))} className={ENTRADA} /></Campo>
            <Campo rotulo="Ingressos"><input value={form.ingressos} onChange={(e) => setForm((f) => ({ ...f, ingressos: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder="0" className={ENTRADA} /></Campo>
            <Campo rotulo="Receita (R$)"><input value={form.receita} onChange={(e) => setForm((f) => ({ ...f, receita: e.target.value.replace(/[^\d.,]/g, '') }))} inputMode="decimal" placeholder="0,00" className={ENTRADA} /></Campo>
          </div>
          <Campo rotulo="Observação"><input value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} placeholder="ex: camarote, venda em dinheiro" className={ENTRADA} /></Campo>
          <p className="text-[11px] text-muted-foreground">As vendas feitas com o cupom do vendedor já entram sozinhas. Lance aqui só o que foi vendido por fora.</p>
          <BotoesDialogo onCancelar={onFechar} onSalvar={() => void salvar()} salvando={salvando} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ENTRADA = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#D9B14E]';

function Campo({ rotulo, ajuda, children }: { rotulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{rotulo}</label>
      {children}
      {ajuda && <p className="mt-1 text-[11px] text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

function BotoesDialogo({ onCancelar, onSalvar, salvando }: { onCancelar: () => void; onSalvar: () => void; salvando: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <button onClick={onCancelar} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancelar</button>
      <button onClick={onSalvar} disabled={salvando} className="flex-1 rounded-lg py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60" style={{ background: OURO }}>
        {salvando ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  );
}
