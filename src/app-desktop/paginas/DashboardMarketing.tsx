import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Heart, Instagram, MessageCircle, Zap } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDashboardSocial, nf, pct, haQuanto, type Interacao, type Dias } from '@/components/interno/useDashboardSocial';

/**
 * Dashboard da sessão Marketing, versão do APP de computador.
 *
 * Mesmos dados da tela do site (useDashboardSocial), outro desenho: letreiro
 * de números no alto, gráficos em superfícies separadas por luz, publicações
 * com foto, listas de comentários e directs como feed. Nada de ícone em
 * quadradinho: a hierarquia é tipográfica.
 */
const NEON = '#FFE14D';
const ROSA = '#F9A8D4';
const AZUL = '#8FB4FF';
const VERDE = '#34D399';

const tooltipStyle = {
  contentStyle: { background: '#111111', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, fontSize: 12, boxShadow: '0 18px 40px -20px rgba(0,0,0,.9)' },
  labelStyle: { color: '#9A978C', marginBottom: 4 },
  itemStyle: { color: '#F4F2EA' },
  cursor: { fill: 'rgba(255,255,255,.05)', stroke: 'rgba(255,255,255,.12)' },
} as const;

function Superficie({ titulo, sub, acao, className = '', children }: { titulo: string; sub?: string; acao?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`app-superficie flex flex-col p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] tracking-[0.12em] text-white">{titulo}</h2>
          {sub && <p className="mt-1 text-[11.5px] leading-snug text-white/45">{sub}</p>}
        </div>
        {acao}
      </header>
      <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
    </section>
  );
}

function Abrir({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="app-aba h-8 shrink-0 gap-1 px-3 text-[11px] text-white/60 hover:text-[#FFEC8A]">
      {children} <ArrowUpRight size={13} />
    </Link>
  );
}

function Esqueleto({ linhas, altura }: { linhas: number; altura: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-[12px] bg-white/[0.05]" style={{ height: altura }} />
      ))}
    </div>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-white/40">{children}</p>;
}

/** Comentários e directs como um feed: foto, @, texto e há quanto tempo. */
function Feed({ itens, vazio, carregando }: { itens: Interacao[]; vazio: string; carregando: boolean }) {
  if (carregando) return <Esqueleto linhas={4} altura={52} />;
  if (!itens.length) return <Vazio>{vazio}</Vazio>;
  return (
    <ul className="-mx-2 flex flex-col">
      {itens.map((it, i) => {
        const nome = it.arroba || it.autor;
        const hue = [...(nome || String(i))].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
        return (
          <li key={`${it.quando}-${i}`} className="flex items-start gap-3 rounded-[14px] px-2 py-2.5 transition-colors hover:bg-white/[0.035]">
            <span className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-[11px] font-bold text-white ring-1 ring-white/10"
              style={{ background: `radial-gradient(circle at 30% 30%, oklch(.70 .15 ${hue}), oklch(.42 .17 ${hue}) 70%)` }}>
              {(nome || '?').replace(/^@/, '').slice(0, 2).toUpperCase()}
              {it.avatar && (
                <img src={it.avatar} alt="" referrerPolicy="no-referrer" loading="lazy" className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-semibold text-white">
                  {it.arroba ? `@${String(it.arroba).replace(/^@/, '')}` : it.autor || 'Perfil do Instagram'}
                  {it.arroba && it.autor && it.autor !== it.arroba && <span className="ml-1.5 font-normal text-white/40">{it.autor}</span>}
                </span>
                <span className="shrink-0 text-[10.5px] tabular-nums text-white/35">{haQuanto(it.quando)}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-white/60">{it.texto}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardMarketing() {
  const d = useDashboardSocial();
  const { dias, setDias, carregando, erroIg, perfil, engajamento, totais, serie, topPosts, serieEngajamento, porEvento, automacoes } = d;
  const maxCliques = Math.max(1, ...porEvento.map((e) => e.cliques));

  const numeros: { label: string; valor: string; sub?: string; neon?: boolean }[] = [
    { label: 'Seguidores', valor: perfil ? nf.format(perfil.followers_count) : '—', sub: 'conta profissional', neon: true },
    { label: 'Engajamento', valor: engajamento.taxa ? pct(engajamento.taxa) : '—', sub: engajamento.posts ? `média de ${engajamento.posts} ${engajamento.posts === 1 ? 'post' : 'posts'}` : 'por post' },
    { label: 'DMs recebidas', valor: nf.format(totais.dms), sub: `últimos ${dias} dias` },
    { label: 'Curtidas', valor: nf.format(engajamento.curtidas), sub: engajamento.posts ? `em ${engajamento.posts} ${engajamento.posts === 1 ? 'publicação' : 'publicações'}` : 'nas publicações' },
    { label: 'Cliques no link', valor: nf.format(totais.cliques), sub: `${nf.format(Math.round(totais.cliques / Math.max(dias, 1)))} por dia` },
  ];

  return (
    <div className="space-y-4">
      {/* ── Letreiro: perfil, período e os números ─────────────────────── */}
      <section className="app-superficie app-superficie--alta overflow-hidden">
        <div className="flex items-center justify-between gap-6 border-b border-white/[0.07] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {perfil?.profile_picture_url
              ? <img src={perfil.profile_picture_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-[#FFE14D]/40" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/60 ring-1 ring-white/10"><Instagram size={18} /></span>}
            <div className="min-w-0">
              <p className="app-eyebrow">Instagram conectado</p>
              <p className="mt-0.5 truncate text-[15px] font-semibold text-white">
                {perfil ? <>@{perfil.username} <span className="font-normal text-white/40">· {nf.format(perfil.media_count)} publicações</span></> : (carregando ? 'carregando…' : 'sem conta vinculada')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/[0.08] bg-black/40 p-1">
            {([7, 30, 90] as Dias[]).map((v) => (
              <button key={v} type="button" onClick={() => setDias(v)} className={`app-aba h-8 px-4 text-[12px] ${dias === v ? 'ativo' : ''}`}>{v} dias</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-5 divide-x divide-white/[0.07]">
          {numeros.map((n) => (
            <div key={n.label} className="px-6 py-5">
              <p className="app-eyebrow">{n.label}</p>
              <p className={`app-letreiro mt-2 ${n.neon ? 'app-letreiro--neon' : ''}`}>{carregando && n.valor === '—' ? <span className="inline-block h-9 w-24 animate-pulse rounded-md bg-white/[0.06] align-middle" /> : n.valor}</p>
              {n.sub && <p className="mt-1.5 text-[11.5px] text-white/40">{n.sub}</p>}
            </div>
          ))}
        </div>
      </section>

      {erroIg && (
        <div className="app-superficie flex items-center gap-3 border-amber-400/30 px-5 py-3 text-[13px]">
          <span className="font-semibold text-amber-300">Instagram indisponível.</span>
          <span className="text-white/55">{erroIg}</span>
        </div>
      )}

      {/* ── Movimento + publicações ─────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">
        <Superficie className="col-span-8" titulo="Movimento diário" sub="Cliques no link da landing (à esquerda) e DMs recebidas no Instagram (à direita)">
          {carregando ? <Esqueleto linhas={1} altura={260} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={serie} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="appCliques" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON} stopOpacity={0.4} /><stop offset="100%" stopColor={NEON} stopOpacity={0} /></linearGradient>
                  <linearGradient id="appDms" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ROSA} stopOpacity={0.35} /><stop offset="100%" stopColor={ROSA} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,.07)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10.5, fill: '#9A978C' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                <YAxis yAxisId="cliques" tick={{ fontSize: 10.5, fill: '#9A978C' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="dms" orientation="right" tick={{ fontSize: 10.5, fill: ROSA }} axisLine={false} tickLine={false} width={34} />
                <Tooltip {...tooltipStyle} />
                <Area yAxisId="cliques" type="monotone" dataKey="cliques" name="Cliques no link" stroke={NEON} strokeWidth={2.2} fill="url(#appCliques)" />
                <Area yAxisId="dms" type="monotone" dataKey="dms" name="DMs" stroke={ROSA} strokeWidth={2} fill="url(#appDms)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Superficie>

        <Superficie className="col-span-4" titulo="Mais engajaram" sub="Curtidas + comentários, entre as últimas 50">
          {topPosts.length === 0 ? (carregando ? <Esqueleto linhas={5} altura={50} /> : <Vazio>Nenhuma publicação encontrada.</Vazio>) : (
            <ol className="-mx-2 flex flex-col">
              {topPosts.map((p, i) => (
                <li key={p.id}>
                  <a href={p.permalink} target="_blank" rel="noreferrer" className="group flex items-center gap-3 rounded-[14px] px-2 py-2 transition-colors hover:bg-white/[0.035]">
                    <span className="app-titulo w-6 shrink-0 text-[22px] leading-none text-white/25 transition-colors group-hover:text-[#FFE14D]">{i + 1}</span>
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[12px] bg-white/[0.06] ring-1 ring-white/10">
                      {(p.thumbnail_url || p.media_url) && (
                        <img src={p.thumbnail_url || p.media_url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-white/70">{p.caption?.split('\n')[0] || (p.media_type === 'VIDEO' ? 'Reels' : 'Publicação')}</span>
                      <span className="mt-1 flex items-center gap-3 text-[11.5px] text-white/50">
                        <span className="flex items-center gap-1"><Heart size={11} className="fill-[#F9A8D4] text-[#F9A8D4]" /> {nf.format(p.like_count ?? 0)}</span>
                        <span className="flex items-center gap-1"><MessageCircle size={11} className="text-[#8FB4FF]" /> {nf.format(p.comments_count ?? 0)}</span>
                      </span>
                    </span>
                    <span className="app-titulo shrink-0 text-[20px] text-[#FFE14D]">{nf.format((p.like_count ?? 0) + (p.comments_count ?? 0))}</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </Superficie>
      </div>

      {/* ── Engajamento por post + para onde clicam ─────────────────────── */}
      <div className="grid grid-cols-12 gap-4">
        <Superficie className="col-span-7" titulo="Engajamento por publicação" sub="Últimas 12 publicações, em ordem de postagem">
          {serieEngajamento.length === 0 ? (carregando ? <Esqueleto linhas={1} altura={220} /> : <Vazio>Sem dados de engajamento.</Vazio>) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={serieEngajamento} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,.07)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 10.5, fill: '#9A978C' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10.5, fill: '#9A978C' }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="engajamento" name="Curtidas + comentários" radius={[6, 6, 2, 2]} barSize={22}>
                    {serieEngajamento.map((x, i) => <Cell key={i} fill={x.tipo === 'VIDEO' || x.tipo === 'REELS' ? AZUL : NEON} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-3 flex items-center gap-4 text-[11px] text-white/45">
                <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: AZUL }} /> Reels</span>
                <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: NEON }} /> Feed</span>
              </p>
            </>
          )}
        </Superficie>

        <Superficie className="col-span-5" titulo="Para onde o público clica" sub={`Cliques no link por evento · últimos ${dias} dias`}>
          {porEvento.length === 0 ? (carregando ? <Esqueleto linhas={6} altura={28} /> : <Vazio>Nenhum clique no período.</Vazio>) : (
            <ul className="flex flex-col gap-3">
              {porEvento.slice(0, 8).map((e, i) => (
                <li key={e.nome}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-white/80">{e.nome}</span>
                    <span className="app-titulo shrink-0 text-[18px] text-white">{nf.format(e.cliques)}</span>
                  </div>
                  <div className="h-[6px] overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{
                      width: `${Math.max(3, (e.cliques / maxCliques) * 100)}%`,
                      background: i === 0 ? 'linear-gradient(90deg,#E8B923,#FFE14D,#FFEC8A)' : 'rgba(255,225,77,.45)',
                      boxShadow: i === 0 ? '0 0 14px rgba(255,214,80,.6)' : undefined,
                    }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Superficie>
      </div>

      {/* ── Comentários, directs, automações ────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">
        <Superficie className="col-span-4" titulo="Últimos comentários" sub="Só os que dizem algo. Emoji solto fica de fora" acao={<Abrir to="/interno/comentarios">Ver todos</Abrir>}>
          <Feed itens={d.ultimosComentarios} vazio="Nenhum comentário captado ainda." carregando={carregando} />
        </Superficie>
        <Superficie className="col-span-4" titulo="Últimos directs" sub="Mensagens recebidas no Instagram" acao={<Abrir to="/interno/whatsapp/chat">Abrir chat</Abrir>}>
          <Feed itens={d.ultimosDirects} vazio="Nenhum direct recebido ainda." carregando={carregando} />
        </Superficie>
        <Superficie className="col-span-4" titulo="Automações" sub="Respostas automáticas a comentários e directs" acao={<Abrir to="/interno/automacoes">Abrir</Abrir>}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {([
              ['Ativas', nf.format(automacoes.ativas), NEON],
              ['Disparos', nf.format(automacoes.disparos), '#F4F2EA'],
              ['DMs enviadas', nf.format(automacoes.dms), VERDE],
              ['Cliques', nf.format(automacoes.cliques), AZUL],
            ] as const).map(([l, v, c]) => (
              <div key={l}>
                <p className="app-eyebrow">{l}</p>
                <p className="app-titulo mt-1.5 text-[34px]" style={{ color: c }}>{v}</p>
              </div>
            ))}
          </div>
          {automacoes.ativas === 0 && (
            <p className="mt-5 flex items-start gap-2 text-[12px] leading-snug text-white/45">
              <Zap size={13} className="mt-0.5 shrink-0 text-[#FFE14D]" />
              Nenhuma automação ativa. Um modelo pronto leva menos de um minuto para publicar.
            </p>
          )}
        </Superficie>
      </div>

      <p className="px-1 pb-2 text-[11px] leading-relaxed text-white/35">
        Alcance, impressões e visitas ao perfil não aparecem aqui porque a Meta exige acesso avançado a
        <span className="font-mono"> read_insights</span> para liberar esses números. Em vez de mostrar zero, deixamos de fora.
      </p>
    </div>
  );
}
